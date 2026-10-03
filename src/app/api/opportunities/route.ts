import { respond } from "@/lib/api";
import { opportunities } from "@/lib/services/opportunities";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(opportunities);
}
