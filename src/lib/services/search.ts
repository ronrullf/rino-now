import "server-only";
import { AppError } from "../errors";
import { config } from "../config";
import { repository } from "../db/client";
import { microsoftSearch, now } from "../providers/microsoft";
import type { SearchPage } from "../contracts";
import { rankProducts, searchTerms, type SearchKind } from "../search/matching";
const flights = new Map<string, Promise<SearchPage>>();
export async function search(
  query: string,
  kind: SearchKind = "all",
): Promise<SearchPage> {
  const db = repository();
  const local = db.searchCandidates();
  const terms = searchTerms(
    query,
    local.map((p) => p.title),
  );
  const key = `${config.DATA_MODE}:search-v3:${kind}:${terms.join("|")}`;
  const cached = db.cachedSearch(key, Date.parse(now()));
  if (cached)
    return {
      ...cached,
      source: config.DATA_MODE === "fixture" ? "fixture" : "cache",
    };
  const previous = flights.get(key);
  if (previous) return previous;
  const request = (async () => {
    const responses = await Promise.allSettled(
      terms.map((term) => microsoftSearch.search(term)),
    );
    const pages = responses.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );
    const products = rankProducts(
      [...local, ...pages.flatMap((p) => p.products)],
      terms,
      kind,
    );
    if (!pages.length && !products.length)
      throw new AppError(
        "SEARCH_UNAVAILABLE",
        "Search is temporarily unavailable. Try a product link or ID.",
        503,
        true,
      );
    const page: SearchPage = {
      products,
      source: !pages.length
        ? "local"
        : config.DATA_MODE === "fixture"
          ? "fixture"
          : "live",
      limited: true,
      warnings: [...new Set(pages.flatMap((p) => p.warnings))],
    };
    if (terms[1] && terms[1] !== terms[0])
      page.warnings.push("Also searching for “" + terms[1] + "”.");
    if (responses.some((r) => r.status === "rejected"))
      page.warnings.push(
        "Some search results are temporarily unavailable. Showing the matches we could verify.",
      );
    for (const p of products) db.saveProduct(p);
    if (responses.every((r) => r.status === "fulfilled"))
      db.saveSearch(
        key,
        page,
        Date.parse(now()) +
          (products.length ? config.SEARCH_TTL_SECONDS : 120) * 1000,
      );
    return page;
  })().finally(() => flights.delete(key));
  flights.set(key, request);
  return request;
}
