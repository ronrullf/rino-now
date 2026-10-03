import { respond } from "@/lib/api";
import { productId } from "@/lib/security/inputs";
import { comparisons } from "@/lib/services/comparison";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  return respond(async () =>
    comparisons().get(productId((await context.params).productId), {
      fresh: new URL(request.url).searchParams.get("fresh") === "1",
    }),
  );
}
