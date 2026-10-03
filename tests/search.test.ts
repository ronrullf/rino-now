import { readFileSync } from "node:fs";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { Repository } from "../src/lib/db/repository";
import { repository } from "../src/lib/db/client";
import { microsoftSearch } from "../src/lib/providers/microsoft";
import { search } from "../src/lib/services/search";
import {
  parseCatalog,
  catalogResponse,
} from "../src/lib/providers/catalog-parser";
vi.mock("../src/lib/db/client", () => ({ repository: vi.fn() }));
vi.mock("../src/lib/providers/microsoft", () => ({
  now: () => "2026-10-03T16:00:00.000Z",
  microsoftSearch: { search: vi.fn() },
}));
let db: Repository;
beforeEach(() => {
  db = new Repository(":memory:");
  vi.mocked(repository).mockReturnValue(db);
  vi.mocked(microsoftSearch.search).mockReset();
});
afterEach(() => db.close());
it("does not cache provider failure as a successful empty search", async () => {
  vi.mocked(microsoftSearch.search)
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValueOnce({
      products: [],
      source: "live",
      limited: false,
      warnings: [],
    });
  await expect(search("missing")).rejects.toMatchObject({ status: 503 });
  expect((await search("missing")).products).toEqual([]);
  await search("missing");
  expect(microsoftSearch.search).toHaveBeenCalledTimes(2);
});
it("returns cached-title matches with an explicit outage warning", async () => {
  const id = "9NKX70BBCDRN";
  const p = parseCatalog(
    JSON.parse(readFileSync(`tests/fixtures/${id}-US.json`, "utf8")),
    id,
    "US",
    "2026-10-03T16:00:00Z",
  ).product!;
  db.saveProduct(p);
  vi.mocked(microsoftSearch.search).mockRejectedValue(Error("offline"));
  const result = await search("Forza");
  expect(result.source).toBe("local");
  expect(result.products[0].id).toBe(id);
  expect(result.warnings[0]).toContain("temporarily unavailable");
});
it("parses captured title and DLC searches including a legitimate empty response", () => {
  for (const name of ["search", "search-dlc", "search-empty"])
    expect(
      catalogResponse.safeParse(
        JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8")),
      ).success,
    ).toBe(true);
});

it("filters categories before returning results and caches them separately", async () => {
  const raw = JSON.parse(
    readFileSync("tests/fixtures/9NKX70BBCDRN-US.json", "utf8"),
  );
  const game = parseCatalog(
    raw,
    "9NKX70BBCDRN",
    "US",
    "2026-10-03T16:00:00Z",
  ).product!;
  const dlc = {
    ...game,
    id: "9PNSZ7GMWCQZ",
    title: "Forza add-on",
    type: "dlc" as const,
  };
  vi.mocked(microsoftSearch.search).mockResolvedValue({
    products: [game, dlc],
    source: "live",
    limited: false,
    warnings: [],
  });
  expect((await search("Forza", "games")).products.map((p) => p.id)).toEqual([
    game.id,
  ]);
  expect((await search("Forza", "dlc")).products.map((p) => p.id)).toEqual([
    dlc.id,
  ]);
  expect((await search("Forza", "games")).source).toBe("cache");
});
