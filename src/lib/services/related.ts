import "server-only";
import { repository } from "../db/client";
import { comparisons } from "./comparison";
import { normalize } from "../search/matching";
import type { Product, Comparison } from "../contracts";

export type RelatedItem = {
  product: Product;
  comparison: Comparison | null;
  relationType: "edition" | "addon" | "bundle";
};

export type RelatedGroup = {
  editions: RelatedItem[];
  addons: RelatedItem[];
};

const EDITION_CLEAN_RE =
  /\b(standard|deluxe|premium|ultimate|vault|cross-?gen|game of the year|goty|gold|silver|collector'?s?|anniversary|enhanced|bundle|edition|pack)\b/gi;

export function extractFranchiseName(title: string): string {
  const cleaned = title
    .replace(EDITION_CLEAN_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 3 ? cleaned : title;
}

export async function getRelatedProducts(productId: string): Promise<RelatedGroup> {
  const repo = repository();
  const current = repo.product(productId);
  if (!current) {
    return { editions: [], addons: [] };
  }

  const franchise = extractFranchiseName(current.title);
  const normalizedFranchise = normalize(franchise);
  const franchiseTokens = normalizedFranchise.split(" ").filter((w) => w.length >= 3);

  const candidates = repo.searchCandidates();
  const matched = candidates.filter((p) => {
    if (p.id === current.id) return false;
    const norm = normalize(p.title);
    if (norm.includes(normalizedFranchise)) return true;
    return franchiseTokens.length >= 2 && franchiseTokens.every((t) => norm.includes(t));
  });

  const comparisonService = comparisons();
  const relatedItems: RelatedItem[] = await Promise.all(
    matched.slice(0, 10).map(async (p) => {
      let comp: Comparison | null = null;
      try {
        comp = await comparisonService.get(p.id, { cachedOnly: true });
      } catch {
        comp = null;
      }

      const relationType: RelatedItem["relationType"] =
        p.type === "dlc" ? "addon" : p.type === "bundle" ? "bundle" : "edition";

      return {
        product: p,
        comparison: comp,
        relationType,
      };
    }),
  );

  return {
    editions: relatedItems.filter((item) => item.relationType !== "addon"),
    addons: relatedItems.filter((item) => item.relationType === "addon"),
  };
}
