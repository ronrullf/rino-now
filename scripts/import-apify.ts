import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import {
  ingestApifyDataset,
  fetchAndIngestApifyDataset,
  triggerActorAndIngest,
  type ApifyRawItem,
} from "../src/lib/services/apify-import";

async function main() {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let datasetId: string | null = null;
  let token: string | undefined = process.env.APIFY_TOKEN;
  let forceRefresh = false;
  let runActor = false;
  let resultsWanted = 500;
  let actorId: string | undefined = undefined;
  let startUrl: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[++i];
    } else if (args[i] === "--dataset" && args[i + 1]) {
      datasetId = args[++i];
    } else if (args[i] === "--token" && args[i + 1]) {
      token = args[++i];
    } else if (args[i] === "--run") {
      runActor = true;
    } else if (args[i] === "--results" && args[i + 1]) {
      resultsWanted = Number.parseInt(args[++i], 10);
    } else if (args[i] === "--url" && args[i + 1]) {
      startUrl = args[++i];
    } else if (args[i] === "--actor" && args[i + 1]) {
      actorId = args[++i];
    } else if (args[i] === "--force") {
      forceRefresh = true;
    }
  }

  console.log("=== Xbox Catalog Apify Importer ===");

  if (runActor) {
    if (!token) {
      console.error("Error: Apify API token is required to run actor. Pass --token <key> or set APIFY_TOKEN in .env.local");
      process.exit(1);
    }

    console.log(`Starting automated Apify scraper run via API (Actor: ${actorId || "Hdhz0Ce0rVkqJJI8U"}, Target: ${resultsWanted} games)...`);
    const stats = await triggerActorAndIngest({
      token,
      actorId,
      startUrl,
      resultsWanted,
      forceRefresh,
      onProgress: (msg) => console.log(`[Apify Status] ${msg}`),
    });

    console.log("Automation complete!");
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (datasetId) {
    console.log(`Fetching dataset directly from Apify: ${datasetId}...`);
    const stats = await fetchAndIngestApifyDataset(datasetId, token, { forceRefresh });
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

    const stats = await ingestApifyDataset(items, { batchFetchRegions: true, forceRefresh });
    console.log("Ingestion complete!");
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`Usage:
  # 1. Trigger fresh Apify scrape and automatically ingest prices:
  npx tsx scripts/import-apify.ts --run [--token <apiToken>] [--results 1000]

  # 2. Ingest existing Apify dataset by dataset ID:
  npx tsx scripts/import-apify.ts --dataset <datasetId> [--token <apiToken>]

  # 3. Ingest local downloaded JSON file:
  npx tsx scripts/import-apify.ts --file ./data/my-apify-results.json
  `);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
