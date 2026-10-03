import { respond } from "@/lib/api";
import { repository } from "@/lib/db/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => {
    repository().health();
    return { ready: true };
  });
}
