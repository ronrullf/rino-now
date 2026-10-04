import { respond } from "@/lib/api";
import { searchQuery } from "@/lib/security/inputs";
import { search } from "@/lib/services/search";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return respond(() => {
    const params = new URL(request.url).searchParams;
    if (params.has("cursor"))
      throw new AppError(
        "PAGING_UNSUPPORTED",
        "Search pagination has not been verified.",
        400,
      );
    const kind = params.get("kind") ?? "all";
    if (kind !== "all" && kind !== "games" && kind !== "dlc")
      throw new AppError("INVALID_KIND", "Choose games or DLCs.", 400);
    return search(searchQuery(params.get("q")), kind);
  });
}
