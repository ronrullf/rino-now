import "server-only";
import { config } from "../config";
import { repository } from "../db/client";
import { comparisons } from "./comparison";
import { regions, markets, type Market } from "../regions";
import { parseCatalog } from "../providers/catalog-parser";
import { now } from "../providers/microsoft";
import { upstream } from "../http/upstream";
import { Decimal } from "decimal.js";

export type RegionalStorePrice = {
  market: Market;
  marketName: string;
  currency: string;
  nativeAmount: string | null;
  usdAmount: string | null;
  status: string;
  storeUrl: string;
  rankEligible: boolean;
};

export type MasterCatalogItem = {
  id: string;
  title: string;
  type: string;
  cover: string | null;
  publisher: string | null;
  platforms: string[];
  regions: RegionalStorePrice[];
  cheapestMarket: Market | null;
  cheapestUsd: string | null;
  cheapestNative: string | null;
  cheapestCurrency: string | null;
  highestMarket: Market | null;
  highestUsd: string | null;
  differenceUsd: string | null;
  differencePercent: string | null;
  storeUrl: string; // Winning store URL (or US fallback)
};

export type MasterCatalogResult = {
  items: MasterCatalogItem[];
  total: number;
  syncedInDb: number;
  totalDiscoverable: number;
};

// Top blockbuster Xbox titles to ensure complete coverage alongside Game Pass
export const CORE_XBOX_CATALOG_SEEDS = [
  "9NKX70BBCDRN", // Forza Horizon 5 Standard
  "9MTLKM2DJMZ2", // Forza Horizon 5 Premium
  "9PLKVSWR299F", // Forza Motorsport Standard
  "9P8PGC771MLP", // Forza Motorsport Premium
  "9P8RQH67TTT1", // Grand Theft Auto V
  "9NXMBTB02ZSF", // Grand Theft Auto V (Series X|S)
  "9NKC1Z4Z92VN", // GTA Online
  "9P3H4968GRSM", // Grand Theft Auto VI
  "9NNZSNHLR63L", // Grand Theft Auto VI: Ultimate
  "9P3J32CTXLRZ", // ELDEN RING
  "9PMPZZLKQM43", // ELDEN RING Shadow of the Erdtree
  "9N2ZDN7NWQKV", // Red Dead Redemption 2
  "9MT5NJ5W7B8Z", // Hogwarts Legacy
  "9MVXMVT8ZKWC", // Minecraft
  "9NCJSXWZTP88", // Starfield
  "9N7JCPPCPN37", // Resident Evil 4
  "9PD2M9470N1P", // Resident Evil 4 - Separate Ways
  "9PJGM0T0827V", // DIRT 5
  "9MXZBTLG26VX", // EA SPORTS FC 26
  "9PJ2RVRC0L1X", // NBA 2K26
  "9NJRX71M5X9P", // Cuphead
  "BWMQL2RPWBHB", // Celeste
  "9P2N57MC619K", // Sea of Thieves
  "9NMGP6S6NJPR", // Battlefield 2042
  "9P4811KBD5R9", // JoJo's Bizarre Adventure
  "9P6HVHDP2PGK", // Crimson Desert
  "9PNSZ7GMWCQZ", // Forza Horizon 5: Hot Wheels
  "9NCJB85WM01G", // Fortnite - Mainframe Break Pack
  "9N16XHX3MB1R", // Fortnite - 800 V-Bucks
  "9NKV4GWZZ2SS", // Fortnite - 2,400 V-Bucks
  "C22JNR2SLS6T", // GTA Criminal Enterprise Starter Pack
];

// Cache of discovered IDs from Microsoft feeds
let cachedDiscoveredIds: string[] | null = null;
let lastDiscoveredAt = 0;

/**
 * Discovers game IDs directly from Microsoft Game Pass feeds and core catalog seeds.
 */
export async function discoverMicrosoftGameIds(): Promise<string[]> {
  const currentTime = Date.now();
  if (cachedDiscoveredIds && currentTime - lastDiscoveredAt < 3600000) {
    return cachedDiscoveredIds;
  }

  const allIds = new Set<string>(CORE_XBOX_CATALOG_SEEDS);

  if (config.DATA_MODE === "fixture") {
    cachedDiscoveredIds = Array.from(allIds);
    return cachedDiscoveredIds;
  }

  try {
    const feedUrls = [
      "https://catalog.gamepass.com/sigls/v2?id=29a81209-df6f-41fd-a528-2ae6b91f719c&language=en-us&market=US", // All games
      "https://catalog.gamepass.com/sigls/v2?id=f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e&language=en-us&market=US", // Console games
    ];

    await Promise.all(
      feedUrls.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(2500),
          });
          if (res.ok) {
            const items = (await res.json()) as Array<{ id?: string }>;
            for (const item of items) {
              if (item.id && /^[A-Z0-9]{12}$/i.test(item.id)) {
                allIds.add(item.id.toUpperCase());
              }
            }
          }
        } catch {
          // Non-fatal if one feed times out
        }
      }),
    );
  } catch {
    // Non-fatal, seeds will be used
  }

  cachedDiscoveredIds = Array.from(allIds);
  lastDiscoveredAt = currentTime;
  return cachedDiscoveredIds;
}

