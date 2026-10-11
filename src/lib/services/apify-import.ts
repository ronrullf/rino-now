import { repository } from "../db/client";
import { parseCatalog } from "../providers/catalog-parser";
import { now } from "../providers/microsoft";
import { upstream } from "../http/upstream";
import { markets, regions } from "../regions";
import { config } from "../config";
import type { Product } from "../contracts";

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
    const chunkSize = 25;

    for (let i = 0; i < idList.length; i += chunkSize) {
      const chunk = idList.slice(i, i + chunkSize);
      const bigIdsParam = chunk.join(",");
      console.log(`Syncing chunk ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(idList.length / chunkSize)} (${chunk.length} titles across US, TR, IN, JP)...`);

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

  return {
    totalReceived: items.length,
    validProductIds: validIds.size,
    newProductsAdded,
    regionsSynced,
  };
}

/**
 * Downloads and ingests dataset directly from Apify using dataset ID or API token.
 */
export async function fetchAndIngestApifyDataset(
  datasetId: string,
  apiToken?: string,
): Promise<{
  totalReceived: number;
  validProductIds: number;
  newProductsAdded: number;
  regionsSynced: number;
}> {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json${
    apiToken ? `&token=${encodeURIComponent(apiToken)}` : ""
  }`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Apify dataset fetch failed with HTTP ${res.status}: ${res.statusText}`);
  }

  const items = (await res.json()) as ApifyRawItem[];
  return ingestApifyDataset(items, { batchFetchRegions: true });
}
