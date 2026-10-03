import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseCatalog,
  catalogResponse,
} from "../src/lib/providers/catalog-parser";
import { productId } from "../src/lib/security/inputs";
const at = "2026-10-03T16:00:00.000Z";
const id = "9NKX70BBCDRN";
const raw = () =>
  catalogResponse.parse(
    JSON.parse(readFileSync(`tests/fixtures/${id}-US.json`, "utf8")),
  );
describe("Microsoft adapter", () => {
  it("selects the public sale, never zero-price membership access", () => {
    const r = parseCatalog(raw(), id, "US", at);
    expect(r.snapshot.currentAmount).toBe("23.99");
    expect(r.snapshot.availabilityId).toBe("B2BMMHL30X4B");
    expect(r.snapshot.status).toBe("available");
  });
  it("matches actual bundle entitlements across all four markets", () => {
    const keys = ["US", "TR", "IN", "JP"].map(
      (m) =>
        parseCatalog(
          JSON.parse(readFileSync(`tests/fixtures/${id}-${m}.json`, "utf8")),
          id,
          m as "US",
          at,
        ).snapshot.entitlementKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toContain("9NNX1VVR3KNQ");
  });
  it("recognizes durable DLC from metadata", () => {
    const dlc = "9PNSZ7GMWCQZ";
    expect(
      parseCatalog(
        JSON.parse(readFileSync(`tests/fixtures/${dlc}-US.json`, "utf8")),
        dlc,
        "US",
        at,
      ).product?.type,
    ).toBe("dlc");
  });
  it("distinguishes confirmed absence from malformed response", () => {
    expect(parseCatalog({ Products: [] }, id, "US", at).snapshot.status).toBe(
      "unavailable",
    );
    expect(() => parseCatalog({}, id, "US", at)).toThrow();
  });
  it("rejects identity, currency, and invalid amounts", () => {
    expect(() => parseCatalog(raw(), "000000000000", "US", at)).toThrow();
    const r = raw();
    r.Products[0].DisplaySkuAvailabilities[0].Availabilities[0].OrderManagementData.Price.CurrencyCode =
      "EUR";
    expect(() => parseCatalog(r, id, "US", at)).toThrow();
    r.Products[0].DisplaySkuAvailabilities[0].Availabilities[0].OrderManagementData.Price.ListPrice =
      -1;
    expect(() => parseCatalog(r, id, "US", at)).toThrow();
  });
  it("rejects trials and subscriptions", () => {
    for (const key of ["IsTrial", "subscription"]) {
      const r = raw();
      for (const s of r.Products[0].DisplaySkuAvailabilities) {
        if (key === "IsTrial") s.Sku.Properties.IsTrial = true;
        else s.Sku.SubscriptionPolicyId = "subscription";
      }
      expect(parseCatalog(r, id, "US", at).snapshot.status).not.toBe(
        "available",
      );
    }
  });
  it("requires known entitlement evidence", () => {
    const r = raw();
    for (const s of r.Products[0].DisplaySkuAvailabilities) {
      s.Sku.Properties.BundledSkus = [];
      s.Sku.Properties.FulfillmentData = null;
    }
    expect(parseCatalog(r, id, "US", at).snapshot.status).toBe("ambiguous");
  });
  it("expires cache at sale expiry", () => {
    const r = parseCatalog(raw(), id, "US", "2026-10-08T09:59:00Z");
    expect(r.snapshot.expiresAt).toBe("2026-10-08T09:59:59.000Z");
  });
  it("rejects unknown eligibility constraints", () => {
    const r = raw();
    for (const s of r.Products[0].DisplaySkuAvailabilities)
      for (const a of s.Availabilities)
        a.Conditions.RequiredEntitlement = "something";
    expect(parseCatalog(r, id, "US", at).snapshot.status).toBe(
      "conditional_only",
    );
  });
});
describe("safe product input", () => {
  it("extracts supported Xbox URLs and normalizes IDs", () => {
    expect(
      productId("https://www.xbox.com/en-US/games/store/game/9nkx70bbcdrn"),
    ).toBe(id);
    expect(productId(id.toLowerCase())).toBe(id);
  });
  it.each([
    "http://127.0.0.1/x",
    "https://evil.example/" + id,
    "https://www.xbox.com.evil.example/en-US/games/store/game/" + id,
    "https://user@www.xbox.com/en-US/games/store/game/" + id,
    "https://www.xbox.com:444/en-US/games/store/game/" + id,
    "https://www.xbox.com/en-US/other/" + id,
  ])("rejects unsafe URL %s", (url) => expect(() => productId(url)).toThrow());
});
