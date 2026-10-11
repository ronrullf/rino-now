import { respond } from "@/lib/api";
import { getMasterCatalog } from "@/lib/services/catalog-sync";
import type { Market } from "@/lib/regions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return respond(async () => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? undefined;
    const marketFilter = (url.searchParams.get("market") as Market | "ALL") ?? "ALL";
    const minSavings = url.searchParams.get("minSavings")
      ? Number(url.searchParams.get("minSavings"))
      : undefined;
    const sortBy = (url.searchParams.get("sort") as "savings" | "lowestUsd" | "highestUsd" | "title") ?? "savings";
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : 0;

    return getMasterCatalog({
      query,
      marketFilter,
      minSavings,
      sortBy,
      limit,
      offset,
    });
  });
}
