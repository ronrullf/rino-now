import { z } from "zod";
import { Decimal } from "decimal.js";
import type { FxSnapshot } from "../contracts";
export function parseFrankfurter(raw: unknown, at: string): FxSnapshot {
  const rows = z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        base: z.literal("USD"),
        quote: z.enum(["TRY", "INR", "JPY"]),
        rate: z.number().finite().positive(),
      }),
    )
    .parse(raw);
  const result: FxSnapshot = {};
  for (const r of rows) {
    if (Date.parse(r.date) > Date.parse(at) + 86400000)
      throw Error("Future FX date");
    result[r.quote] = {
      currency: r.quote,
      usdPerLocalUnit: new Decimal(1).div(r.rate).toFixed(),
      provider: "Frankfurter",
      effectiveDate: r.date,
      fetchedAt: at,
    };
  }
  return result;
}
