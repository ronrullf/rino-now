import "server-only";
import { readFile } from "node:fs/promises";
import { config } from "../config";
import { regions, type Market } from "../regions";
import { upstream } from "../http/upstream";
import { catalogResponse, metadata, parseCatalog } from "./catalog-parser";
import { AppError } from "../errors";
import type { CatalogProvider, SearchProvider, SearchPage } from "../contracts";
export const now = () =>
  config.DATA_MODE === "fixture"
    ? "2026-10-03T16:00:00.000Z"
    : new Date().toISOString();
export async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(`${process.cwd()}/tests/fixtures/${name}.json`, "utf8"),
  );
}
export const catalog: CatalogProvider = {
  async getProduct(id: string, market: Market) {
    let raw: unknown;
    if (config.DATA_MODE === "fixture") {
      if (!["9NKX70BBCDRN", "9PNSZ7GMWCQZ"].includes(id))
        return parseCatalog({ Products: [] }, id, market, now());
      raw = await fixture(`${id}-${market}`);
    } else {
      const params = new URLSearchParams({
        bigIds: id,
        market,
        languages: regions[market].locale,
        fieldsTemplate: "Details",
      });
      raw = await upstream(
        `https://displaycatalog.mp.microsoft.com/v7.0/products?${params}`,
      );
    }
    return parseCatalog(raw, id, market, now(), config.PRICE_TTL_SECONDS);
  },
};
export const microsoftSearch: SearchProvider = {
  async search(query: string): Promise<SearchPage> {
    if (config.DATA_MODE === "fixture") {
      const products = [];
      for (const id of ["9NKX70BBCDRN", "9PNSZ7GMWCQZ"]) {
        const { product } = await catalog.getProduct(id, "US");
        if (product?.title.toLowerCase().includes(query.toLowerCase()))
          products.push(product);
      }
      return { products, source: "fixture", limited: false, warnings: [] };
    }
    const params = new URLSearchParams({
      query,
      market: "US",
      languages: "en-US",
      fieldsTemplate: "Details",
      platformdependencyname: "windows.xbox",
    });
    const raw = await upstream(
      `https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/Games/products?${params}`,
    );
    const parsed = catalogResponse.safeParse(raw);
    if (!parsed.success)
      throw new AppError(
        "SEARCH_SHAPE",
        "Search returned an unsupported response.",
        502,
      );
    const products = [
      ...new Map(
        parsed.data.Products.map((p) => {
          const m = metadata(p, "US", now());
          return [m.id, m] as const;
        }),
      ).values(),
    ].slice(0, 20);
    return { products, source: "live", limited: true, warnings: [] };
  },
};
