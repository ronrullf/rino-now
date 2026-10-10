import { Decimal } from "decimal.js";
import type { Comparison, RegionResult, Snapshot } from "../contracts";

export const CARD_FEE_PRESETS = [0, 1.5, 2.5, 3.0] as const;
export type CardFeePreset = (typeof CARD_FEE_PRESETS)[number];

export function adjustUsdWithFee(
  usd: string | null,
  market: Snapshot["market"],
  feePercent: number,
): string | null {
  if (usd === null) return null;
  if (market === "US" || feePercent <= 0) return usd;
  return new Decimal(usd)
    .mul(new Decimal(1).plus(new Decimal(feePercent).div(100)))
    .toFixed(2);
}

export function applyCardFee(
  comparison: Comparison,
  feePercent: number,
): Comparison {
  if (feePercent <= 0) return comparison;

  const adjustedRegions: RegionResult[] = comparison.regions.map((r) => {
    if (!r.usd) return { ...r };
    const adjustedUsd = adjustUsdWithFee(r.usd, r.market, feePercent);
    return {
      ...r,
      usd: adjustedUsd,
    };
  });

  const us = adjustedRegions.find((r) => r.market === "US" && r.rankEligible);

  for (const r of adjustedRegions) {
    if (r.rankEligible && us?.usd !== null && us?.usd !== undefined && r.usd !== null) {
      const difference = new Decimal(us.usd).minus(r.usd);
      r.savingsUsd = difference.toFixed(2);
      r.deltaUsd = difference.negated().toFixed(2);
      r.savingsPercent = new Decimal(us.usd).isZero()
        ? null
        : difference.div(us.usd).mul(100).toFixed(1);
      r.deltaPercent =
        r.savingsPercent === null
          ? null
          : new Decimal(r.savingsPercent).negated().toFixed(1);
    }
  }

  const eligible = adjustedRegions.filter((r) => r.rankEligible && r.usd !== null);
  let winners: Snapshot["market"][] = [];
  if (eligible.length) {
    const best = Decimal.min(
      ...eligible.map((r) =>
        new Decimal(r.usd!).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      ),
    );
    winners = eligible
      .filter((r) =>
        new Decimal(r.usd!).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).eq(best),
      )
      .map((r) => r.market);
  }

  return {
    ...comparison,
    regions: adjustedRegions,
    winners,
  };
}
