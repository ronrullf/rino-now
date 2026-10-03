import "server-only";
import { z } from "zod";
import { Decimal } from "decimal.js";
import { upstream } from "../http/upstream";
import { config } from "../config";
import { fixture, now } from "./microsoft";
import { parseFrankfurter } from "./fx-parser";
import type { FxSnapshot } from "../contracts";
import { AppError } from "../errors";
async function fetchRates(
  provider: "frankfurter" | "exchangerate",
): Promise<FxSnapshot> {
  if (config.DATA_MODE === "fixture")
    return parseFrankfurter(await fixture("fx"), now());
  if (provider === "frankfurter")
    return parseFrankfurter(
      await upstream(
        "https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,INR,JPY",
      ),
      now(),
    );
  if (!config.EXCHANGERATE_API_KEY)
    throw new AppError(
      "FX_KEY_MISSING",
      "The configured FX provider needs an API key.",
      503,
    );
  const raw = await upstream(
    `https://v6.exchangerate-api.com/v6/${encodeURIComponent(config.EXCHANGERATE_API_KEY)}/latest/USD`,
  );
  const value = z
    .object({
      result: z.literal("success"),
      base_code: z.literal("USD"),
      time_last_update_unix: z.number().positive(),
      conversion_rates: z.record(z.string(), z.number().finite().positive()),
    })
    .parse(raw);
  const result: FxSnapshot = {};
  for (const currency of ["TRY", "INR", "JPY"] as const) {
    const rate = value.conversion_rates[currency];
    if (rate)
      result[currency] = {
        currency,
        usdPerLocalUnit: new Decimal(1).div(rate).toFixed(),
        provider: "ExchangeRate-API",
        effectiveDate: new Date(value.time_last_update_unix * 1000)
          .toISOString()
          .slice(0, 10),
        fetchedAt: now(),
      };
  }
  return result;
}
export async function getRates() {
  try {
    return await fetchRates(config.FX_PROVIDER);
  } catch (e) {
    if (
      config.FX_FALLBACK_PROVIDER !== "none" &&
      config.FX_FALLBACK_PROVIDER !== config.FX_PROVIDER
    )
      return fetchRates(config.FX_FALLBACK_PROVIDER);
    throw e;
  }
}
