import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseCatalog,
  catalogResponse,
} from "../src/lib/providers/catalog-parser";
import { productId } from "../src/lib/security/inputs";
import { markets, type Market } from "../src/lib/regions";
const at = "2026-10-03T16:00:00.000Z";
const fixture = (id: string, m: Market) =>
  catalogResponse.parse(
    JSON.parse(
      readFileSync(`tests/fixtures/regressions/${id}-${m}.json`, "utf8"),
    ),
  );
describe("live catalog regressions", () => {
  it.each([
    "9NCJB85WM01G",
    "9NNZSNHLR63L",
    "9PJGM0T0827V",
    "C22JNR2SLS6T",
    "BT5P2X999VH2",
  ])("recognizes public offers for %s", (id) => {
    const results = markets.map(
      (m) => parseCatalog(fixture(id, m), id, m, at).snapshot,
    );
    for (const s of results)
      expect(s.status, s.market + ": " + s.reason).toBe("available");
    expect(new Set(results.map((s) => s.entitlementKey)).size).toBe(1);
  });
  it("recognizes repurchasable V-Bucks and preserves actual Turkish absence", () => {
    const id = "9N16XHX3MB1R";
    for (const m of markets) {
      const r = parseCatalog(fixture(id, m), id, m, at);
      expect(r.product?.type).toBe("dlc");
      expect(r.snapshot.status).toBe(m === "TR" ? "unavailable" : "available");
      if (m !== "TR") expect(r.snapshot.purchaseKind).toBe("consumable");
    }
  });
  it("does not treat unknown payment constraints as public", () => {
    const id = "9NCJB85WM01G",
      raw = fixture(id, "US");
    for (const entry of raw.Products[0].DisplaySkuAvailabilities)
      for (const a of entry.Availabilities)
        a.OrderManagementData.PIFilter = {
          InclusionProperties: ["unknown_rule"],
        };
    expect(parseCatalog(raw, id, "US", at).snapshot.status).toBe(
      "conditional_only",
    );
  });
  it("requires a verified parent and single full SKU for package-less add-ons", () => {
    const id = "9NCJB85WM01G",
      raw = fixture(id, "US");
    raw.Products[0].MarketProperties = [];
    expect(parseCatalog(raw, id, "US", at).snapshot.status).toBe("ambiguous");
    const multiple = fixture(id, "US");
    multiple.Products[0].DisplaySkuAvailabilities.push(
      structuredClone(multiple.Products[0].DisplaySkuAvailabilities[0]),
    );
    expect(parseCatalog(multiple, id, "US", at).snapshot.status).toBe(
      "ambiguous",
    );
  });
  it("distinguishes consumable quantities across regions", () => {
    const id = "9N16XHX3MB1R",
      raw = fixture(id, "US");
    const original = parseCatalog(raw, id, "US", at).snapshot.entitlementKey;
    raw.Products[0].DisplaySkuAvailabilities[0].Sku.Properties.ConsumableQuantity = 2;
    expect(parseCatalog(raw, id, "US", at).snapshot.entitlementKey).not.toBe(
      original,
    );
  });
  it("accepts official SKU-suffixed Xbox links", () => {
    expect(
      productId(
        "https://www.xbox.com/en-US/games/store/fortnite-800-v-bucks/9N16XHX3MB1R/0010",
      ),
    ).toBe("9N16XHX3MB1R");
    expect(() =>
      productId(
        "https://www.xbox.com/en-US/games/store/fortnite/9N16XHX3MB1R/0010/evil",
      ),
    ).toThrow();
  });
});
