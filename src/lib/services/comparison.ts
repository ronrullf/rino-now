import "server-only";
import { config } from "../config";
import { repository } from "../db/client";
import type { Repository } from "../db/repository";
import { catalog, now } from "../providers/microsoft";
import { getRates } from "../providers/fx";
import { emptySnapshot } from "../providers/catalog-parser";
import { compare } from "../pricing/compare";
import { markets } from "../regions";
import { AppError, errorCode } from "../errors";
import type { CatalogProvider, Comparison, FxSnapshot } from "../contracts";
export class ComparisonService {
  private flights = new Map<string, Promise<void>>();
  private fxFlight: Promise<void> | null = null;
  private fxFailureUntil = 0;
  constructor(
    private repo: Repository,
    private provider: CatalogProvider = catalog,
    private fxProvider: () => Promise<FxSnapshot> = getRates,
    private clock: () => string = now,
    private actionClock: () => number = Date.now,
  ) {}
  private rates() {
    const names = {
      frankfurter: "Frankfurter",
      exchangerate: "ExchangeRate-API",
      none: "",
    };
    return this.repo.rates([
      names[config.FX_PROVIDER],
      names[config.FX_FALLBACK_PROVIDER],
    ]);
  }
  private async refreshFx() {
    const at = this.clock();
    const rates = this.rates();
    if (
      ["TRY", "INR", "JPY"].every((c) => {
        const r = rates[c as keyof FxSnapshot];
        return (
          r &&
          Date.parse(at) - Date.parse(r.fetchedAt) <
            config.FX_TTL_SECONDS * 1000
        );
      }) ||
      Date.parse(at) < this.fxFailureUntil
    )
      return;
    if (!this.fxFlight)
      this.fxFlight = (async () => {
        try {
          this.repo.saveFx(await this.fxProvider());
        } catch {
          this.fxFailureUntil = Date.parse(at) + 30000;
        }
      })().finally(() => {
        this.fxFlight = null;
      });
    await this.fxFlight;
  }
  private async update(id: string, force: boolean) {
    const existing = this.flights.get(id);
    if (existing) return existing;
    const promise = (async () => {
      const at = this.clock();
      const stored = this.repo.snapshots(id);
      const attempts = this.repo.attempts(id);
      const metadata = this.repo.product(id);
      const metadataOld =
        !metadata ||
        Date.parse(at) - Date.parse(metadata.metadataFetchedAt) > 86400000;
      const needed = markets.filter((m) => {
        const old = stored.find((s) => s.market === m);
        const attempt = attempts.find((s) => s.market === m);
        if (
          attempt?.error &&
          Date.parse(at) - Date.parse(attempt.lastAttemptAt) < 30000
        )
          return false;
        return (
          force ||
          metadataOld ||
          !old?.expiresAt ||
          Date.parse(old.expiresAt) <= Date.parse(at)
        );
      });
      const [results] = await Promise.all([
        Promise.allSettled(needed.map((m) => this.provider.getProduct(id, m))),
        this.refreshFx(),
      ]);
      for (const r of results)
        if (r.status === "fulfilled" && r.value.product)
          this.repo.saveProduct(r.value.product);
      if (!this.repo.product(id)) {
        if (
          results.length &&
          results.every(
            (r) =>
              r.status === "fulfilled" &&
              r.value.snapshot.status === "unavailable",
          )
        )
          throw new AppError(
            "PRODUCT_NOT_FOUND",
            "This product was not found in the four markets.",
            404,
          );
        throw new AppError(
          "LOOKUP_FAILED",
          "Product lookup is temporarily unavailable. Please try again.",
          503,
          true,
        );
      }
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          this.repo.saveSnapshot(r.value.snapshot);
          this.repo.attempt(id, needed[i], at, null);
        } else this.repo.attempt(id, needed[i], at, errorCode(r.reason));
      });
    })().finally(() => this.flights.delete(id));
    this.flights.set(id, promise);
    return promise;
  }
  async get(
    id: string,
    options: { refresh?: boolean; cachedOnly?: boolean; fresh?: boolean } = {},
  ): Promise<Comparison> {
    const product = this.repo.product(id);
    const stored = this.repo.snapshots(id);
    const at = this.clock();
    if (options.refresh) {
      if (
        product &&
        !this.repo.claimRefresh(
          id,
          this.actionClock(),
          config.REFRESH_COOLDOWN_SECONDS * 1000,
        )
      )
        throw new AppError(
          "REFRESH_COOLDOWN",
          "Please wait 30 seconds before refreshing this product again.",
          429,
          true,
        );
      await this.update(id, true);
    } else if (
      !options.cachedOnly &&
      (!product ||
        !stored.length ||
        (options.fresh &&
          stored.some(
            (s) => !s.expiresAt || Date.parse(s.expiresAt) <= Date.parse(at),
          )))
    )
      await this.update(id, false);
    else if (!options.cachedOnly) await this.refreshFx();
    const resolved = this.repo.product(id);
    if (!resolved)
      throw new AppError(
        "PRODUCT_NOT_FOUND",
        "Product not found in the local cache.",
        404,
      );
    const snapshots = this.repo.snapshots(id);
    const result = compare(
      markets.map(
        (m) => snapshots.find((s) => s.market === m) ?? emptySnapshot(id, m),
      ),
      this.rates(),
      at,
      config.PRICE_MAX_RANK_AGE_SECONDS,
      config.FX_MAX_RATE_AGE_DAYS,
    );
    const attempts = this.repo.attempts(id);
    for (const r of result.regions) {
      const a = attempts.find((a) => a.market === r.market);
      r.lastAttemptAt = a?.lastAttemptAt ?? null;
      r.refreshError = a?.error ?? null;
    }
    const warnings: string[] = [];
    if (Date.parse(at) < this.fxFailureUntil)
      warnings.push(
        "FX refresh failed. Any displayed conversions use the last successful dated rates.",
      );
    if (result.regions.some((r) => r.refreshError))
      warnings.push(
        "Some regions could not be refreshed. Previous successful prices are preserved.",
      );
    if (result.regions.some((r) => r.status === "available" && !r.fx))
      warnings.push(
        "Some exchange rates are unavailable. Local prices remain visible.",
      );
    if (result.regions.some((r) => r.stale))
      warnings.push(
        "Some prices are cached reference data and need refreshing.",
      );
    if (!snapshots.length)
      throw new AppError(
        "LOOKUP_FAILED",
        "No regional response is available. Please try again.",
        503,
        true,
      );
    return {
      product: resolved,
      ...result,
      warnings,
      refreshNeeded: result.regions.some((r) => r.stale),
      saved: this.repo.isSaved(id),
      demo: config.DATA_MODE === "fixture",
      nextRefreshAt: this.repo.nextRefresh(
        id,
        config.REFRESH_COOLDOWN_SECONDS * 1000,
      ),
    };
  }
}
const singleton = globalThis as typeof globalThis & {
  comparisonService?: ComparisonService;
};
export function comparisons() {
  return (singleton.comparisonService ??= new ComparisonService(repository()));
}
