import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { ingestApifyDataset, fetchAndIngestApifyDataset, type ApifyRawItem } from "../src/lib/services/apify-import";

async function main() {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let datasetId: string | null = null;
  let token: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--dataset" && args[i + 1]) {
      datasetId = args[++i];
    } else if (args[i] === "--token" && args[i + 1]) {
      token = args[++i];
    }
  }

  console.log("=== Xbox Catalog Apify Importer ===");

  if (datasetId) {
    console.log(`Fetching dataset directly from Apify: ${datasetId}...`);
    const stats = await fetchAndIngestApifyDataset(datasetId, token);
    console.log("Ingestion complete!");
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (filePath) {
    const fullPath = path.resolve(process.cwd(), filePath);
    console.log(`Reading local Apify export file from: ${fullPath}...`);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(fullPath, "utf-8");
    const items = JSON.parse(raw) as ApifyRawItem[];
    console.log(`Parsed ${items.length} records. Ingesting and syncing 4-region prices...`);

    const stats = await ingestApifyDataset(items, { batchFetchRegions: true });
    console.log("Ingestion complete!");
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`Usage:
  npx tsx scripts/import-apify.ts --file ./data/my-apify-results.json
  npx tsx scripts/import-apify.ts --dataset <datasetId> [--token <apiToken>]
  `);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
