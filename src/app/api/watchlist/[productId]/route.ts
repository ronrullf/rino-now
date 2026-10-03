import { respond } from "@/lib/api";
import { repository } from "@/lib/db/client";
import { productId } from "@/lib/security/inputs";
import { checkOrigin } from "@/lib/security/origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function DELETE(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  return respond(async () => {
    checkOrigin(request);
    repository().removeWatch(productId((await context.params).productId));
    return { saved: false };
  });
}
