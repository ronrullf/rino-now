import { describe, it, expect } from "vitest";
import { adjustUsdWithFee, applyCardFee } from "../src/lib/pricing/fx-fees";
import type { Comparison, Product, RegionResult } from "../src/lib/contracts";

function createMockProduct(id: string): Product {
  return {
    id,
    title: "Test Game",
    type: "game",
    publisher: "Test Publisher",
    cover: null,
    platforms: ["Windows.Xbox"],
    metadataFetchedAt: "2026-10-10T12:00:00Z",
    sourceMarket: "US",
  };
}

function createMockRegion(
  market: RegionResult["market"],
  currency: RegionResult["currency"],
  currentAmount: string | null,
  usd: string | null,
): RegionResult {
  return {
    productId: "9NKX70BBCDRN",
    market,
    currency,
    observedCurrency: currency,
    status: "available",
    reason: "TEST",
    currentAmount,
    regularAmount: null,
    skuId: "0001",
    availabilityId: "0001",
    entitlementKey: "KEY1",
    purchaseKind: "game",
    eligibility: "public",
    platforms: ["Windows.Xbox"],
    regionalTitle: null,
    saleEndAt: null,
    offerEndAt: null,
    storeUrl: "https://store.xbox.com",
    fetchedAt: "2026-10-10T12:00:00Z",
    expiresAt: "2026-10-10T13:00:00Z",
    lastAttemptAt: null,
    refreshError: null,
    fx: null,
    usd,
    deltaUsd: null,
    deltaPercent: null,
    savingsUsd: null,
    savingsPercent: null,
    stale: false,
    rankEligible: true,
    rankingReason: null,
  };
}

describe("Foreign transaction fee calculation", () => {
  it("does not adjust US prices with card fees", () => {
    expect(adjustUsdWithFee("59.99", "US", 2.5)).toBe("59.99");
    expect(adjustUsdWithFee("59.99", "US", 0)).toBe("59.99");
  });

  it("applies card fee percentage to foreign currencies", () => {
    // 20.00 * 1.025 = 20.50
    expect(adjustUsdWithFee("20.00", "TR", 2.5)).toBe("20.50");
    // 100.00 * 1.015 = 101.50
    expect(adjustUsdWithFee("100.00", "IN", 1.5)).toBe("101.50");
    // 0% fee leaves price unchanged
    expect(adjustUsdWithFee("20.00", "TR", 0)).toBe("20.00");
  });

  it("recalculates comparison savings and rank with fee applied", () => {
    const product = createMockProduct("9NKX70BBCDRN");
    const comparison: Comparison = {
      product,
      winners: ["TR"],
      warnings: [],
      refreshNeeded: false,
      saved: false,
      demo: false,
      nextRefreshAt: null,
      regions: [
        createMockRegion("US", "USD", "60.00", "60.00"),
        createMockRegion("TR", "TRY", "600.00", "20.00"),
        createMockRegion("IN", "INR", "2000.00", "25.00"),
        createMockRegion("JP", "JPY", "4000", "30.00"),
      ],
    };

    // Apply 3.0% fee
    const adjusted = applyCardFee(comparison, 3.0);

    const us = adjusted.regions.find((r) => r.market === "US")!;
    const tr = adjusted.regions.find((r) => r.market === "TR")!;

    expect(us.usd).toBe("60.00");
    // 20.00 * 1.03 = 20.60
    expect(tr.usd).toBe("20.60");
    // Savings: 60.00 - 20.60 = 39.40
    expect(tr.savingsUsd).toBe("39.40");
    expect(adjusted.winners).toEqual(["TR"]);
  });
});
