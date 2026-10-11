import { describe, it, expect } from "vitest";
import {
  discoverMicrosoftGameIds,
  getMasterCatalog,
  CORE_XBOX_CATALOG_SEEDS,
} from "../src/lib/services/catalog-sync";

describe("catalog synchronization and master store catalog", () => {
  it("discovers core Xbox catalog seeds and Microsoft store IDs", async () => {
    const ids = await discoverMicrosoftGameIds();
    expect(ids.length).toBeGreaterThanOrEqual(CORE_XBOX_CATALOG_SEEDS.length);
    expect(ids).toContain("9NKX70BBCDRN"); // Forza Horizon 5
    expect(ids).toContain("9P8RQH67TTT1"); // Grand Theft Auto V
    expect(ids).toContain("9P3J32CTXLRZ"); // Elden Ring
  });

  it("retrieves the master catalog with 4 regional store structures and links", async () => {
    const result = await getMasterCatalog();
    expect(result).toBeDefined();
    expect(result.items).toBeDefined();
    expect(typeof result.total).toBe("number");
    expect(typeof result.syncedInDb).toBe("number");
    expect(typeof result.totalDiscoverable).toBe("number");

    // Check structure of items if any products in DB
    if (result.items.length > 0) {
      const first = result.items[0];
      expect(first.id).toBeDefined();
      expect(first.title).toBeDefined();
      expect(first.regions).toHaveLength(4);

      // Verify each of the 4 target markets is represented with official store links
      const markets = first.regions.map((r) => r.market);
      expect(markets).toContain("US");
      expect(markets).toContain("TR");
      expect(markets).toContain("IN");
      expect(markets).toContain("JP");

      for (const reg of first.regions) {
        expect(reg.storeUrl).toContain("https://www.xbox.com/");
        expect(reg.currency).toBeDefined();
        expect(reg.marketName).toBeDefined();
      }
    }
  });

  it("filters master catalog by query and min savings correctly", async () => {
    const result = await getMasterCatalog({
      query: "Forza",
      minSavings: 10,
    });
    for (const item of result.items) {
      expect(item.title.toLowerCase()).toContain("forza");
      if (item.differencePercent) {
        expect(Number(item.differencePercent)).toBeGreaterThanOrEqual(10);
      }
    }
  });
});
