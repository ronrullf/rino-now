import { AppError } from "@/lib/errors";
import { respond } from "@/lib/api";
import { opportunities, scanCatalog } from "@/lib/services/opportunities";
import type { OpportunityKind } from "@/lib/pricing/opportunities";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return respond(() => {
    const kind = (new URL(request.url).searchParams.get("kind") ?? "games") as OpportunityKind;
    if (kind !== "games" && kind !== "dlc" && kind !== "all")
      throw new AppError("INVALID_KIND", "Choose games, DLCs, or all.", 400);
    return opportunities(kind);
  });
}

export function POST(request: Request) {
  return respond(async () => {
    const url = new URL(request.url);
    const batchSize = Math.min(20, Math.max(1, Number(url.searchParams.get("batch") ?? "10")));
    const scanResult = await scanCatalog(batchSize);
    const opps = await opportunities("all");
    return {
      scanned: scanResult.scanned,
      totalRemaining: scanResult.totalRemaining,
      opportunities: opps,
    };
  });
}
