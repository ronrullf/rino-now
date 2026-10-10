import { respond } from "@/lib/api";
import { productId } from "@/lib/security/inputs";
import { getRelatedProducts } from "@/lib/services/related";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  return respond(async () =>
    getRelatedProducts(productId((await context.params).productId)),
  );
}
