import { Decimal } from "decimal.js";
export function currency(amount: string | null, code = "USD") {
  if (amount === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
  }).format(
    Number(
      new Decimal(amount)
        .toDecimalPlaces(code === "JPY" ? 0 : 2, Decimal.ROUND_HALF_UP)
        .toFixed(),
    ),
  );
}
export function savings(amount: string | null, percent: string | null) {
  if (amount === null) return "US comparison unavailable";
  const d = new Decimal(amount);
  if (d.isZero()) return "Same as US";
  return `${d.isPositive() ? "Save" : "Costs"} ${currency(d.abs().toFixed())}${d.isNegative() ? " more" : ""}${percent !== null ? ` (${new Decimal(percent).abs().toFixed(1)}%)` : ""}`;
}
