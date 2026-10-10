import { describe, it, expect } from "vitest";
import { calculateBasket, type BasketEntry } from "../src/lib/pricing/basket";
import type { Comparison, Product, RegionResult } from "../src/lib/contracts";

function createMockProduct(id: string, title: string, type: Product["type"] = "game"): Product {
  return {
    id,
    title,
    type,
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
  rankEligible = true,
): RegionResult {
  return {
    productId: "TEST00000001",
    market,
    currency,
    observedCurrency: currency,
    status: currentAmount ? "available" : "unavailable",
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
    storeUrl: `https://store.xbox.com/${market}/test`,
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
    rankEligible,
    rankingReason: null,
  };
}

describe("Basket purchasing planner calculation", () => {
  it("calculates optimal cross-store hybrid strategy accurately", () => {
    // Game 1: Cheapest in TR ($15.00 vs US $60.00)
    const product1 = createMockProduct("9NKX70BBCDR1", "Game One");
    const comparison1: Comparison = {
      product: product1,
      winners: ["TR"],
      warnings: [],
      refreshNeeded: false,
      saved: false,
      demo: false,
      nextRefreshAt: null,
      regions: [
        createMockRegion("US", "USD", "60.00", "60.00"),
        createMockRegion("TR", "TRY", "500.00", "15.00"),
        createMockRegion("IN", "INR", "2500.00", "30.00"),
        createMockRegion("JP", "JPY", "7000", "45.00"),
      ],
    };

    // Game 2: Cheapest in JP ($20.00 vs US $40.00)
    const product2 = createMockProduct("9NKX70BBCDR2", "Game Two");
    const comparison2: Comparison = {
      product: product2,
      winners: ["JP"],
      warnings: [],
      refreshNeeded: false,
      saved: false,
      demo: false,
      nextRefreshAt: null,
      regions: [
        createMockRegion("US", "USD", "40.00", "40.00"),
        createMockRegion("TR", "TRY", "900.00", "28.00"),
        createMockRegion("IN", "INR", "2200.00", "25.00"),
        createMockRegion("JP", "JPY", "3100", "20.00"),
      ],
    };

    const entries: BasketEntry[] = [
      { product: product1, comparison: comparison1, addedAt: "2026-10-10T12:00:00Z" },
      { product: product2, comparison: comparison2, addedAt: "2026-10-10T12:00:00Z" },
    ];

    const result = calculateBasket(entries);

    // Hybrid optimal picks: Game 1 from TR ($15), Game 2 from JP ($20) -> Total $35
    expect(result.hybrid.totalUsd).toBe("35.00");
    // US Baseline: 60 + 40 = 100
    expect(result.hybrid.totalBaselineUsd).toBe("100.00");
    // Total savings: 100 - 35 = 65
    expect(result.hybrid.savingsUsd).toBe("65.00");
    expect(result.hybrid.savingsPercent).toBe("65.0");

    expect(result.hybrid.marketBreakdown).toEqual({
      US: 0,
      TR: 1,
      IN: 0,
      JP: 1,
    });
  });

  it("calculates single-market totals and complete status", () => {
    const product = createMockProduct("9NKX70BBCDR1", "Game One");
    const comparison: Comparison = {
      product,
      winners: ["TR"],
      warnings: [],
      refreshNeeded: false,
      saved: false,
      demo: false,
      nextRefreshAt: null,
      regions: [
        createMockRegion("US", "USD", "50.00", "50.00"),
        createMockRegion("TR", "TRY", "600.00", "18.00"),
        createMockRegion("IN", "INR", "1800.00", "22.00"),
        createMockRegion("JP", "JPY", "4500", "30.00"),
      ],
    };

    const entries: BasketEntry[] = [
      { product, comparison, addedAt: "2026-10-10T12:00:00Z" },
    ];

    const result = calculateBasket(entries);

    expect(result.byMarket.US.complete).toBe(true);
    expect(result.byMarket.US.totalUsd).toBe("50.00");

    expect(result.byMarket.TR.complete).toBe(true);
    expect(result.byMarket.TR.totalUsd).toBe("18.00");
    expect(result.byMarket.TR.savingsUsd).toBe("32.00");
    expect(result.byMarket.TR.savingsPercent).toBe("64.0");

    expect(result.byMarket.IN.complete).toBe(true);
    expect(result.byMarket.IN.totalUsd).toBe("22.00");

    expect(result.byMarket.JP.complete).toBe(true);
    expect(result.byMarket.JP.totalUsd).toBe("30.00");
  });

  it("handles empty basket cleanly", () => {
    const result = calculateBasket([]);
    expect(result.hybrid.totalUsd).toBe("0.00");
    expect(result.hybrid.totalBaselineUsd).toBe("0.00");
    expect(result.hybrid.savingsUsd).toBe("0.00");
    expect(result.hybrid.savingsPercent).toBeNull();
  });
});
