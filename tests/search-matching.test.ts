import { describe, it, expect } from "vitest";
import { searchTerms, rankProducts } from "../src/lib/search/matching";
import type { Product } from "../src/lib/contracts";
const product = (
  id: string,
  title: string,
  type: Product["type"] = "game",
): Product => ({
  id,
  title,
  type,
  publisher: null,
  cover: null,
  platforms: ["Windows.Xbox"],
  sourceMarket: "US",
  metadataFetchedAt: "2026-10-03T00:00:00Z",
});
describe("forgiving search", () => {
  it("expands abbreviations and corrects small spelling mistakes", () => {
    expect(searchTerms("GTA V")).toContain("grand theft auto v");
    expect(searchTerms("fortnit")).toContain("fortnite");
    expect(searchTerms("forza horizn")).toContain("forza horizon");
    expect(searchTerms("vbucks")).toContain("v bucks");
    expect(searchTerms("forza horizon premium edition")).toHaveLength(2);
  });
  it("matches fragments, reordered words and punctuation", () => {
    const p = product("A", "Forza Horizon 5");
    for (const q of ["forza hor", "horizon forza", "FORZA: HORIZON"])
      expect(rankProducts([p], searchTerms(q), "games")).toEqual([p]);
  });
  it("keeps games and DLCs separate and deduplicates products", () => {
    const game = product("A", "Fortnite"),
      dlc = product("B", "Fortnite - 800 V-Bucks", "dlc");
    expect(rankProducts([game, dlc, game], ["fortnite"], "games")).toEqual([
      game,
    ]);
    expect(rankProducts([game, dlc], ["fortnite"], "dlc")).toEqual([dlc]);
    expect(rankProducts([game, dlc], ["minecraft"], "all")).toEqual([]);
  });
});
