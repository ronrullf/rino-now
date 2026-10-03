import { respond, bodyId } from "@/lib/api";
import { repository } from "@/lib/db/client";
import { comparisons } from "@/lib/services/comparison";
import { now } from "@/lib/providers/microsoft";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => repository().recent());
}
export function POST(request: Request) {
  return respond(async () => {
    const id = await bodyId(request);
    if (!repository().product(id)) await comparisons().get(id);
    repository().recordRecent(id, now());
    return { recorded: true };
  });
}
