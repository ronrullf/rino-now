import { respond } from "@/lib/api";
import { serverless } from "@/lib/config";
import { AppError } from "@/lib/errors";
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
    if (serverless)
      throw new AppError(
        "BROWSER_STORAGE",
        "Saved games are stored in this browser on Vercel.",
        409,
      );
    checkOrigin(request);
    repository().removeWatch(productId((await context.params).productId));
    return { saved: false };
  });
}
