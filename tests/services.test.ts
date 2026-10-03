import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../src/lib/db/repository";
import { ComparisonService } from "../src/lib/services/comparison";
import { parseCatalog } from "../src/lib/providers/catalog-parser";
import { parseFrankfurter } from "../src/lib/providers/fx-parser";
import type { Market } from "../src/lib/regions";
const id = "9NKX70BBCDRN";
const initial = "2026-10-03T16:00:00.000Z";
const repos: Repository[] = [];
afterEach(() => {
  repos.splice(0).forEach((r) => r.close());
});
function setup() {
  let at = initial;
  let fail = false;
  const repo = new Repository(":memory:");
  repos.push(repo);
  const getProduct = vi.fn(async (productId: string, market: Market) => {
    if (fail && market === "TR") throw Error("network");
    return parseCatalog(
      JSON.parse(readFileSync(`tests/fixtures/${id}-${market}.json`, "utf8")),
      productId,
      market,
      at,
    );
  });
  const fx = vi.fn(async () =>
    parseFrankfurter(
      JSON.parse(readFileSync("tests/fixtures/fx.json", "utf8")),
      at,
    ),
  );
  return {
    repo,
    getProduct,
    fx,
    service: new ComparisonService(repo, { getProduct }, fx, () => at),
    advance: () => {
      at = "2026-10-03T18:00:00.000Z";
    },
    fail: () => {
      fail = true;
    },
  };
}
describe("comparison services", () => {
  it("deduplicates concurrent cold lookups and uses warm cache", async () => {
    const t = setup();
    await Promise.all([t.service.get(id), t.service.get(id)]);
    expect(t.getProduct).toHaveBeenCalledTimes(4);
    expect(t.fx).toHaveBeenCalledTimes(1);
    await t.service.get(id);
    expect(t.getProduct).toHaveBeenCalledTimes(4);
  });
  it("preserves snapshots and successful timestamps after partial refresh failure", async () => {
    const t = setup();
    await t.service.get(id);
    t.advance();
    t.fail();
    const result = await t.service.get(id, { refresh: true });
    const tr = result.regions.find((r) => r.market === "TR")!;
    expect(tr.fetchedAt).toBe(initial);
    expect(tr.lastAttemptAt).toBe("2026-10-03T18:00:00.000Z");
    expect(tr.refreshError).not.toBeNull();
    expect(result.regions.find((r) => r.market === "US")!.fetchedAt).not.toBe(
      initial,
    );
  });
  it("returns stale data without unawaited refresh work", async () => {
    const t = setup();
    await t.service.get(id);
    t.advance();
    const r = await t.service.get(id);
    expect(r.refreshNeeded).toBe(true);
    expect(t.getProduct).toHaveBeenCalledTimes(4);
  });
  it("enforces manual refresh cooldown", async () => {
    const t = setup();
    await t.service.get(id);
    await t.service.get(id, { refresh: true });
    await expect(t.service.get(id, { refresh: true })).rejects.toMatchObject({
      status: 429,
    });
  });
  it("errors on entirely failed uncached lookup", async () => {
    const repo = new Repository(":memory:");
    repos.push(repo);
    const service = new ComparisonService(
      repo,
      {
        getProduct: async () => {
          throw Error();
        },
      },
      async () => ({}),
      () => initial,
    );
    await expect(service.get(id)).rejects.toMatchObject({ status: 503 });
    expect(repo.product(id)).toBeNull();
  });
  it("idempotent watchlist and bounded recent selections", async () => {
    const t = setup();
    const { product } = await t.getProduct(id, "US");
    for (let i = 0; i < 55; i++) {
      const pid = String(i).padStart(12, "0");
      t.repo.saveProduct({ ...product!, id: pid });
      t.repo.recordRecent(
        pid,
        new Date(Date.parse(initial) + i * 1000).toISOString(),
      );
    }
    expect(t.repo.recent()).toHaveLength(50);
    t.repo.saveProduct(product!);
    t.repo.saveWatch(id, initial);
    t.repo.saveWatch(id, initial);
    expect(t.repo.watchlist()).toHaveLength(1);
    t.repo.removeWatch(id);
    expect(t.repo.watchlist()).toHaveLength(0);
  });
  it("migrates and persists across reopening a database", () => {
    const dir = mkdtempSync(join(tmpdir(), "region-test-"));
    try {
      const path = join(dir, "db.sqlite");
      const repo = new Repository(path);
      const p = parseCatalog(
        JSON.parse(readFileSync(`tests/fixtures/${id}-US.json`, "utf8")),
        id,
        "US",
        initial,
      ).product!;
      repo.saveProduct(p);
      repo.saveWatch(id, initial);
      repo.sqlite.pragma("user_version = 1");
      repo.close();
      const reopened = new Repository(path);
      expect(reopened.watchlist()[0].id).toBe(id);
      expect(reopened.sqlite.pragma("user_version", { simple: true })).toBe(2);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
