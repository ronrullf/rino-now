import { respond } from "@/lib/api";
import { serverless } from "@/lib/config";
import { repository } from "@/lib/db/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(() => {
    repository().health();
    return {
      ready: true,
      storage: serverless
        ? "browser-with-ephemeral-cache"
        : "persistent-sqlite",
    };
  });
}
