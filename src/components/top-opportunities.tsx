"use client";
import { useEffect, useState, useId, useMemo } from "react";
import {
  ArrowUpRight,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  FileSpreadsheet,
  FileCode,
  Copy,
  Check,
  Search,
  SlidersHorizontal,
  RefreshCw,
  DollarSign,
  Tag,
  Layers,
} from "lucide-react";
import type {
  OpportunitiesPage,
  OpportunityKind,
} from "@/lib/pricing/opportunities";
import type { RegionResult } from "@/lib/contracts";
import { regions } from "@/lib/regions";
import { currency } from "@/lib/pricing/format";
import { api } from "./client-api";
import { Cover } from "./cover";
import { ProductLink } from "./product-link";
import {
  addToBasket,
  removeFromBasket,
  isInBasket,
  subscribeBasket,
} from "@/lib/basket-store";

export function TopOpportunities({
  kind = "games",
}: {
  kind?: OpportunityKind;
}) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  const label = kind === "dlc" ? "DLCs & add-ons" : kind === "all" ? "all titles" : "games";
  const [data, setData] = useState<OpportunitiesPage | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [basketIds, setBasketIds] = useState<Set<string>>(new Set());

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("ALL");
  const [marginThreshold, setMarginThreshold] = useState<number>(0);
  const [sortBy, setSortBy] = useState<"marginPercent" | "marginUsd" | "cost" | "title">("marginPercent");
  const [viewMode, setViewMode] = useState<"standard" | "reseller">("standard");
  const [copied, setCopied] = useState(false);

  // Scan catalog state
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  useEffect(() => {
    function updateBasketState() {
      if (data?.items) {
        const inBasket = new Set<string>();
        for (const it of data.items) {
          if (isInBasket(it.product.id)) inBasket.add(it.product.id);
        }
        setBasketIds(inBasket);
      }
    }
    updateBasketState();
    return subscribeBasket(updateBasketState);
  }, [data]);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setData(null);
    api<OpportunitiesPage>("/api/opportunities?kind=" + kind, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt, kind]);

  // Catalog scanning to ingest more games from database
  async function handleScanCatalog() {
    setScanning(true);
    setScanStatus("Scanning unpriced database titles...");
    try {
      const res = await api<{
        scanned: number;
        totalRemaining: number;
        opportunities: OpportunitiesPage;
      }>("/api/opportunities", {
        method: "POST",
      });
      if (res?.opportunities) {
        setData(res.opportunities);
      }
      setScanStatus(`Scanned ${res.scanned} titles (${res.totalRemaining} remaining in database).`);
      setTimeout(() => setScanStatus(null), 4000);
    } catch {
      setScanStatus("Scan failed. Try again.");
      setTimeout(() => setScanStatus(null), 4000);
    } finally {
      setScanning(false);
    }
  }

  // Filter and sort items
  const items = data?.items;
  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items
      .filter((item) => {
        if (marketFilter !== "ALL" && !item.countries.includes(marketFilter as RegionResult["market"])) {
          return false;
        }
        if (marginThreshold > 0 && Number(item.differencePercent) < marginThreshold) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return item.product.title.toLowerCase().includes(q) || item.product.id.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "marginPercent") {
          return Number(b.differencePercent) - Number(a.differencePercent);
        }
        if (sortBy === "marginUsd") {
          return Number(b.differenceUsd) - Number(a.differenceUsd);
        }
        if (sortBy === "cost") {
          return Number(a.sourcingCostUsd) - Number(b.sourcingCostUsd);
        }
        if (sortBy === "title") {
          return a.product.title.localeCompare(b.product.title);
        }
        return 0;
      });
  }, [items, marketFilter, marginThreshold, searchQuery, sortBy]);

  // Aggregate statistics for the team / marketplace
  const stats = useMemo(() => {
    if (!filteredItems.length) return null;
    let totalArbitrageUsd = 0;
    let sumPercent = 0;
    const marketCounts: Record<string, number> = {};

    for (const it of filteredItems) {
      totalArbitrageUsd += Number(it.differenceUsd);
      sumPercent += Number(it.differencePercent);
      const m = it.cheapest.market;
      marketCounts[m] = (marketCounts[m] || 0) + 1;
    }

    const topMarket = Object.entries(marketCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TR";
    const avgPercent = (sumPercent / filteredItems.length).toFixed(1);

    return {
      count: filteredItems.length,
      totalArbitrageUsd: totalArbitrageUsd.toFixed(2),
      avgPercent,
      topMarket,
    };
  }, [filteredItems]);

  const displayedItems = expanded ? filteredItems : filteredItems.slice(0, 6);

  // E-commerce CSV Export (RFC 4180)
  function exportCsv() {
    if (!filteredItems.length) return;
    const headers = [
      "Product ID",
      "Title",
      "Type",
      "Sourcing Market",
      "Sourcing Cost (USD)",
      "Sourcing Currency",
      "Sourcing Local Amount",
      "Reference Market",
      "Reference Price (USD)",
      "Gross Margin (USD)",
      "Margin (%)",
      "Suggested Resale (USD)",
      "Projected Profit (USD)",
      "Direct Store URL",
    ];

    const rows = filteredItems.map((it) => [
      `"${it.product.id}"`,
      `"${it.product.title.replace(/"/g, '""')}"`,
      `"${it.product.type}"`,
      `"${it.cheapest.market}"`,
      `"${it.sourcingCostUsd}"`,
      `"${it.cheapest.currency}"`,
      `"${it.cheapest.currentAmount}"`,
      `"${it.highest.market}"`,
      `"${it.referenceUsd}"`,
      `"${it.marginUsd}"`,
      `"${it.marginPercent}%"`,
      `"${it.suggestedResaleUsd}"`,
      `"${it.projectedProfitUsd}"`,
      `"${it.cheapest.storeUrl}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xbox-game-arbitrage-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // E-commerce JSON Export
  function exportJson() {
    if (!filteredItems.length) return;
    const jsonStr = JSON.stringify(
      filteredItems.map((it) => ({
        productId: it.product.id,
        title: it.product.title,
        type: it.product.type,
        sourcingMarket: it.cheapest.market,
        sourcingCostUsd: Number(it.sourcingCostUsd),
        sourcingLocalAmount: it.cheapest.currentAmount,
        sourcingCurrency: it.cheapest.currency,
        referenceMarket: it.highest.market,
        referenceUsd: Number(it.referenceUsd),
        grossMarginUsd: Number(it.marginUsd),
        marginPercent: Number(it.marginPercent),
        suggestedResaleUsd: Number(it.suggestedResaleUsd),
        projectedProfitUsd: Number(it.projectedProfitUsd),
        storeUrl: it.cheapest.storeUrl,
      })),
      null,
      2,
    );
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xbox-game-arbitrage-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Markdown Export
  async function copyMarkdown() {
    if (!filteredItems.length) return;
    const header =
      "| # | Game | Type | Sourcing Market | Sourcing USD | Retail Benchmark | Margin | Store |\n|---|---|---|---|---|---|---|---|";
    const rows = filteredItems.map(
      (it, i) =>
        `| ${i + 1} | [${it.product.title}](${it.cheapest.storeUrl}) | ${it.product.type} | ${regions[it.cheapest.market].name} | $${it.sourcingCostUsd} | $${it.referenceUsd} | **${it.marginPercent}%** (+$${it.marginUsd}) | [Buy](${it.cheapest.storeUrl}) |`,
    );
    await navigator.clipboard.writeText([header, ...rows].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Bulk Add to Basket
  function addAllVisibleToBasket() {
    for (const it of filteredItems) {
      addToBasket(it.product);
    }
  }

  return (
    <section
      className="mt-9"
      aria-label={"Regional price gaps and opportunities for " + label}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <TrendingDown size={16} />
            {kind === "dlc"
              ? "Known add-ons. Bigger savings."
              : "Regional price gaps. Unlimited catalog."}
          </p>
          <h2 className="text-xl font-bold">
            {kind === "dlc"
              ? "DLC & add-on price gaps"
              : "Regional price gaps & arbitrage"}
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            All games and packs with verified regional price differences in the system.
            Ranked by percentage savings and profit margin across US, Turkey, India, and Japan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="badge">
              {filteredItems.length} of {data.items.length} titles available
            </span>
          )}
          <button
            type="button"
            onClick={handleScanCatalog}
            disabled={scanning}
            className="btn !py-1.5 !px-3 text-xs"
            title="Scan next batch of unpriced products in SQLite database"
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning DB..." : "Scan DB titles"}
          </button>
        </div>
      </div>

      {scanStatus && (
        <div className="mb-4 rounded-lg bg-brand-soft p-3 text-xs text-brand">
          {scanStatus}
        </div>
      )}

      {error ? (
        <div className="panel p-5 text-sm">
          <p>Could not load regional savings.</p>
          <button className="btn mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div
          className="grid gap-4 md:grid-cols-3"
          role="status"
          aria-label="Loading top regional savings"
        >
          {[1, 2, 3].map((n) => (
            <div key={n} className="panel h-52 p-5">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton mt-6 h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {data.warnings.map((w) => (
            <p key={w} className="mb-3 text-xs text-muted">
              {w}
            </p>
          ))}

          {/* Portfolio & Reseller Analytics Summary Bar */}
          {stats && (
            <div className="panel mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
              <div>
                <p className="eyebrow flex items-center gap-1">
                  <Layers size={13} /> Tracked Gaps
                </p>
                <p className="text-xl font-bold">{stats.count} titles</p>
              </div>
              <div>
                <p className="eyebrow flex items-center gap-1">
                  <DollarSign size={13} /> Total Spread
                </p>
                <p className="text-xl font-bold text-positive">
                  ${stats.totalArbitrageUsd} USD
                </p>
              </div>
              <div>
                <p className="eyebrow flex items-center gap-1">
                  <Tag size={13} /> Avg Discount
                </p>
                <p className="text-xl font-bold text-positive">
                  {stats.avgPercent}% less
                </p>
              </div>
              <div>
                <p className="eyebrow">Top Sourcing Region</p>
                <p className="text-xl font-bold">
                  {regions[stats.topMarket as keyof typeof regions]?.name ?? stats.topMarket}
                </p>
              </div>
            </div>
          )}

          {/* Catalog Controls, Search & Export Bar */}
          <div className="panel mb-5 space-y-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 text-muted" size={15} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by title or product ID..."
                  className="h-9 w-full rounded-lg border border-line bg-background pl-9 pr-3 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Reseller Mode Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setViewMode((m) => (m === "standard" ? "reseller" : "standard"))
                  }
                  className={`btn !py-1.5 !px-3 text-xs ${
                    viewMode === "reseller"
                      ? "border-brand bg-brand-soft text-brand font-semibold"
                      : ""
                  }`}
                  title="Toggle Reseller / Commercial Arbitrage view for game selling"
                >
                  <DollarSign size={13} />
                  {viewMode === "reseller" ? "Store / Resale View" : "Reseller Mode"}
                </button>

                {/* Bulk Add to Basket */}
                <button
                  type="button"
                  onClick={addAllVisibleToBasket}
                  className="btn !py-1.5 !px-3 text-xs"
                  title="Add all currently filtered games to purchasing basket"
                >
                  <ShoppingBag size={13} />
                  Add All to Basket
                </button>

                {/* Export Options */}
                <div className="flex items-center gap-1 border-l border-line pl-2">
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="btn !py-1.5 !px-2.5 text-xs"
                    title="Export CSV formatted for e-commerce store catalog"
                  >
                    <FileSpreadsheet size={13} />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportJson}
                    className="btn !py-1.5 !px-2.5 text-xs"
                    title="Export JSON dataset for website development"
                  >
                    <FileCode size={13} />
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="btn !py-1.5 !px-2.5 text-xs"
                    title="Copy Markdown table for team documentation"
                  >
                    {copied ? <Check size={13} className="text-positive" /> : <Copy size={13} />}
                    {copied ? "Copied" : "MD"}
                  </button>
                </div>
              </div>
            </div>

            {/* Sourcing Country and Margin Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 flex items-center gap-1 text-muted">
                  <SlidersHorizontal size={12} /> Sourcing:
                </span>
                {(["ALL", "TR", "IN", "JP", "US"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarketFilter(m)}
                    className={`btn !h-6 !px-2 text-[11px] ${
                      marketFilter === m ? "btn-primary !h-6" : ""
                    }`}
                  >
                    {m === "ALL" ? "All Markets" : regions[m].name}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-muted">Min Gap:</span>
                  <select
                    value={marginThreshold}
                    onChange={(e) => setMarginThreshold(Number(e.target.value))}
                    className="rounded border border-line bg-background px-2 py-0.5 text-xs"
                  >
                    <option value={0}>Any gap</option>
                    <option value={25}>≥25%</option>
                    <option value={40}>≥40%</option>
                    <option value={60}>≥60%</option>
                    <option value={75}>≥75%</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-muted">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as
                          | "marginPercent"
                          | "marginUsd"
                          | "cost"
                          | "title",
                      )
                    }
                    className="rounded border border-line bg-background px-2 py-0.5 text-xs"
                  >
                    <option value="marginPercent">Highest Gap %</option>
                    <option value="marginUsd">Highest $ Spread</option>
                    <option value="cost">Lowest Cost ($)</option>
                    <option value="title">Title (A-Z)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredItems.length ? (
            <div
              id={listId}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {displayedItems.map((item, index) => (
                <article
                  className="panel flex flex-col p-5"
                  key={item.product.id}
                >
                  <ProductLink
                    id={item.product.id}
                    className="flex items-start gap-3 hover:text-brand"
                  >
                    <Cover
                      src={item.product.cover}
                      title={item.product.title}
                      className="h-20 w-14"
                    />
                    <div className="min-w-0">
                      <p className="eyebrow mb-2">
                        #{index + 1} regional gap · {item.product.type}
                      </p>
                      <h3 className="text-sm font-semibold">
                        {item.product.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-muted">
                        ID: {item.product.id}
                      </p>
                    </div>
                  </ProductLink>

                  {/* Reseller Mode vs Standard Mode Card Interior */}
                  {viewMode === "reseller" ? (
                    <div className="my-4 rounded-lg bg-surface p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between border-b border-line pb-2">
                        <span className="text-muted">Sourcing Cost (Buy at):</span>
                        <strong className="text-sm">
                          ${item.sourcingCostUsd} USD
                          <span className="ml-1 text-[10px] font-normal text-muted">
                            ({item.cheapest.currentAmount} {item.cheapest.currency})
                          </span>
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Retail Benchmark:</span>
                        <span>${item.referenceUsd} USD ({regions[item.highest.market].name})</span>
                      </div>
                      <div className="flex items-center justify-between text-positive font-bold">
                        <span>Gross Arbitrage:</span>
                        <span>+${item.marginUsd} USD ({item.marginPercent}%)</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-line pt-2 text-[11px]">
                        <span className="text-muted">Suggested Resale (~20% off):</span>
                        <span className="font-semibold text-brand">
                          ${item.suggestedResaleUsd} (Net Profit: +${item.projectedProfitUsd})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-bold text-positive">
                          {Number(item.differencePercent).toFixed(1)}% less
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {currency(item.differenceUsd)} USD difference
                        </p>
                      </div>
                      <p className="text-right text-xl font-bold">
                        {currency(item.cheapest.usd)}
                        <span className="block text-[10px] font-normal text-muted">
                          Estimated USD
                        </span>
                      </p>
                    </div>
                  )}

                  <p className="text-xs leading-5">
                    Cheapest:{" "}
                    <strong>
                      {item.countries.map((m) => regions[m].name).join(" / ")}
                    </strong>{" "}
                    ·{" "}
                    {currency(
                      item.cheapest.currentAmount,
                      item.cheapest.currency,
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Compared with {regions[item.highest.market].name} at{" "}
                    {currency(item.highest.usd)} USD · {item.comparedMarkets}
                    /4 markets comparable
                  </p>

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <ProductLink id={item.product.id} className="btn flex-1">
                      Compare prices
                    </ProductLink>
                    <button
                      type="button"
                      onClick={() => {
                        if (basketIds.has(item.product.id)) {
                          removeFromBasket(item.product.id);
                        } else {
                          addToBasket(item.product);
                        }
                      }}
                      className={`btn !px-3 ${
                        basketIds.has(item.product.id)
                          ? "border-brand bg-brand-soft text-brand font-semibold"
                          : ""
                      }`}
                      title={
                        basketIds.has(item.product.id)
                          ? "In purchasing basket"
                          : "Add to purchasing basket"
                      }
                    >
                      <ShoppingBag size={15} />
                    </button>
                    <a
                      href={item.cheapest.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      aria-label={
                        "Open " +
                        regions[item.cheapest.market].name +
                        " store for " +
                        item.product.title +
                        " (new tab)"
                      }
                    >
                      Store <ArrowUpRight size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel p-6 text-sm text-muted">
              No price gaps matching your filter criteria right now. Adjust your filters or search above.
            </div>
          )}

          {/* Show More / Show Fewer / Show All Button */}
          {filteredItems.length > 6 && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                className="btn"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? "Show top 6 " + label
                  : "Show all " + label + " (" + filteredItems.length + " total)"}
                {expanded ? (
                  <ChevronUp size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-5 text-muted">
            All prices are dynamically evaluated across Microsoft regional catalog endpoints and
            daily ECB exchange rates. Price differences and suggested resale profit margins are gross
            estimates before payment gateway processing fees and taxes.
          </p>
        </>
      )}
    </section>
  );
}
