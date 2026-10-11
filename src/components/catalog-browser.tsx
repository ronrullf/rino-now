"use client";
import { useEffect, useState, useMemo } from "react";
import {
  Globe2,
  Search,
  RefreshCw,
  ShoppingBag,
  ArrowUpRight,
  SlidersHorizontal,
  FileSpreadsheet,
  Copy,
  Check,
  Table as TableIcon,
  LayoutGrid,
  CheckCircle2,
} from "lucide-react";
import type { MasterCatalogResult } from "@/lib/services/catalog-sync";
import type { Market } from "@/lib/regions";
import type { Product } from "@/lib/contracts";
import { regions } from "@/lib/regions";
import { api } from "./client-api";
import { Cover } from "./cover";
import { ProductLink } from "./product-link";
import {
  addToBasket,
  removeFromBasket,
  isInBasket,
  subscribeBasket,
} from "@/lib/basket-store";

const FLAG_EMOJI: Record<Market, string> = {
  US: "🇺🇸",
  TR: "🇹🇷",
  IN: "🇮🇳",
  JP: "🇯🇵",
};

export function CatalogBrowser() {
  const [data, setData] = useState<MasterCatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<Market | "ALL">("ALL");
  const [minSavings, setMinSavings] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"savings" | "lowestUsd" | "highestUsd" | "title">("savings");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Syncing state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Basket & copy state
  const [basketIds, setBasketIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function updateBasketState() {
      if (data?.items) {
        const inBasket = new Set<string>();
        for (const it of data.items) {
          if (isInBasket(it.id)) inBasket.add(it.id);
        }
        setBasketIds(inBasket);
      }
    }
    updateBasketState();
    return subscribeBasket(updateBasketState);
  }, [data]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api<MasterCatalogResult>("/api/catalog", { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  async function handleSyncCatalog() {
    setSyncing(true);
    setSyncMessage("Syncing batch of games from Microsoft Store...");
    try {
      const res = await api<{
        synced: number;
        totalKnown: number;
        totalWithPrices: number;
        nextBatchRemaining: number;
      }>("/api/catalog/sync?batch=25", { method: "POST" });
      setSyncMessage(
        `Successfully synced ${res.synced} games! Total in database: ${res.totalWithPrices}.`,
      );
      setAttempt((n) => n + 1);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch {
      setSyncMessage("Sync failed. Please check network connection.");
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setSyncing(false);
    }
  }

  const items = data?.items;
  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items
      .filter((it) => {
        if (marketFilter !== "ALL" && it.cheapestMarket !== marketFilter) return false;
        if (minSavings > 0 && Number(it.differencePercent ?? 0) < minSavings) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return it.title.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "savings") {
          return Number(b.differencePercent ?? 0) - Number(a.differencePercent ?? 0);
        }
        if (sortBy === "lowestUsd") {
          return Number(a.cheapestUsd ?? 999999) - Number(b.cheapestUsd ?? 999999);
        }
        if (sortBy === "highestUsd") {
          return Number(b.cheapestUsd ?? 0) - Number(a.cheapestUsd ?? 0);
        }
        if (sortBy === "title") {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [items, marketFilter, minSavings, searchQuery, sortBy]);

  // Export RFC 4180 CSV with all 4 regional links
  function exportCatalogCsv() {
    if (!filteredItems.length) return;
    const headers = [
      "Product ID",
      "Title",
      "Type",
      "Cheapest Market",
      "Cheapest (USD)",
      "Savings (%)",
      "US Price",
      "US Store URL",
      "Turkey Price (TRY)",
      "Turkey USD",
      "Turkey Store URL",
      "India Price (INR)",
      "India USD",
      "India Store URL",
      "Japan Price (JPY)",
      "Japan USD",
      "Japan Store URL",
    ];

    const rows = filteredItems.map((it) => {
      const us = it.regions.find((r) => r.market === "US");
      const tr = it.regions.find((r) => r.market === "TR");
      const inReg = it.regions.find((r) => r.market === "IN");
      const jp = it.regions.find((r) => r.market === "JP");

      return [
        `"${it.id}"`,
        `"${it.title.replace(/"/g, '""')}"`,
        `"${it.type}"`,
        `"${it.cheapestMarket ?? "N/A"}"`,
        `"${it.cheapestUsd ?? "N/A"}"`,
        `"${it.differencePercent ? it.differencePercent + "%" : "0%"}"`,
        `"${us?.nativeAmount ? "$" + us.nativeAmount : "Unavailable"}"`,
        `"${us?.storeUrl ?? ""}"`,
        `"${tr?.nativeAmount ? tr.nativeAmount + " TRY" : "Unavailable"}"`,
        `"${tr?.usdAmount ? "$" + tr.usdAmount : "N/A"}"`,
        `"${tr?.storeUrl ?? ""}"`,
        `"${inReg?.nativeAmount ? inReg.nativeAmount + " INR" : "Unavailable"}"`,
        `"${inReg?.usdAmount ? "$" + inReg.usdAmount : "N/A"}"`,
        `"${inReg?.storeUrl ?? ""}"`,
        `"${jp?.nativeAmount ? jp.nativeAmount + " JPY" : "Unavailable"}"`,
        `"${jp?.usdAmount ? "$" + jp.usdAmount : "N/A"}"`,
        `"${jp?.storeUrl ?? ""}"`,
      ];
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `microsoft-store-all-regions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Export Markdown table
  async function copyMarkdownTable() {
    if (!filteredItems.length) return;
    const header =
      "| # | Game | Cheapest Market | Best USD | US Store | Turkey Store | India Store | Japan Store |\n|---|---|---|---|---|---|---|---|";
    const rows = filteredItems.map((it, i) => {
      const us = it.regions.find((r) => r.market === "US");
      const tr = it.regions.find((r) => r.market === "TR");
      const inReg = it.regions.find((r) => r.market === "IN");
      const jp = it.regions.find((r) => r.market === "JP");

      return `| ${i + 1} | [${it.title}](${it.storeUrl}) | ${it.cheapestMarket ?? "N/A"} | $${it.cheapestUsd ?? "N/A"} | [${us?.nativeAmount ? "$" + us.nativeAmount : "Store"}](${us?.storeUrl}) | [${tr?.nativeAmount ? tr.nativeAmount + " TRY" : "Store"}](${tr?.storeUrl}) | [${inReg?.nativeAmount ? inReg.nativeAmount + " INR" : "Store"}](${inReg?.storeUrl}) | [${jp?.nativeAmount ? jp.nativeAmount + " JPY" : "Store"}](${jp?.storeUrl}) |`;
    });

    await navigator.clipboard.writeText([header, ...rows].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAddAllToBasket() {
    for (const it of filteredItems) {
      addToBasket({
        id: it.id,
        title: it.title,
        type: it.type as Product["type"],
        publisher: it.publisher,
        cover: it.cover,
        platforms: it.platforms,
        metadataFetchedAt: new Date().toISOString(),
        sourceMarket: "US",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and Sync Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <Globe2 size={16} /> All Microsoft Store Regional Pricing
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Master Game Catalog
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Inspect all Xbox & PC games with synchronized live prices across the United States, Turkey,
            India, and Japan. Compare native currencies, calculated USD amounts, and access direct store links
            for every market.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="badge">
              <CheckCircle2 size={12} className="text-positive" />
              {data.syncedInDb} games in database · {data.totalDiscoverable} discoverable
            </span>
          )}
          <button
            type="button"
            onClick={handleSyncCatalog}
            disabled={syncing}
            className="btn btn-primary !h-10 !px-4 text-xs font-semibold"
            title="Batch-fetch the next 25 games from Microsoft Store"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing Store..." : "Sync 25 More Games"}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-lg bg-brand-soft p-3 text-xs text-brand font-medium">
          {syncMessage}
        </div>
      )}

      {/* Control Bar: Filters, Sorting, Search, and Exports */}
      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-3 text-muted" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by game title or 12-char Product ID..."
              className="h-10 w-full rounded-lg border border-line bg-background pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-line bg-background p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  viewMode === "table" ? "bg-surface shadow-sm text-foreground" : "text-muted"
                }`}
                title="Table view with side-by-side regional links"
              >
                <TableIcon size={14} /> Matrix Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  viewMode === "grid" ? "bg-surface shadow-sm text-foreground" : "text-muted"
                }`}
                title="Grid cards view"
              >
                <LayoutGrid size={14} /> Cards
              </button>
            </div>

            {/* Add All Visible to Basket */}
            <button
              type="button"
              onClick={handleAddAllToBasket}
              className="btn !h-10 !px-3 text-xs"
              title="Add all currently filtered games to purchasing planner"
            >
              <ShoppingBag size={14} /> Add All ({filteredItems.length})
            </button>

            {/* Export Actions */}
            <div className="flex items-center gap-1 border-l border-line pl-2">
              <button
                type="button"
                onClick={exportCatalogCsv}
                className="btn !h-10 !px-3 text-xs"
                title="Export complete 4-market catalog to CSV"
              >
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button
                type="button"
                onClick={copyMarkdownTable}
                className="btn !h-10 !px-3 text-xs"
                title="Copy markdown table to clipboard"
              >
                {copied ? <Check size={14} className="text-positive" /> : <Copy size={14} />}
                {copied ? "Copied" : "MD"}
              </button>
            </div>
          </div>
        </div>

        {/* Region & Savings Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 flex items-center gap-1 text-muted">
              <SlidersHorizontal size={13} /> Cheapest In:
            </span>
            {(["ALL", "TR", "IN", "JP", "US"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMarketFilter(m)}
                className={`btn !h-7 !px-2.5 text-xs ${
                  marketFilter === m ? "btn-primary !h-7" : ""
                }`}
              >
                {m === "ALL" ? "All Markets" : `${FLAG_EMOJI[m]} ${regions[m].name}`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-muted">Min Savings:</span>
              <select
                value={minSavings}
                onChange={(e) => setMinSavings(Number(e.target.value))}
                className="rounded border border-line bg-background px-2 py-1 text-xs"
              >
                <option value={0}>Any savings</option>
                <option value={20}>≥20%</option>
                <option value={40}>≥40%</option>
                <option value={60}>≥60%</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | "savings"
                      | "lowestUsd"
                      | "highestUsd"
                      | "title",
                  )
                }
                className="rounded border border-line bg-background px-2 py-1 text-xs"
              >
                <option value="savings">Biggest Savings %</option>
                <option value="lowestUsd">Lowest Price (USD)</option>
                <option value="highestUsd">Highest Price (USD)</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="panel p-8 text-center" role="status">
          <RefreshCw size={24} className="mx-auto animate-spin text-brand" />
          <p className="mt-3 text-sm text-muted">Loading regional catalog from database...</p>
        </div>
      ) : error ? (
        <div className="panel p-6 text-sm">
          <p>Could not load catalog.</p>
          <button className="btn mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !filteredItems.length ? (
        <div className="panel p-10 text-center text-sm text-muted">
          No games matching your filter criteria. Adjust your filters or click &quot;Sync 25 More Games&quot; above.
        </div>
      ) : viewMode === "table" ? (
        /* Matrix Table View */
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-line bg-surface text-muted uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Game</th>
                <th className="py-3 px-4">🇺🇸 United States</th>
                <th className="py-3 px-4">🇹🇷 Turkey</th>
                <th className="py-3 px-4">🇮🇳 India</th>
                <th className="py-3 px-4">🇯🇵 Japan</th>
                <th className="py-3 px-4">Best Market</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredItems.map((item) => {
                const us = item.regions.find((r) => r.market === "US");
                const tr = item.regions.find((r) => r.market === "TR");
                const inReg = item.regions.find((r) => r.market === "IN");
                const jp = item.regions.find((r) => r.market === "JP");

                return (
                  <tr key={item.id} className="hover:bg-brand-soft/40 transition-colors">
                    {/* Game title & cover */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Cover src={item.cover} title={item.title} className="h-12 w-9 shrink-0" />
                        <div className="min-w-0">
                          <ProductLink id={item.id} className="font-semibold hover:text-brand block truncate max-w-[220px]">
                            {item.title}
                          </ProductLink>
                          <span className="text-[10px] text-muted">{item.id}</span>
                        </div>
                      </div>
                    </td>

                    {/* US Column */}
                    <td className="py-3 px-4">
                      {us?.status === "available" && us.nativeAmount ? (
                        <div>
                          <p className="font-semibold">${us.nativeAmount} USD</p>
                          <a
                            href={us.storeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                          >
                            US Store <ArrowUpRight size={11} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted">Unavailable</span>
                      )}
                    </td>

                    {/* Turkey Column */}
                    <td className="py-3 px-4">
                      {tr?.status === "available" && tr.nativeAmount ? (
                        <div>
                          <p className={`font-semibold ${item.cheapestMarket === "TR" ? "text-positive font-bold" : ""}`}>
                            {tr.nativeAmount} TRY
                          </p>
                          <p className="text-[10px] text-muted">~${tr.usdAmount} USD</p>
                          <a
                            href={tr.storeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                          >
                            TR Store <ArrowUpRight size={11} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted">Unavailable</span>
                      )}
                    </td>

                    {/* India Column */}
                    <td className="py-3 px-4">
                      {inReg?.status === "available" && inReg.nativeAmount ? (
                        <div>
                          <p className={`font-semibold ${item.cheapestMarket === "IN" ? "text-positive font-bold" : ""}`}>
                            {inReg.nativeAmount} INR
                          </p>
                          <p className="text-[10px] text-muted">~${inReg.usdAmount} USD</p>
                          <a
                            href={inReg.storeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand hover:underline"
                          >
                            IN Store <ArrowUpRight size={11} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted">Unavailable</span>
                      )}
                    </td>

                    {/* Japan Column */}
                    <td className="py-3 px-4">
                      {jp?.status === "available" && jp.nativeAmount ? (
                        <div>
                          <p className={`font-semibold ${item.cheapestMarket === "JP" ? "text-positive font-bold" : ""}`}>
                            {jp.nativeAmount} JPY
                          </p>
                          <p className="text-[10px] text-muted">~${jp.usdAmount} USD</p>
                          <a
                            href={jp.storeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand hover:underline"
                          >
                            JP Store <ArrowUpRight size={11} />
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted">Unavailable</span>
                      )}
                    </td>

                    {/* Best Market & Savings */}
                    <td className="py-3 px-4">
                      {item.cheapestMarket ? (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded bg-positive-soft px-2 py-0.5 text-positive font-bold">
                            {FLAG_EMOJI[item.cheapestMarket]} {item.cheapestMarket}
                          </span>
                          {item.differencePercent && (
                            <p className="text-[11px] text-positive font-semibold mt-0.5">
                              {item.differencePercent}% less
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (basketIds.has(item.id)) {
                              removeFromBasket(item.id);
                            } else {
                              addToBasket({
                                id: item.id,
                                title: item.title,
                                type: item.type as Product["type"],
                                publisher: item.publisher,
                                cover: item.cover,
                                platforms: item.platforms,
                                metadataFetchedAt: new Date().toISOString(),
                                sourceMarket: "US",
                              });
                            }
                          }}
                          className={`btn !h-8 !px-2 ${
                            basketIds.has(item.id)
                              ? "border-brand bg-brand-soft text-brand font-semibold"
                              : ""
                          }`}
                          title={basketIds.has(item.id) ? "In basket" : "Add to basket"}
                        >
                          <ShoppingBag size={13} />
                        </button>
                        <ProductLink id={item.id} className="btn !h-8 !px-2.5">
                          View
                        </ProductLink>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid Cards View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <article className="panel flex flex-col p-4" key={item.id}>
              <div className="flex items-start gap-3">
                <Cover src={item.cover} title={item.title} className="h-16 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <ProductLink id={item.id} className="font-semibold text-xs hover:text-brand block truncate">
                    {item.title}
                  </ProductLink>
                  <span className="text-[10px] text-muted">{item.id}</span>
                  {item.differencePercent && (
                    <span className="mt-1 inline-block rounded bg-positive-soft px-1.5 py-0.5 text-[10px] font-bold text-positive">
                      {item.differencePercent}% cheaper in {item.cheapestMarket}
                    </span>
                  )}
                </div>
              </div>

              {/* 4-market Price & Link Pills */}
              <div className="my-3 divide-y divide-line rounded-lg border border-line bg-surface text-[11px]">
                {item.regions.map((reg) => (
                  <div key={reg.market} className="flex items-center justify-between p-2">
                    <span className="flex items-center gap-1 text-muted">
                      <span>{FLAG_EMOJI[reg.market]}</span> {reg.market}:
                    </span>
                    <div className="text-right flex items-center gap-2">
                      <span className={reg.market === item.cheapestMarket ? "font-bold text-positive" : ""}>
                        {reg.nativeAmount ? `${reg.nativeAmount} ${reg.currency}` : "N/A"}
                      </span>
                      <a
                        href={reg.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline inline-flex items-center"
                        title={`Open ${reg.marketName} Store`}
                      >
                        <ArrowUpRight size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex gap-2 pt-2">
                <ProductLink id={item.id} className="btn flex-1 !h-8 text-xs">
                  Compare
                </ProductLink>
                <button
                  type="button"
                  onClick={() => {
                    if (basketIds.has(item.id)) {
                      removeFromBasket(item.id);
                    } else {
                      addToBasket({
                        id: item.id,
                        title: item.title,
                        type: item.type as Product["type"],
                        publisher: item.publisher,
                        cover: item.cover,
                        platforms: item.platforms,
                        metadataFetchedAt: new Date().toISOString(),
                        sourceMarket: "US",
                      });
                    }
                  }}
                  className={`btn !h-8 !px-2.5 ${
                    basketIds.has(item.id)
                      ? "border-brand bg-brand-soft text-brand font-semibold"
                      : ""
                  }`}
                >
                  <ShoppingBag size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
