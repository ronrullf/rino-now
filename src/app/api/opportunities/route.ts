import { AppError } from "@/lib/errors";
import { respond } from "@/lib/api";
import { opportunities } from "@/lib/services/opportunities";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return respond(() => {
    const kind = new URL(request.url).searchParams.get("kind") ?? "games";
    if (kind !== "games" && kind !== "dlc")
      throw new AppError("INVALID_KIND", "Choose games or DLCs.", 400);
    return opportunities(kind);
  });
}
