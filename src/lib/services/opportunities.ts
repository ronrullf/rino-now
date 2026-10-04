import "server-only";
import { comparisons } from "./comparison";
import { config } from "../config";
import {
  rankOpportunities,
  type OpportunitiesPage,
  type OpportunityKind,
} from "../pricing/opportunities";
import type { Comparison } from "../contracts";
// Editorial selection of recognizable games, not a download-count ranking.
// Exact editions verified against Microsoft's US catalog on 2026-10-03.
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
    const featured = kind === "dlc" ? featuredAddons : featuredGames;
    const selected =
      config.DATA_MODE === "fixture" ? featured.slice(0, 1) : featured;
    const results: Comparison[] = [];
    let index = 0,
      failures = 0;
    async function worker() {
      while (index < selected.length) {
        const game = selected[index++];
        try {
          results.push(await comparisons().get(game.id, { fresh: true }));
        } catch {
          failures++;
        }
      }
    }
    await Promise.all([worker(), worker()]);
    return {
      items: rankOpportunities(results, kind),
      checked: results.length,
      selected: selected.length,
      warnings: failures
        ? [
            "Some selected products could not be checked. Rankings cover only successful comparisons.",
          ]
        : [],
    };
  })().finally(() => {
    flights.delete(kind);
  });
  flights.set(kind, flight);
  return flight;
}
