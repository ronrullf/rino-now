import "server-only";
import { comparisons } from "./comparison";
import { repository } from "../db/client";
import { config } from "../config";
import {
  rankOpportunities,
  type OpportunitiesPage,
  type OpportunityKind,
} from "../pricing/opportunities";
import type { Comparison } from "../contracts";

// Editorial selection of recognizable games, not a download-count ranking.
export const featuredGames = [
  { id: "9NKX70BBCDRN", title: "Forza Horizon 5 Standard Edition" },
  { id: "9PJGM0T0827V", title: "DIRT 5" },
  { id: "9P8RQH67TTT1", title: "Grand Theft Auto V" },
  { id: "9MVXMVT8ZKWC", title: "Minecraft" },
  { id: "9P3J32CTXLRZ", title: "ELDEN RING" },
  { id: "9N2ZDN7NWQKV", title: "Red Dead Redemption 2" },
  { id: "9MT5NJ5W7B8Z", title: "Hogwarts Legacy" },
  { id: "9N7JCPPCPN37", title: "Resident Evil 4" },
  { id: "9P2N57MC619K", title: "Sea of Thieves: 2026 Edition" },
  { id: "9NCJSXWZTP88", title: "Starfield" },
  { id: "9P8PGC771MLP", title: "Forza Motorsport Premium Edition" },
  { id: "9MXZBTLG26VX", title: "EA SPORTS FC™ 26 Standard Edition" },
  { id: "9NJRX71M5X9P", title: "Cuphead" },
  { id: "9NMGP6S6NJPR", title: "Battlefield™ 2042" },
  { id: "9NNZSNHLR63L", title: "Grand Theft Auto VI: Ultimate Edition" },
  { id: "9NXMBTB02ZSF", title: "Grand Theft Auto V (Xbox Series X|S)" },
  { id: "9P4811KBD5R9", title: "JoJo's Bizarre Adventure: All-Star Battle R" },
  { id: "9P6HVHDP2PGK", title: "Crimson Desert Enhanced" },
  { id: "9PJ2RVRC0L1X", title: "NBA 2K26 Standard Edition" },
  { id: "BWMQL2RPWBHB", title: "Celeste" },
];

export const featuredAddons = [
  { id: "9PNSZ7GMWCQZ", title: "Forza Horizon 5 add-on" },
  { id: "9NCJB85WM01G", title: "Fortnite - Mainframe Break Pack" },
  { id: "9N16XHX3MB1R", title: "Fortnite - 800 V-Bucks" },
  { id: "9NKV4GWZZ2SS", title: "Fortnite - 2,400 V-Bucks" },
  { id: "C22JNR2SLS6T", title: "GTA Online: Criminal Enterprise Starter Pack" },
  { id: "9PMPZZLKQM43", title: "ELDEN RING Shadow of the Erdtree" },
  { id: "9MVH0ZCSTTQP", title: "Hogwarts Legacy: Dark Arts Pack" },
  { id: "9PD2M9470N1P", title: "Resident Evil 4 - Separate Ways" },
];

const flights = new Map<OpportunityKind, Promise<OpportunitiesPage>>();

export function opportunities(
  kind: OpportunityKind = "games",
): Promise<OpportunitiesPage> {
  const existing = flights.get(kind);
  if (existing) return existing;
  const flight = (async () => {
    const featured =
      kind === "all"
        ? [...featuredGames, ...featuredAddons]
        : kind === "dlc"
          ? featuredAddons
          : featuredGames;

    if (config.DATA_MODE === "fixture") {
      const selected = featured.slice(0, 1);
      const results: Comparison[] = [];
      try {
        results.push(await comparisons().get(selected[0].id, { fresh: true }));
      } catch {}
      return {
        items: rankOpportunities(results, kind),
        checked: results.length,
        selected: selected.length,
        warnings: [],
      };
    }

    const repo = repository();
    const resultsMap = new Map<string, Comparison>();

    // 1. Immediately evaluate all existing database products with snapshots
    try {
      const cachedProducts = repo.productsWithSnapshots();
      await Promise.all(
        cachedProducts.map(async (p) => {
          try {
            const comp = await comparisons().get(p.id, { cachedOnly: true });
            resultsMap.set(p.id, comp);
          } catch {
            // Product might have partial/unparsable cached snapshot
          }
        }),
      );
    } catch {
      // Non-fatal if sqlite table not yet populated
    }

    // 2. Fetch / refresh seed products to ensure fresh market baseline
    let index = 0,
      failures = 0;
    async function worker() {
      while (index < featured.length) {
        const game = featured[index++];
        if (!resultsMap.has(game.id)) {
          try {
            const comp = await comparisons().get(game.id, { fresh: true });
            resultsMap.set(game.id, comp);
          } catch {
            failures++;
          }
        }
      }
    }
    await Promise.all([worker(), worker()]);

    const allComparisons = Array.from(resultsMap.values());
    const ranked = rankOpportunities(allComparisons, kind);

    return {
      items: ranked,
      checked: allComparisons.length,
      selected: Math.max(allComparisons.length, featured.length),
      warnings: failures
        ? [
            "Some selected products could not be checked. Rankings cover all verified comparisons in the system.",
          ]
        : [],
    };
  })().finally(() => {
    flights.delete(kind);
  });
  flights.set(kind, flight);
  return flight;
}

export async function scanCatalog(
  batchSize = 10,
): Promise<{ scanned: number; totalRemaining: number }> {
  if (config.DATA_MODE === "fixture") {
    return { scanned: 0, totalRemaining: 0 };
  }
  const repo = repository();
  const all = repo.allProducts(1000);
  const withSnapshots = new Set(repo.productsWithSnapshots().map((p) => p.id));
  const unpriced = all.filter((p) => !withSnapshots.has(p.id));

  const targetBatch = unpriced.slice(0, batchSize);
  let scanned = 0;
  for (const product of targetBatch) {
    try {
      await comparisons().get(product.id, { fresh: true });
      scanned++;
    } catch {
      // Skip on transient provider failure
    }
  }

  return {
    scanned,
    totalRemaining: Math.max(0, unpriced.length - scanned),
  };
}
