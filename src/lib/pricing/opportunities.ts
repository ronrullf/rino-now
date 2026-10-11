import { Decimal } from "decimal.js";
import type { Comparison, Product, RegionResult } from "../contracts";
export type OpportunityKind = "games" | "dlc" | "all";
export type Opportunity = {
  product: Product;
  cheapest: RegionResult;
  highest: RegionResult;
  countries: RegionResult["market"][];
  differenceUsd: string;
  differencePercent: string;
  comparedMarkets: number;
  sourcingCostUsd: string;
  referenceUsd: string;
  marginUsd: string;
  marginPercent: string;
  suggestedResaleUsd: string;
  projectedProfitUsd: string;
};
export type OpportunitiesPage = {
  items: Opportunity[];
  checked: number;
  selected: number;
  warnings: string[];
};
export function rankOpportunities(
  comparisons: Comparison[],
  kind: OpportunityKind = "games",
): Opportunity[] {
  const items: Opportunity[] = [];
  for (const c of comparisons) {
    if (kind !== "all") {
      if (
        kind === "dlc"
          ? c.product.type !== "dlc"
          : !["game", "bundle", "edition"].includes(c.product.type)
      )
        continue;
    }
    const eligible = c.regions
      .filter(
        (r) => r.rankEligible && !r.stale && !r.refreshError && r.usd !== null,
      )
      .sort((a, b) => new Decimal(a.usd!).cmp(b.usd!));
    if (eligible.length < 2) continue;
    const cheapest = eligible[0],
      highest = eligible[eligible.length - 1];
    const high = new Decimal(highest.usd!),
      cheap = new Decimal(cheapest.usd!),
      difference = high.minus(cheap);
    if (high.isZero() || difference.lessThan("0.01")) continue;

    // Suggested resale price at 20% discount below the benchmark retail price
    const suggestedResale = high.mul(0.8).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const projectedProfit = Decimal.max(0, suggestedResale.minus(cheap)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    items.push({
      product: c.product,
      cheapest,
      highest,
      countries: eligible
        .filter(
          (r) =>
            new Decimal(r.usd!).toFixed(2) ===
            new Decimal(cheapest.usd!).toFixed(2),
        )
        .map((r) => r.market),
      differenceUsd: difference.toFixed(),
      differencePercent: difference.div(high).mul(100).toFixed(),
      comparedMarkets: eligible.length,
      sourcingCostUsd: cheap.toFixed(2),
      referenceUsd: high.toFixed(2),
      marginUsd: difference.toFixed(2),
      marginPercent: difference.div(high).mul(100).toFixed(1),
      suggestedResaleUsd: suggestedResale.toFixed(2),
      projectedProfitUsd: projectedProfit.toFixed(2),
    });
  }
  return items.sort(
    (a, b) =>
      new Decimal(b.differencePercent).cmp(a.differencePercent) ||
      new Decimal(b.differenceUsd).cmp(a.differenceUsd) ||
      a.product.id.localeCompare(b.product.id),
  );
}
