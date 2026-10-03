import { describe, it, expect } from "vitest";
import { compare } from "../src/lib/pricing/compare";
import { parseFrankfurter } from "../src/lib/providers/fx-parser";
import { emptySnapshot } from "../src/lib/providers/catalog-parser";
import { currency, savings } from "../src/lib/pricing/format";
import type { Snapshot } from "../src/lib/contracts";
const at = "2026-10-03T16:00:00.000Z";
const fx = parseFrankfurter(
  [
    { date: "2026-10-03", base: "USD", quote: "TRY", rate: 40 },
    { date: "2026-10-03", base: "USD", quote: "INR", rate: 100 },
    { date: "2026-10-03", base: "USD", quote: "JPY", rate: 150 },
  ],
  at,
);
function s(
  m: Snapshot["market"],
  amount: string | null,
  overrides: Partial<Snapshot> = {},
): Snapshot {
  return {
    ...emptySnapshot("9NKX70BBCDRN", m),
    status: "available",
    reason: "PUBLIC_PURCHASE",
    currentAmount: amount,
    entitlementKey: "same",
    fetchedAt: at,
    expiresAt: "2026-10-03T17:00:00Z",
    ...overrides,
  };
}
describe("decimal comparison", () => {
  it("inverts USD-base FX once for all three currencies", () => {
    const r = compare(
      [s("US", "20"), s("TR", "400"), s("IN", "3000"), s("JP", "1500")],
      fx,
      at,
    );
    expect(r.regions.map((x) => Number(x.usd))).toEqual([20, 10, 30, 10]);
    expect(r.winners).toEqual(["TR", "JP"]);
    expect(r.regions[1].savingsPercent).toBe("50");
    expect(r.regions[2].savingsUsd).toBe("-10");
  });
  it("allows US to win", () =>
    expect(compare([s("US", "1"), s("TR", "400")], fx, at).winners).toEqual([
      "US",
    ]));
  it("ties by displayed cents with half-up rounding", () => {
    const r = compare([s("US", "10.004"), s("TR", "400.16")], fx, at);
    expect(r.winners).toEqual(["US", "TR"]);
    expect(currency("1.005")).toBe("$1.01");
  });
  it("ranks without US and removes savings", () => {
    const r = compare(
      [s("US", null, { status: "unavailable" }), s("TR", "400")],
      fx,
      at,
    );
    expect(r.winners).toEqual(["TR"]);
    expect(r.regions[1].savingsUsd).toBeNull();
  });
  it("never divides by zero and preserves true free prices", () => {
    const r = compare([s("US", "0"), s("TR", "400")], fx, at);
    expect(r.winners).toEqual(["US"]);
    expect(r.regions[1].savingsPercent).toBeNull();
    expect(r.regions[1].savingsUsd).toBe("-10");
  });
  it("does not turn missing price into zero", () => {
    const r = compare([s("US", null, { status: "unknown" })], fx, at);
    expect(r.regions[0].usd).toBeNull();
    expect(r.winners).toEqual([]);
  });
  it("keeps local prices when FX is absent", () => {
    const r = compare([s("TR", "400")], {}, at);
    expect(r.regions[0].currentAmount).toBe("400");
    expect(r.winners).toEqual([]);
  });
  it.each(["conditional_only", "ambiguous", "unavailable", "unknown"] as const)(
    "excludes %s",
    (status) =>
      expect(compare([s("TR", "0", { status })], fx, at).winners).toEqual([]),
  );
  it("excludes old price, old FX, and expired sales", () => {
    expect(
      compare([s("US", "1", { fetchedAt: "2026-10-01T00:00:00Z" })], fx, at)
        .winners,
    ).toEqual([]);
    expect(
      compare(
        [s("TR", "1")],
        { TRY: { ...fx.TRY!, effectiveDate: "2026-09-01" } },
        at,
      ).winners,
    ).toEqual([]);
    expect(
      compare([s("US", "1", { offerEndAt: "2026-10-02T00:00:00Z" })], fx, at)
        .winners,
    ).toEqual([]);
  });
  it("excludes mismatched entitlements conservatively", () =>
    expect(
      compare([s("US", "1"), s("TR", "1", { entitlementKey: "other" })], fx, at)
        .winners,
    ).toEqual([]));
  it("labels extra cost and formats JPY without decimals", () => {
    expect(savings("-2", "-10")).toBe("Costs $2.00 more (10.0%)");
    expect(currency("1200.4", "JPY")).toBe("¥1,200");
  });
  it("rejects nonpositive FX", () =>
    expect(() =>
      parseFrankfurter(
        [{ date: "2026-10-03", base: "USD", quote: "TRY", rate: 0 }],
        at,
      ),
    ).toThrow());
});
