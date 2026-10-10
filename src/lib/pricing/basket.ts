import { Decimal } from "decimal.js";
import type { Comparison, Product, Snapshot } from "../contracts";
import { markets } from "../regions";

export type BasketEntry = {
  product: Product;
  comparison: Comparison | null;
  addedAt: string;
};

export type HybridItemPlan = {
  product: Product;
  chosenMarket: Snapshot["market"] | null;
  chosenCurrency: Snapshot["currency"] | null;
  localAmount: string | null;
  usd: string | null;
  usBaselineUsd: string | null;
  storeUrl: string | null;
  status: "optimal" | "us_only" | "unavailable";
};

export type HybridPlanSummary = {
  items: HybridItemPlan[];
  totalUsd: string;
  totalBaselineUsd: string;
  savingsUsd: string;
  savingsPercent: string | null;
  marketBreakdown: Record<Snapshot["market"], number>;
};

export type SingleMarketSummary = {
  market: Snapshot["market"];
  currency: Snapshot["currency"];
  complete: boolean;
  availableCount: number;
  totalItems: number;
  totalLocal: string | null;
  totalUsd: string | null;
  savingsUsd: string | null;
  savingsPercent: string | null;
};

export type BasketCalculation = {
  hybrid: HybridPlanSummary;
  byMarket: Record<Snapshot["market"], SingleMarketSummary>;
};

export function calculateBasket(entries: BasketEntry[]): BasketCalculation {
  const hybridItems: HybridItemPlan[] = [];
  const marketCounts: Record<Snapshot["market"], number> = {
    US: 0,
    TR: 0,
    IN: 0,
    JP: 0,
  };

  let totalHybridUsd = new Decimal(0);
  let totalBaselineUsd = new Decimal(0);

  for (const entry of entries) {
    const comp = entry.comparison;
    const usRegion = comp?.regions.find((r) => r.market === "US" && r.rankEligible);
    const usBaselineUsd = usRegion?.usd ?? null;

    if (usBaselineUsd) {
      totalBaselineUsd = totalBaselineUsd.plus(usBaselineUsd);
    }

    if (!comp) {
      hybridItems.push({
        product: entry.product,
        chosenMarket: null,
        chosenCurrency: null,
        localAmount: null,
        usd: null,
        usBaselineUsd,
        storeUrl: null,
        status: "unavailable",
      });
      continue;
    }

    const eligible = comp.regions.filter((r) => r.rankEligible && r.usd !== null);

    if (!eligible.length) {
      hybridItems.push({
        product: entry.product,
        chosenMarket: null,
        chosenCurrency: null,
        localAmount: null,
        usd: null,
        usBaselineUsd,
        storeUrl: null,
        status: "unavailable",
      });
      continue;
    }

    // Pick cheapest comparable region
    const bestRegion = [...eligible].sort((a, b) =>
      new Decimal(a.usd!).cmp(new Decimal(b.usd!)),
    )[0];

    marketCounts[bestRegion.market]++;
    totalHybridUsd = totalHybridUsd.plus(bestRegion.usd!);

    hybridItems.push({
      product: entry.product,
      chosenMarket: bestRegion.market,
      chosenCurrency: bestRegion.currency,
      localAmount: bestRegion.currentAmount,
      usd: bestRegion.usd,
      usBaselineUsd,
      storeUrl: bestRegion.storeUrl,
      status: bestRegion.market === "US" ? "us_only" : "optimal",
    });
  }

  const savingsUsd = totalBaselineUsd.minus(totalHybridUsd);
  const savingsPercent = totalBaselineUsd.isZero()
    ? null
    : savingsUsd.div(totalBaselineUsd).mul(100).toFixed(1);

  const hybrid: HybridPlanSummary = {
    items: hybridItems,
    totalUsd: totalHybridUsd.toFixed(2),
    totalBaselineUsd: totalBaselineUsd.toFixed(2),
    savingsUsd: savingsUsd.toFixed(2),
    savingsPercent,
    marketBreakdown: marketCounts,
  };

  const byMarket: Record<Snapshot["market"], SingleMarketSummary> = {
    US: {
      market: "US",
      currency: "USD",
      complete: false,
      availableCount: 0,
      totalItems: entries.length,
      totalLocal: null,
      totalUsd: null,
      savingsUsd: null,
      savingsPercent: null,
    },
    TR: {
      market: "TR",
      currency: "TRY",
      complete: false,
      availableCount: 0,
      totalItems: entries.length,
      totalLocal: null,
      totalUsd: null,
      savingsUsd: null,
      savingsPercent: null,
    },
    IN: {
      market: "IN",
      currency: "INR",
      complete: false,
      availableCount: 0,
      totalItems: entries.length,
      totalLocal: null,
      totalUsd: null,
      savingsUsd: null,
      savingsPercent: null,
    },
    JP: {
      market: "JP",
      currency: "JPY",
      complete: false,
      availableCount: 0,
      totalItems: entries.length,
      totalLocal: null,
      totalUsd: null,
      savingsUsd: null,
      savingsPercent: null,
    },
  };

  for (const m of markets) {
    let availableCount = 0;
    let localSum = new Decimal(0);
    let usdSum = new Decimal(0);
    let hasUsd = true;

    for (const entry of entries) {
      const region = entry.comparison?.regions.find(
        (r) => r.market === m && r.currentAmount !== null,
      );
      if (region && region.currentAmount !== null) {
        availableCount++;
        localSum = localSum.plus(region.currentAmount);
        if (region.usd !== null) {
          usdSum = usdSum.plus(region.usd);
        } else {
          hasUsd = false;
        }
      }
    }

    const complete = entries.length > 0 && availableCount === entries.length;
    let savingsUsd: string | null = null;
    let savingsPercent: string | null = null;

    if (hasUsd && totalBaselineUsd.greaterThan(0)) {
      const diff = totalBaselineUsd.minus(usdSum);
      savingsUsd = diff.toFixed(2);
      savingsPercent = diff.div(totalBaselineUsd).mul(100).toFixed(1);
    }

    byMarket[m] = {
      market: m,
      currency: byMarket[m].currency,
      complete,
      availableCount,
      totalItems: entries.length,
      totalLocal: availableCount > 0 ? localSum.toFixed(2) : null,
      totalUsd: hasUsd && availableCount > 0 ? usdSum.toFixed(2) : null,
      savingsUsd,
      savingsPercent,
    };
  }

  return {
    hybrid,
    byMarket,
  };
}
