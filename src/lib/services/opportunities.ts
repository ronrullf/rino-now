import "server-only";
import { comparisons } from "./comparison";
import { config } from "../config";
import {
  rankOpportunities,
  type OpportunitiesPage,
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
];
let flight: Promise<OpportunitiesPage> | null = null;
export function opportunities(): Promise<OpportunitiesPage> {
  if (flight) return flight;
  flight = (async () => {
    const selected =
      config.DATA_MODE === "fixture"
        ? featuredGames.slice(0, 1)
        : featuredGames;
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
      items: rankOpportunities(results),
      checked: results.length,
      selected: selected.length,
      warnings: failures
        ? [
            "Some selected games could not be checked. Rankings cover only successful comparisons.",
          ]
        : [],
    };
  })().finally(() => {
    flight = null;
  });
  return flight;
}
