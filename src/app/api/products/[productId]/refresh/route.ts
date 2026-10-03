import { respond } from "@/lib/api";
import { productId } from "@/lib/security/inputs";
import { checkOrigin } from "@/lib/security/origin";
import { comparisons } from "@/lib/services/comparison";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  return respond(async () => {
    checkOrigin(request);
    return comparisons().get(productId((await context.params).productId), {
      refresh: true,
    });
  });
}
