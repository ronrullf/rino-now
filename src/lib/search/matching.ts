import type { Product } from "../contracts";
export type SearchKind = "all" | "games" | "dlc";
export function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
const aliases: Record<string, string> = {
  gta: "grand theft auto",
  cod: "call of duty",
  fh5: "forza horizon 5",
  fh4: "forza horizon 4",
  vbucks: "v bucks",
};
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = old;
    }
  }
  return row[b.length];
}
export function searchTerms(query: string, titles: string[] = []) {
  const original = normalize(query);
  const expanded = original
    .split(" ")
    .map((w) => aliases[w] ?? w)
    .join(" ");
  const vocabulary = [
    ...new Set(
      normalize(
        "fortnite forza horizon minecraft assassin creed grand theft auto call duty battlefield cyberpunk elden ring " +
          titles.join(" "),
      ).split(" "),
    ),
  ].filter((w) => w.length >= 4);
  const corrected = expanded
    .split(" ")
    .map((word) => {
      if (word.length < 4 || vocabulary.includes(word)) return word;
      const candidates = vocabulary.filter(
        (w) =>
          w[0] === word[0] &&
          Math.abs(w.length - word.length) <= 1 &&
          distance(word, w) <= 1,
      );
      return candidates.length === 1 ? candidates[0] : word;
    })
    .join(" ");
  // Limit remote work. Short fragments still go to the catalog unchanged.
  return [
    ...new Set([
      original,
      corrected,
      corrected
        .split(" ")
        .filter((w) => w.length >= 4)
        .slice(0, 2)
        .join(" "),
    ]),
  ]
    .filter(Boolean)
    .slice(0, 3);
}
export function matchesKind(p: Product, kind: SearchKind) {
  return (
    kind === "all" ||
    (kind === "dlc"
      ? p.type === "dlc"
      : ["game", "bundle", "edition"].includes(p.type))
  );
}
export function relevance(title: string, terms: string[]) {
  const normalized = normalize(title),
    words = normalized.split(" ");
  return Math.max(
    ...terms.map((term) => {
      if (normalized === term) return 100;
      if (normalized.includes(term)) return 80;
      const tokens = term.split(" ");
      const hits = tokens.filter((token) =>
        words.some(
          (w) =>
            w.startsWith(token) ||
            (token.length >= 4 &&
              Math.abs(w.length - token.length) <= 1 &&
              distance(token, w) <= 1),
        ),
      ).length;
      return hits === tokens.length ? 60 : 0;
    }),
  );
}
export function rankProducts(
  products: Product[],
  terms: string[],
  kind: SearchKind,
) {
  return [...new Map(products.map((p) => [p.id, p])).values()]
    .filter((p) => matchesKind(p, kind))
    .map((p) => ({ p, score: relevance(p.title, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title))
    .slice(0, 20)
    .map((r) => r.p);
}
