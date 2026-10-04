import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BrowserLibrary } from "../src/lib/browser-library";
import { parseCatalog } from "../src/lib/providers/catalog-parser";
import { compare } from "../src/lib/pricing/compare";
import type { Comparison } from "../src/lib/contracts";
const at = "2026-10-03T16:00:00Z";
const { product, snapshot } = parseCatalog(
  JSON.parse(readFileSync("tests/fixtures/9NKX70BBCDRN-US.json", "utf8")),
  "9NKX70BBCDRN",
  "US",
  at,
);
const c: Comparison = {
  product: product!,
  ...compare([snapshot], {}, at),
  warnings: [],
  refreshNeeded: false,
  saved: false,
  demo: false,
  nextRefreshAt: null,
};
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
}
describe("browser saved games", () => {
  it("persists across new instances without any server database", () => {
    const disk = storage(),
      first = new BrowserLibrary(disk);
    first.save(c);
    first.record(c.product);
    const reopened = new BrowserLibrary(disk);
    expect(reopened.has(c.product.id)).toBe(true);
    expect(reopened.list(at)[0].product.id).toBe(c.product.id);
    expect(reopened.list(at)[0].comparison.winners).toEqual([]);
    expect(reopened.list(at)[0].comparison.regions[0].rankEligible).toBe(false);
    expect(reopened.recent()).toHaveLength(1);
    reopened.save(c);
    expect(reopened.list()).toHaveLength(1);
    reopened.remove(c.product.id);
    expect(first.has(c.product.id)).toBe(false);
  });
  it("handles malformed storage and reports blocked writes", () => {
    const library = new BrowserLibrary({
      getItem: () => "{invalid",
      setItem: () => {
        throw Error("QuotaExceededError");
      },
    });
    expect(library.list()).toEqual([]);
    expect(() => library.save(c)).toThrow("Browser storage is full or blocked");
  });
  it("keeps separate browsers isolated", () => {
    const a = new BrowserLibrary(storage()),
      b = new BrowserLibrary(storage());
    a.save(c);
    expect(b.list()).toEqual([]);
  });
});
