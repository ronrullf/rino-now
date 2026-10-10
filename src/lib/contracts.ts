import { z } from "zod";
export const money = z.string().regex(/^\d+(\.\d+)?$/);
export const productSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{12}$/),
  title: z.string().min(1),
  type: z.enum(["game", "dlc", "bundle", "edition", "unknown"]),
  publisher: z.string().nullable(),
  cover: z.string().nullable(),
  platforms: z.array(z.string()),
  metadataFetchedAt: z.string(),
  sourceMarket: z.enum(["US", "TR", "IN", "JP"]),
});
export type Product = z.infer<typeof productSchema>;
export const snapshotSchema = z.object({
  productId: z.string(),
  market: z.enum(["US", "TR", "IN", "JP"]),
  currency: z.enum(["USD", "TRY", "INR", "JPY"]),
  observedCurrency: z.string().nullable(),
  status: z.enum([
    "available",
    "unavailable",
    "unknown",
    "conditional_only",
    "ambiguous",
  ]),
  reason: z.string(),
  currentAmount: money.nullable(),
  regularAmount: money.nullable(),
  skuId: z.string().nullable(),
  availabilityId: z.string().nullable(),
  entitlementKey: z.string().nullable(),
  purchaseKind: z.string().nullable(),
  eligibility: z.string(),
  platforms: z.array(z.string()),
  regionalTitle: z.string().nullable(),
  saleEndAt: z.string().nullable(),
  offerEndAt: z.string().nullable(),
  storeUrl: z.string(),
  fetchedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const rateSchema = z.object({
  currency: z.enum(["USD", "TRY", "INR", "JPY"]),
  usdPerLocalUnit: money.refine(
    (value) => Number(value) > 0 && Number.isFinite(Number(value)),
  ),
  provider: z.string(),
  effectiveDate: z.string(),
  fetchedAt: z.string(),
});
export type Rate = z.infer<typeof rateSchema>;
export type FxSnapshot = Partial<Record<Rate["currency"], Rate>>;
export type AllTimeLow = {
  amount: string;
  currency: Snapshot["currency"];
  usd: string | null;
  recordedAt: string;
};
export type PriceHistoryEntry = {
  id: number;
  productId: string;
  market: Snapshot["market"];
  amount: string;
  currency: Snapshot["currency"];
  usd: string | null;
  recordedAt: string;
};
export type RegionResult = Snapshot & {
  lastAttemptAt: string | null;
  refreshError: string | null;
  fx: Rate | null;
  usd: string | null;
  deltaUsd: string | null;
  deltaPercent: string | null;
  savingsUsd: string | null;
  savingsPercent: string | null;
  stale: boolean;
  rankEligible: boolean;
  rankingReason: string | null;
  allTimeLow?: AllTimeLow | null;
  isAllTimeLow?: boolean;
};
export type Comparison = {
  product: Product;
  regions: RegionResult[];
  winners: Snapshot["market"][];
  warnings: string[];
  refreshNeeded: boolean;
  saved: boolean;
  demo: boolean;
  nextRefreshAt: string | null;
  priceHistory?: Partial<Record<Snapshot["market"], PriceHistoryEntry[]>>;
};
export type SearchPage = {
  products: Product[];
  source: "live" | "cache" | "local" | "fixture";
  limited: boolean;
  warnings: string[];
};
export type ApiEnvelope<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
export interface CatalogProvider {
  getProduct(
    id: string,
    market: Snapshot["market"],
  ): Promise<{ product: Product | null; snapshot: Snapshot }>;
}
export interface SearchProvider {
  search(query: string): Promise<SearchPage>;
}
export interface FxProvider {
  getUsdRates(): Promise<FxSnapshot>;
}
