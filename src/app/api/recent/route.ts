import { respond, bodyId } from "@/lib/api";
import { serverless } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { repository } from "@/lib/db/client";
import { comparisons } from "@/lib/services/comparison";
import { now } from "@/lib/providers/microsoft";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => (serverless ? [] : repository().recent()));
}
export function POST(request: Request) {
  return respond(async () => {
    if (serverless)
      throw new AppError(
        "BROWSER_STORAGE",
        "Saved games are stored in this browser on Vercel.",
        409,
      );
    const id = await bodyId(request);
    if (!repository().product(id)) await comparisons().get(id);
    repository().recordRecent(id, now());
    return { recorded: true };
  });
}
