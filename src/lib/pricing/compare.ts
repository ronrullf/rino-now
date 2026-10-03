import { Decimal } from "decimal.js";
import type { Snapshot, FxSnapshot, RegionResult } from "../contracts";
export function compare(
  snapshots: Snapshot[],
  fx: FxSnapshot,
  at: string,
  maxPriceAge = 21600,
  maxFxDays = 7,
) {
  const now = Date.parse(at);
  const available = snapshots.filter((s) => s.status === "available");
  const keys = new Set(available.map((s) => s.entitlementKey));
  const regions: RegionResult[] = snapshots.map((s) => {
    const rate =
      s.currency === "USD"
        ? {
            currency: "USD" as const,
            usdPerLocalUnit: "1",
            effectiveDate: at.slice(0, 10),
            fetchedAt: at,
            provider: "Identity",
          }
        : (fx[s.currency] ?? null);
    const expired = !!s.offerEndAt && Date.parse(s.offerEndAt) <= now;
    const stale = !s.expiresAt || Date.parse(s.expiresAt) <= now;
    const priceOld =
      !s.fetchedAt || now - Date.parse(s.fetchedAt) > maxPriceAge * 1000;
    const fxOld =
      !rate ||
      now - Date.parse(`${rate.effectiveDate}T00:00:00Z`) >
        maxFxDays * 86400000 ||
      Date.parse(rate.effectiveDate) > now + 86400000;
    const usd =
      s.currentAmount !== null && rate
        ? new Decimal(s.currentAmount).mul(rate.usdPerLocalUnit).toFixed()
        : null;
    const rankingReason =
      s.status !== "available"
        ? s.reason
        : s.currentAmount === null
          ? "PRICE_MISSING"
          : !s.entitlementKey || keys.size !== 1
            ? "ENTITLEMENT_MISMATCH"
            : expired
              ? "OFFER_EXPIRED"
              : priceOld
                ? "PRICE_TOO_OLD"
                : !rate
                  ? "FX_MISSING"
                  : fxOld
                    ? "FX_TOO_OLD"
                    : null;
    return {
      ...s,
      lastAttemptAt: null,
      refreshError: null,
      fx: rate,
      usd,
      deltaUsd: null,
      deltaPercent: null,
      savingsUsd: null,
      savingsPercent: null,
      stale,
      rankEligible: rankingReason === null,
      rankingReason,
    };
  });
  const us = regions.find((r) => r.market === "US" && r.rankEligible);
  for (const r of regions) {
    if (
      r.rankEligible &&
      us?.usd !== null &&
      us?.usd !== undefined &&
      r.usd !== null
    ) {
      const difference = new Decimal(us.usd).minus(r.usd);
      r.savingsUsd = difference.toFixed();
      r.deltaUsd = difference.negated().toFixed();
      r.savingsPercent = new Decimal(us.usd).isZero()
        ? null
        : difference.div(us.usd).mul(100).toFixed();
      r.deltaPercent =
        r.savingsPercent === null
          ? null
          : new Decimal(r.savingsPercent).negated().toFixed();
    }
  }
  const eligible = regions.filter((r) => r.rankEligible && r.usd !== null);
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
  return { regions, winners };
}