/**
 * Syncs a batch of products across all 4 regions in high-speed parallel batches of up to 25.
 */
export async function syncCatalogBatch(
  batchSize = 25,
): Promise<{
  synced: number;
  totalKnown: number;
  totalWithPrices: number;
  nextBatchRemaining: number;
}> {
  const repo = repository();
  const allDiscovered = await discoverMicrosoftGameIds();
  const withSnapshots = new Set(repo.productsWithSnapshots().map((p) => p.id));

  // Prioritize products not yet in the database or without regional snapshots
  const toSync = allDiscovered.filter((id) => !withSnapshots.has(id)).slice(0, batchSize);

  if (!toSync.length) {
    return {
      synced: 0,
      totalKnown: allDiscovered.length,
      totalWithPrices: withSnapshots.size,
      nextBatchRemaining: 0,
    };
  }

  if (config.DATA_MODE === "fixture") {
    return {
      synced: toSync.length,
      totalKnown: allDiscovered.length,
      totalWithPrices: withSnapshots.size + toSync.length,
      nextBatchRemaining: 0,
    };
  }

  const at = now();
  const chunkSize = 25;
  let syncedCount = 0;

  for (let i = 0; i < toSync.length; i += chunkSize) {
    const chunk = toSync.slice(i, i + chunkSize);
    const bigIdsParam = chunk.join(",");

    // Fetch all 4 markets simultaneously in 4 fast upstream batch requests
    await Promise.all(
      markets.map(async (market) => {
        try {
          const params = new URLSearchParams({
            bigIds: bigIdsParam,
            market,
            languages: regions[market].locale,
            fieldsTemplate: "Details",
          });
          const raw = await upstream(
            `https://displaycatalog.mp.microsoft.com/v7.0/products?${params}`,
          );

          for (const productId of chunk) {
            try {
              const { product, snapshot } = parseCatalog(
                raw,
                productId,
                market,
                at,
                config.PRICE_TTL_SECONDS,
              );
              if (product) repo.saveProduct(product);
              repo.saveSnapshot(snapshot);
              if (snapshot.status === "available" && snapshot.currentAmount) {
                repo.recordPriceHistory(
                  productId,
                  market,
                  snapshot.currentAmount,
                  snapshot.currency,
                  null,
                  at,
                );
              }
            } catch {
              // Individual product parsing error
            }
          }
        } catch {
          // Market batch failed
        }
      }),
    );

    syncedCount += chunk.length;
  }

  const updatedSnapshots = new Set(repo.productsWithSnapshots().map((p) => p.id));

  return {
    synced: syncedCount,
    totalKnown: allDiscovered.length,
    totalWithPrices: updatedSnapshots.size,
    nextBatchRemaining: Math.max(0, allDiscovered.length - updatedSnapshots.size),
  };
}

/**
 * Retrieves the comprehensive Master Catalog with all 4 regional prices and links for every game.
 */
