import { Decimal } from "decimal.js";
import type { Comparison, Product, RegionResult } from "../contracts";
export type Opportunity = {
  product: Product;
  cheapest: RegionResult;
  highest: RegionResult;
  countries: RegionResult["market"][];
  differenceUsd: string;
  differencePercent: string;
  comparedMarkets: number;
};
export type OpportunitiesPage = {
  items: Opportunity[];
  checked: number;
  selected: number;
  warnings: string[];
};
export function rankOpportunities(comparisons: Comparison[]): Opportunity[] {
  const items: Opportunity[] = [];
  for (const c of comparisons) {
    if (!["game", "bundle", "edition"].includes(c.product.type)) continue;
    const eligible = c.regions
      .filter(
        (r) => r.rankEligible && !r.stale && !r.refreshError && r.usd !== null,
      )
      .sort((a, b) => new Decimal(a.usd!).cmp(b.usd!));
    if (eligible.length < 2) continue;
    const cheapest = eligible[0],
      highest = eligible[eligible.length - 1];
    const high = new Decimal(highest.usd!),
      difference = high.minus(cheapest.usd!);
    if (high.isZero() || difference.lessThan("0.01")) continue;
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
    });
  }
  return items
    .sort(
      (a, b) =>
        new Decimal(b.differencePercent).cmp(a.differencePercent) ||
        new Decimal(b.differenceUsd).cmp(a.differenceUsd) ||
        a.product.id.localeCompare(b.product.id),
    )
    .slice(0, 6);
}
