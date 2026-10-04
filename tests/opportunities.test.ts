import { describe, it, expect } from "vitest";
import { rankOpportunities } from "../src/lib/pricing/opportunities";
import { emptySnapshot } from "../src/lib/providers/catalog-parser";
import { compare } from "../src/lib/pricing/compare";
import type { Comparison } from "../src/lib/contracts";
const at = "2026-10-03T16:00:00.000Z";
function comparison(id: string, us: string, tr: string): Comparison {
  const snapshots = (["US", "TR"] as const).map((m) => ({
    ...emptySnapshot(id, m),
    status: "available" as const,
    reason: "PUBLIC_PURCHASE",
    currentAmount: m === "US" ? us : tr,
    entitlementKey: id,
    purchaseKind: "ownership",
    fetchedAt: at,
    expiresAt: "2026-10-03T17:00:00Z",
    offerEndAt: "2026-10-04T00:00:00Z",
  }));
  return {
    product: {
      id,
      title: id,
      type: "game",
      publisher: null,
      cover: null,
      platforms: [],
      metadataFetchedAt: at,
      sourceMarket: "US",
    },
    ...compare(
      snapshots,
      {
        TRY: {
          currency: "TRY",
          usdPerLocalUnit: "1",
          provider: "test",
          effectiveDate: "2026-10-03",
          fetchedAt: at,
        },
      },
      at,
    ),
    warnings: [],
    refreshNeeded: false,
    saved: false,
    demo: false,
    nextRefreshAt: null,
  };
}
describe("home savings ranking", () => {
  it("orders by percentage gap, then absolute savings, across comparable countries", () => {
    const result = rankOpportunities([
      comparison("A", "60", "30"),
      comparison("B", "20", "5"),
      comparison("C", "100", "50"),
    ]);
    expect(result.map((r) => r.product.id)).toEqual(["B", "C", "A"]);
    expect(result[0].differencePercent).toBe("75");
    expect(result[0].differenceUsd).toBe("15");
    expect(result[0].cheapest.market).toBe("TR");
  });
  it("excludes DLC, stale data, failed refreshes and missing comparisons", () => {
    const dlc = comparison("A", "60", "30");
    dlc.product.type = "dlc";
    const stale = comparison("B", "60", "30");
    stale.regions[1].stale = true;
    const mismatch = comparison("C", "60", "30");
    mismatch.regions[1].rankEligible = false;
    const failure = comparison("D", "60", "30");
    failure.regions[1].refreshError = "network";
    expect(
      rankOpportunities([
        dlc,
        stale,
        mismatch,
        failure,
        comparison("E", "0", "0"),
        comparison("F", "10", "10"),
      ]),
    ).toEqual([]);
  });
  it("uses the highest region as the reference even when it is not the US", () => {
    const r = rankOpportunities([comparison("A", "10", "40")])[0];
    expect(r.highest.market).toBe("TR");
    expect(r.cheapest.market).toBe("US");
    expect(r.differencePercent).toBe("75");
  });
});

it("ranks DLCs independently and applies the same comparability rules", () => {
  const game = comparison("G", "100", "1");
  const addon = comparison("D", "40", "10");
  addon.product.type = "dlc";
  const stale = comparison("S", "50", "1");
  stale.product.type = "dlc";
  stale.regions[0].stale = true;
  expect(
    rankOpportunities([game, addon, stale], "dlc").map((r) => r.product.id),
  ).toEqual(["D"]);
  expect(rankOpportunities([addon], "dlc")[0].differencePercent).toBe("75");
  expect(
    rankOpportunities([game, addon], "games").map((r) => r.product.id),
  ).toEqual(["G"]);
});
it("returns all ranked candidates so the UI can expand beyond six", () => {
  const results = rankOpportunities(
    Array.from({ length: 10 }, (_, i) =>
      comparison(String(i), "100", String(i + 1)),
    ),
  );
  expect(results).toHaveLength(10);
  expect(results.map((r) => r.product.id)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);
});