export async function getMasterCatalog(options: {
  query?: string;
  marketFilter?: Market | "ALL";
  minSavings?: number;
  sortBy?: "savings" | "lowestUsd" | "highestUsd" | "title";
  limit?: number;
  offset?: number;
} = {}): Promise<MasterCatalogResult> {
  const repo = repository();
  const allProducts = repo.productsWithSnapshots();
  const compService = comparisons();

  // Pre-filter by query if provided to avoid unnecessary lookups
  let targets = allProducts;
  if (options.query?.trim()) {
    const q = options.query.toLowerCase().trim();
    targets = targets.filter(
      (p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }

  // Process products in parallel chunks of 50
  const chunkSize = 50;
  const items: MasterCatalogItem[] = [];

  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const chunkItems = await Promise.all(
      chunk.map(async (product) => {
        try {
          const comp = await compService.get(product.id, { cachedOnly: true });

          // Build 4-region pricing & links breakdown with clean 2-decimal USD amounts
          const regionalPrices: RegionalStorePrice[] = markets.map((m) => {
            const reg = comp.regions.find((r) => r.market === m);
            return {
              market: m,
              marketName: regions[m].name,
              currency: regions[m].currency,
              nativeAmount: reg?.currentAmount ?? null,
              usdAmount: reg?.usd ? new Decimal(reg.usd).toFixed(2) : null,
              status: reg?.status ?? "unavailable",
              storeUrl:
                reg?.storeUrl ??
                `https://www.xbox.com/${regions[m].locale}/games/store/p/${product.id.toLowerCase()}`,
              rankEligible: reg?.status === "available" && reg.usd !== null,
            };
          });

          // Filter all regions that have an available price with a converted USD value
          const validPricing = comp.regions
            .filter((r) => r.status === "available" && r.usd !== null && !r.refreshError)
            .sort((a, b) => new Decimal(a.usd!).cmp(b.usd!));

          let cheapestMarket: Market | null = null;
          let cheapestUsd: string | null = null;
          let cheapestNative: string | null = null;
          let cheapestCurrency: string | null = null;
          let highestMarket: Market | null = null;
          let highestUsd: string | null = null;
          let differenceUsd: string | null = null;
          let differencePercent: string | null = null;

          if (validPricing.length >= 1) {
            const cheapest = validPricing[0];
            cheapestMarket = cheapest.market;
            cheapestUsd = new Decimal(cheapest.usd!).toFixed(2);
            cheapestNative = cheapest.currentAmount;
            cheapestCurrency = cheapest.currency;

            const usRegion = comp.regions.find(
              (r) => r.market === "US" && r.status === "available" && r.usd !== null,
            );
            const baseline = usRegion && usRegion.market !== cheapest.market
              ? usRegion
              : validPricing[validPricing.length - 1];

            if (baseline && baseline.market !== cheapest.market) {
              const baseDec = new Decimal(baseline.usd!);
              const cheapDec = new Decimal(cheapest.usd!);
              const diff = baseDec.minus(cheapDec);

              highestMarket = baseline.market;
              highestUsd = baseDec.toFixed(2);
              differenceUsd = diff.toFixed(2);
              differencePercent = baseDec.isZero() ? "0" : diff.div(baseDec).mul(100).toFixed(1);
            }
          }

          const winningStoreUrl =
            (cheapestMarket && comp.regions.find((r) => r.market === cheapestMarket)?.storeUrl) ||
            comp.regions.find((r) => r.market === "US")?.storeUrl ||
            `https://www.xbox.com/en-US/games/store/p/${product.id.toLowerCase()}`;

          return {
            id: product.id,
            title: product.title,
            type: product.type,
            cover: product.cover,
            publisher: product.publisher,
            platforms: product.platforms,
            regions: regionalPrices,
            cheapestMarket,
            cheapestUsd,
            cheapestNative,
            cheapestCurrency,
            highestMarket,
            highestUsd,
            differenceUsd,
            differencePercent,
            storeUrl: winningStoreUrl,
          };
        } catch {
          return null;
        }
      }),
    );

    for (const item of chunkItems) {
      if (item) items.push(item);
    }
  }

  // Filter
  let filtered = items;
  if (options.query?.trim()) {
    const q = options.query.toLowerCase().trim();
    filtered = filtered.filter(
      (it) => it.title.toLowerCase().includes(q) || it.id.toLowerCase().includes(q),
    );
  }

  if (options.marketFilter && options.marketFilter !== "ALL") {
    filtered = filtered.filter((it) => it.cheapestMarket === options.marketFilter);
  }

  if (options.minSavings && options.minSavings > 0) {
    filtered = filtered.filter(
      (it) => it.differencePercent && Number(it.differencePercent) >= options.minSavings!,
    );
  }

  // Sort
  const sortBy = options.sortBy ?? "savings";
  filtered.sort((a, b) => {
    if (sortBy === "savings") {
      const aSav = Number(a.differencePercent ?? 0);
      const bSav = Number(b.differencePercent ?? 0);
      return bSav - aSav || Number(b.differenceUsd ?? 0) - Number(a.differenceUsd ?? 0);
    }
    if (sortBy === "lowestUsd") {
      return Number(a.cheapestUsd ?? 999999) - Number(b.cheapestUsd ?? 999999);
    }
    if (sortBy === "highestUsd") {
      return Number(b.cheapestUsd ?? 0) - Number(a.cheapestUsd ?? 0);
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  const allDiscovered = await discoverMicrosoftGameIds();
  const limit = options.limit ?? filtered.length;
  const offset = options.offset ?? 0;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    items: paginated,
    total: filtered.length,
    syncedInDb: allProducts.length,
    totalDiscoverable: Math.max(allDiscovered.length, allProducts.length),
  };
}
