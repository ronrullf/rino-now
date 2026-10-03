import "server-only";
import { z } from "zod";
const positive = (v: number) => z.coerce.number().int().positive().default(v);
export const config = z
  .object({
    DATABASE_PATH: z.string().default("./data/xbox-comparator.sqlite"),
    APP_ORIGIN: z.url().default("http://127.0.0.1:3000"),
    DATA_MODE: z.enum(["live", "fixture"]).default("live"),
    FX_PROVIDER: z.enum(["frankfurter", "exchangerate"]).default("frankfurter"),
    FX_FALLBACK_PROVIDER: z
      .enum(["none", "frankfurter", "exchangerate"])
      .default("none"),
    EXCHANGERATE_API_KEY: z.string().default(""),
    SEARCH_TTL_SECONDS: positive(900),
    PRICE_TTL_SECONDS: positive(3600),
    PRICE_MAX_RANK_AGE_SECONDS: positive(21600),
    FX_TTL_SECONDS: positive(43200),
    FX_MAX_RATE_AGE_DAYS: positive(7),
    REFRESH_COOLDOWN_SECONDS: positive(30),
    UPSTREAM_TIMEOUT_MS: positive(8000),
  })
  .parse(process.env);
