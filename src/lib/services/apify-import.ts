import fs from "node:fs";
import path from "node:path";
import { repository } from "../db/client";
import { parseCatalog } from "../providers/catalog-parser";
import { now } from "../providers/microsoft";
import { upstream } from "../http/upstream";
import { markets, regions } from "../regions";
import { config } from "../config";
import type { Product } from "../contracts";
import { invalidateMasterCatalogCache } from "./catalog-sync";

export type ApifyRawItem = {
  // Shahid Irfan schema
  product_id?: string;
  url?: string;
  title?: string;
  price?: string;
  market?: string;
  image_url?: string;
  publisher?: string;
  // Fatih Tahta schema
  id?: number | string;
  images?: {
    poster?: { url?: string };
    box_art?: { url?: string };
  };
  data?: {
    detail?: {
      additional_information?: {
        productId?: string;
      };
    };
  };
};

/**
 * Extracts normalized 12-character Xbox Product ID from various Apify Actor schemas.
 */
export function extractProductId(item: ApifyRawItem): string | null {
  if (item.product_id && /^[A-Z0-9]{12}$/i.test(item.product_id.trim())) {
    return item.product_id.trim().toUpperCase();
  }

  const nestedId = item.data?.detail?.additional_information?.productId;
  if (nestedId && /^[A-Z0-9]{12}$/i.test(nestedId.trim())) {
    return nestedId.trim().toUpperCase();
  }

  if (item.url) {
    const match = item.url.match(/\/(?:[A-Z0-9]{12}|p\/([A-Z0-9]{12}))(?:[/?#]|$)/i) ||
                  item.url.match(/([A-Z0-9]{12})/i);
    if (match) {
      const candidate = (match[1] || match[0]).replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (/^[A-Z0-9]{12}$/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Ingests an array of items from Apify, stores product stubs, and batch-syncs 4 regional prices into SQLite.
 */
export async function ingestApifyDataset(
  items: ApifyRawItem[],
  options: {
    batchFetchRegions?: boolean;
    batchLimit?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<{
  totalReceived: number;
  validProductIds: number;
  newProductsAdded: number;
  regionsSynced: number;
}> {
  const repo = repository();
  const validIds = new Set<string>();
  const productStubs: Product[] = [];
  const at = now();

  for (const item of items) {
    const pId = extractProductId(item);
    if (!pId) continue;

    validIds.add(pId);

    const title = item.title?.trim() || `Xbox Product ${pId}`;
    const cover = item.image_url || item.images?.poster?.url || item.images?.box_art?.url || null;

    productStubs.push({
      id: pId,
      title,
      type: "game",
      publisher: item.publisher || null,
      cover,
      platforms: ["Xbox Series X|S", "Xbox One"],
      metadataFetchedAt: at,
      sourceMarket: "US",
    });
  }

  let newProductsAdded = 0;
  for (const prod of productStubs) {
    try {
      repo.saveProduct(prod);
      newProductsAdded++;
    } catch {
      // Ignore if exists
    }
  }

  let regionsSynced = 0;

  if (options.batchFetchRegions && config.DATA_MODE !== "fixture") {
    const idList = Array.from(validIds).slice(0, options.batchLimit ?? validIds.size);
    const toSync = options.forceRefresh
      ? idList
      : idList.filter((pId) => {
          const snaps = repo.snapshots(pId);
          return snaps.length < markets.length;
        });

    console.log(
      `Dataset deduplication: ${idList.length} unique products parsed (${idList.length - toSync.length} already fully synced in SQLite, ${toSync.length} new/incomplete to fetch).`,
    );

    const chunkSize = 25;

    for (let i = 0; i < toSync.length; i += chunkSize) {
      const chunk = toSync.slice(i, i + chunkSize);
      const bigIdsParam = chunk.join(",");
      console.log(`Syncing chunk ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(toSync.length / chunkSize)} (${chunk.length} titles across US, TR, IN, JP)...`);

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

            for (const pId of chunk) {
              try {
                const { product, snapshot } = parseCatalog(
                  raw,
                  pId,
                  market,
                  at,
                  config.PRICE_TTL_SECONDS,
                );
                if (product) repo.saveProduct(product);
                repo.saveSnapshot(snapshot);

                if (snapshot.status === "available" && snapshot.currentAmount) {
                  repo.recordPriceHistory(
                    pId,
                    market,
                    snapshot.currentAmount,
                    snapshot.currency,
                    null,
                    at,
                  );
                }
                regionsSynced++;
              } catch {
                // Individual product error
              }
            }
          } catch {
            // Market batch error
          }
        }),
      );
    }
  }

  invalidateMasterCatalogCache();

  return {
    totalReceived: items.length,
    validProductIds: validIds.size,
    newProductsAdded,
    regionsSynced,
  };
}

/**
 * Downloads and ingests dataset directly from Apify using dataset ID or API token.
 * Also stores the raw dataset as a local JSON file in ./data/ for future use.
 */
export async function fetchAndIngestApifyDataset(
  datasetId: string,
  apiToken?: string,
  options: { forceRefresh?: boolean; saveJsonPath?: string } = {},
): Promise<{
  totalReceived: number;
  validProductIds: number;
  newProductsAdded: number;
  regionsSynced: number;
  savedFile?: string;
}> {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json${
    apiToken ? `&token=${encodeURIComponent(apiToken)}` : ""
  }`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Apify dataset fetch failed with HTTP ${res.status}: ${res.statusText}`);
  }

  const items = (await res.json()) as ApifyRawItem[];

  // Save the raw dataset to disk for offline and future use
  const targetPath =
    options.saveJsonPath ||
    path.resolve(process.cwd(), `data/dataset_Apify_${datasetId}_${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save dataset file to disk:", err);
  }

  const result = await ingestApifyDataset(items, { batchFetchRegions: true, forceRefresh: options.forceRefresh });
  return {
    ...result,
    savedFile: targetPath,
  };
}

export type TriggerApifyOptions = {
  token: string;
  actorId?: string;
  startUrl?: string;
  resultsWanted?: number;
  useApifyProxy?: boolean;
  forceRefresh?: boolean;
  onProgress?: (message: string) => void;
};

/**
 * Triggers an Apify scraper actor run via API token, polls until completion,
 * automatically saves the JSON dataset to ./data/, and ingests all fresh games with 4-region USD pricing.
 */
export async function triggerActorAndIngest(
  options: TriggerApifyOptions,
): Promise<{
  runId: string;
  datasetId: string;
  savedFile?: string;
  totalReceived: number;
  validProductIds: number;
  newProductsAdded: number;
  regionsSynced: number;
}> {
  const actor = options.actorId || "Hdhz0Ce0rVkqJJI8U";
  const startUrl = options.startUrl || "https://www.xbox.com/en-US/games/browse?PlayWith=SpecialOffers";
  const resultsWanted = options.resultsWanted || 500;
  const maxPages = Math.ceil(resultsWanted / 25) + 10;
  const useApifyProxy = options.useApifyProxy !== false;

  options.onProgress?.(`Triggering Apify actor ${actor} with ${resultsWanted} games target on ${startUrl}...`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs?token=${encodeURIComponent(options.token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrl,
        results_wanted: resultsWanted,
        max_pages: maxPages,
        proxyConfiguration: { useApifyProxy },
      }),
    },
  );

  if (!runRes.ok) {
    const errText = await runRes.text();
    throw new Error(`Failed to start Apify actor run (${runRes.status}): ${errText}`);
  }

  const runData = (await runRes.json()) as {
    data: {
      id: string;
      defaultDatasetId: string;
      status: string;
    };
  };

  const runId = runData.data.id;
  const datasetId = runData.data.defaultDatasetId;
  options.onProgress?.(`Apify run started: ID ${runId}. Polling execution status...`);

  let currentStatus = runData.data.status;
  while (["READY", "RUNNING"].includes(currentStatus)) {
    await new Promise((res) => setTimeout(res, 6000));
    try {
      const statusRes = await fetch(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(options.token)}`,
      );
      if (statusRes.ok) {
        const pollData = (await statusRes.json()) as { data: { status: string } };
        currentStatus = pollData.data.status;
        options.onProgress?.(`Current Apify run status: ${currentStatus}...`);
      }
    } catch (err) {
      options.onProgress?.(`Polling retry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (currentStatus !== "SUCCEEDED") {
    throw new Error(`Apify run finished with non-success status: ${currentStatus}`);
  }

  options.onProgress?.(`Apify run succeeded! Fetching and saving dataset ${datasetId}...`);
  const ingestStats = await fetchAndIngestApifyDataset(datasetId, options.token, {
    forceRefresh: options.forceRefresh,
  });

  return {
    runId,
    datasetId,
    ...ingestStats,
  };
}

