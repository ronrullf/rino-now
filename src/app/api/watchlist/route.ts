import { respond, bodyId } from "@/lib/api";
import { repository } from "@/lib/db/client";
import { comparisons } from "@/lib/services/comparison";
import { now } from "@/lib/providers/microsoft";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return respond(async () =>
    Promise.all(
      repository()
        .watchlist()
        .map(async (product) => {
          try {
            return {
              product,
              comparison: await comparisons().get(product.id, {
                cachedOnly: true,
              }),
            };
          } catch {
            return { product, comparison: null };
          }
        }),
    ),
  );
}
export function POST(request: Request) {
  return respond(async () => {
    const id = await bodyId(request);
    await comparisons().get(id);
    repository().saveWatch(id, now());
    return { saved: true };
  });
}
