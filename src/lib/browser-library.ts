import { z } from "zod";
import {
  productSchema,
  snapshotSchema,
  rateSchema,
  type Comparison,
  type Product,
} from "./contracts";
import { compare } from "./pricing/compare";
const entrySchema = z.object({
  product: productSchema,
  snapshots: z.array(snapshotSchema),
  rates: z.array(rateSchema),
});
const savedSchema = z.array(entrySchema).max(200);
const recentSchema = z.array(productSchema).max(50);
const savedKey = "region:watchlist:v1",
  recentKey = "region:recent:v1";
export class BrowserLibrary {
  constructor(private storage: Pick<Storage, "getItem" | "setItem">) {}
  private read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
    try {
      const raw = this.storage.getItem(key);
      return raw ? schema.parse(JSON.parse(raw)) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(key: string, value: unknown) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      throw Error(
        "Browser storage is full or blocked. Allow site storage to save your games.",
      );
    }
  }
  private saved() {
    return this.read(savedKey, savedSchema, []);
  }
  has(id: string) {
    return this.saved().some((e) => e.product.id === id);
  }
  save(c: Comparison) {
    const entries = this.saved(),
      index = entries.findIndex((e) => e.product.id === c.product.id);
    if (index < 0 && entries.length >= 200)
      throw Error("The watchlist is limited to 200 products.");
    const entry = entrySchema.parse({
      product: c.product,
      snapshots: c.regions,
      rates: c.regions.flatMap((r) => (r.fx ? [r.fx] : [])),
    });
    if (index < 0) entries.unshift(entry);
    else entries[index] = entry;
    this.write(savedKey, entries);
  }
  remove(id: string) {
    this.write(
      savedKey,
      this.saved().filter((e) => e.product.id !== id),
    );
  }
  list(at = new Date().toISOString()) {
    return this.saved().map((e) => {
      const result = compare(
        e.snapshots,
        Object.fromEntries(e.rates.map((r) => [r.currency, r])),
        at,
      );
      // Saved browser snapshots are references until the product is opened again.
      const comparison: Comparison = {
        product: e.product,
        ...result,
        winners: [],
        regions: result.regions.map((r) => ({
          ...r,
          rankEligible: false,
          rankingReason: "SAVED_REFERENCE",
        })),
        warnings: [
          "Saved reference prices. Open the product to get a current comparison.",
        ],
        refreshNeeded: true,
        saved: true,
        demo: false,
        nextRefreshAt: null,
      };
      return { product: e.product, comparison };
    });
  }
  recent() {
    return this.read(recentKey, recentSchema, []);
  }
  record(product: Product) {
    this.write(
      recentKey,
      [product, ...this.recent().filter((p) => p.id !== product.id)].slice(
        0,
        50,
      ),
    );
  }
}
