import { respond } from "@/lib/api";
import { syncCatalogBatch } from "@/lib/services/catalog-sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return respond(async () => {
    const url = new URL(request.url);
    const batchSize = Math.min(50, Math.max(5, Number(url.searchParams.get("batch") ?? "25")));
    return syncCatalogBatch(batchSize);
  });
}
