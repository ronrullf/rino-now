"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ArrowRight,
  Trash2,
  RefreshCw,
  Download,
  Copy,
  Check,
  Search,
  ShoppingBag,
} from "lucide-react";
import { api } from "./client-api";
import { ProductLink } from "./product-link";
import { Cover } from "./cover";
import { Freshness } from "./freshness";
import type { Product, Comparison, Snapshot } from "@/lib/contracts";
import { markets, regions } from "@/lib/regions";
import { currency, savings } from "@/lib/pricing/format";
import {
  addToBasket,
  removeFromBasket,
  isInBasket,
  subscribeBasket,
} from "@/lib/basket-store";

type Entry = { product: Product; comparison: Comparison | null };

export function Watchlist() {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("title");
  const [removing, setRemoving] = useState<string | null>(null);

  // New features state
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [copiedMd, setCopiedMd] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "games" | "dlc">("all");
  const [winnerFilter, setWinnerFilter] = useState<string>("all");
  const [savingsFilter, setSavingsFilter] = useState<string>("all");
  const [basketIds, setBasketIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<Entry[]>("/api/watchlist")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    function updateBasketState() {
      if (items) {
        const inBasket = new Set<string>();
        for (const item of items) {
          if (isInBasket(item.product.id)) inBasket.add(item.product.id);
        }
        setBasketIds(inBasket);
      }
    }
    updateBasketState();
    return subscribeBasket(updateBasketState);
  }, [items]);

  async function remove(id: string) {
    setRemoving(id);
    try {
      await api(`/api/watchlist/${id}`, { method: "DELETE" });
      setItems((old) => old?.filter((e) => e.product.id !== id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  async function refreshAll() {
    if (!items || !items.length || refreshingAll) return;
    setRefreshingAll(true);
    setError("");

    const total = items.length;
    for (let i = 0; i < total; i++) {
      setRefreshProgress({ current: i + 1, total });
      const entry = items[i];
      try {
        const updated = await api<Comparison>(
          `/api/products/${entry.product.id}/refresh`,
          { method: "POST" },
        );
        setItems((currentItems) =>
          currentItems?.map((it) =>
            it.product.id === entry.product.id
              ? { ...it, comparison: updated }
              : it,
          ) ?? null,
        );
      } catch {
        // Continue refreshing the rest of the items even if one fails
      }
      // Small interval to respect upstream bounds
      if (i < total - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setRefreshingAll(false);
    setRefreshProgress(null);
  }

  function toggleBasket(entry: Entry) {
    if (basketIds.has(entry.product.id)) {
      removeFromBasket(entry.product.id);
    } else {
      addToBasket(entry.product, entry.comparison);
    }
  }

  function exportCsv() {
    if (!items || !items.length) return;
    const headers = [
      "Title",
      "Product ID",
      "Type",
      "US (USD)",
      "TR (TRY)",
      "TR (USD)",
      "IN (INR)",
      "IN (USD)",
      "JP (JPY)",
      "JP (USD)",
      "Best Market",
      "Savings (USD)",
      "Savings (%)",
      "Updated",
    ];

    const rows = items.map((e) => {
      const getReg = (m: (typeof markets)[number]) =>
        e.comparison?.regions.find((r) => r.market === m);
      const bestReg = best(e);
      const us = getReg("US");
      const tr = getReg("TR");
      const inR = getReg("IN");
      const jp = getReg("JP");

      return [
        `"${e.product.title.replace(/"/g, '""')}"`,
        e.product.id,
        e.product.type,
        us?.currentAmount ?? "",
        tr?.currentAmount ?? "",
        tr?.usd ?? "",
        inR?.currentAmount ?? "",
        inR?.usd ?? "",
        jp?.currentAmount ?? "",
        jp?.usd ?? "",
        e.comparison?.winners.join("/") ?? "",
        bestReg?.savingsUsd ?? "",
        bestReg?.savingsPercent ?? "",
        timestamp(e) ? new Date(timestamp(e)).toISOString() : "",
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xbox_watchlist_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyMarkdown() {
    if (!items || !items.length) return;
    const lines = [
      "# Xbox Regional Watchlist Report",
      "",
      `*Generated on ${new Date().toLocaleDateString()} — ${items.length} items*`,
      "",
      "| Product | Type | US Price | Turkey | India | Japan | Best Region | Savings vs US |",
      "|---|---|---|---|---|---|---|---|",
    ];

    for (const e of items) {
      const getUsd = (m: (typeof markets)[number]) => {
        const r = e.comparison?.regions.find((reg) => reg.market === m);
        return r?.usd ? `$${r.usd}` : "—";
      };
      const b = best(e);
      const win = e.comparison?.winners.join(", ") || "Unavailable";
      const sav = b?.savingsUsd ? `$${b.savingsUsd} (${b.savingsPercent}%)` : "—";
      lines.push(
        `| ${e.product.title} | ${e.product.type} | ${getUsd("US")} | ${getUsd("TR")} | ${getUsd("IN")} | ${getUsd("JP")} | ${win} | ${sav} |`,
      );
    }

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2500);
  }

  const best = (e: Entry) =>
    e.comparison?.regions.find((r) => e.comparison?.winners.includes(r.market));
  const timestamp = (e: Entry) =>
    Math.max(
      0,
      ...(e.comparison?.regions.map((r) =>
        r.fetchedAt ? Date.parse(r.fetchedAt) : 0,
      ) ?? []),
    );

  // Filter items
  const filtered = (items ?? []).filter((e) => {
    if (
      searchFilter.trim() &&
      !e.product.title.toLowerCase().includes(searchFilter.toLowerCase().trim())
    ) {
      return false;
    }
    if (kindFilter === "games" && e.product.type === "dlc") return false;
    if (kindFilter === "dlc" && e.product.type !== "dlc") return false;
    if (winnerFilter !== "all" && !e.comparison?.winners.includes(winnerFilter as Snapshot["market"])) {
      return false;
    }
    if (savingsFilter !== "all") {
      const minSavings = Number(savingsFilter);
      const savPct = Number(best(e)?.savingsPercent ?? 0);
      if (savPct < minSavings) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    sort === "title"
      ? a.product.title.localeCompare(b.product.title)
      : sort === "freshness"
        ? timestamp(b) - timestamp(a)
        : Number(best(b)?.savingsUsd ?? -Infinity) -
            Number(best(a)?.savingsUsd ?? -Infinity) ||
          a.product.title.localeCompare(b.product.title),
  );

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Your saved selections</p>
          <h1 className="text-3xl font-bold tracking-tight">Watchlist</h1>
          <p className="mt-3 text-sm text-muted">
            Exact editions worth keeping an eye on. Refresh prices in batch, export reports, and plan your purchases.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items && items.length > 0 && (
            <>
              <button
                type="button"
                onClick={refreshAll}
                disabled={refreshingAll}
                className="btn"
                title="Refresh current prices for all saved products"
              >
                <RefreshCw
                  size={15}
                  className={refreshingAll ? "animate-spin" : ""}
                />
                {refreshingAll ? "Refreshing..." : "Refresh all"}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="btn"
                title="Download CSV spreadsheet"
              >
                <Download size={15} />
                Export CSV
              </button>
              <button
                type="button"
                onClick={copyMarkdown}
                className="btn"
                title="Copy Markdown summary table"
              >
                {copiedMd ? (
                  <>
                    <Check size={15} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={15} /> Copy MD
                  </>
                )}
              </button>
            </>
          )}
          <Link href="/" className="btn btn-primary">
            Find a game
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {refreshProgress && (
        <div className="mb-4 panel flex items-center justify-between border-brand bg-brand-soft/40 p-4 text-sm font-semibold text-brand">
          <div className="flex items-center gap-3">
            <RefreshCw size={17} className="animate-spin" />
            <span>
              Refreshing watchlist prices: {refreshProgress.current} of {refreshProgress.total} products
            </span>
          </div>
          <span className="text-xs">Processing cooldowns</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {items === null && !error ? (
        <div role="status" className="panel h-64 p-6">
          <p className="text-sm text-muted">Loading your watchlist…</p>
        </div>
      ) : !items?.length ? (
        <div className="panel px-6 py-20 text-center">
          <Bookmark size={34} className="mx-auto mb-5 text-brand" />
          <h2 className="text-xl font-semibold">Your shortlist starts here.</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
            Open a product comparison and save the edition you want. It will
            stay here between visits.
          </p>
          <Link href="/" className="btn mt-6">
            Explore products
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="mb-6 panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-48 flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-3 text-muted" size={16} />
                <input
                  type="text"
                  placeholder="Filter saved titles..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-10 w-full rounded-lg border border-line bg-background pl-9 pr-3 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
                  {(
                    [
                      ["all", "All types"],
                      ["games", "Games"],
                      ["dlc", "DLCs"],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setKindFilter(val)}
                      className={`rounded px-2.5 py-1.5 font-medium transition ${
                        kindFilter === val
                          ? "bg-brand text-white dark:text-background"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1 text-muted">
                  Winner:
                  <select
                    className="h-9 rounded-lg border border-line bg-surface px-2 text-ink"
                    value={winnerFilter}
                    onChange={(e) => setWinnerFilter(e.target.value)}
                  >
                    <option value="all">Any country</option>
                    <option value="TR">Turkey</option>
                    <option value="IN">India</option>
                    <option value="JP">Japan</option>
                    <option value="US">United States</option>
                  </select>
                </label>

                <label className="flex items-center gap-1 text-muted">
                  Savings:
                  <select
                    className="h-9 rounded-lg border border-line bg-surface px-2 text-ink"
                    value={savingsFilter}
                    onChange={(e) => setSavingsFilter(e.target.value)}
                  >
                    <option value="all">All discounts</option>
                    <option value="20">≥ 20% off US</option>
                    <option value="40">≥ 40% off US</option>
                    <option value="60">≥ 60% off US</option>
                  </select>
                </label>

                <label className="flex items-center gap-1 text-muted">
                  Sort:
                  <select
                    className="h-9 rounded-lg border border-line bg-surface px-2 text-ink"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="title">Title</option>
                    <option value="savings">Savings ($)</option>
                    <option value="freshness">Last update</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>
                Showing {sorted.length} of {items.length} saved products
              </span>
              {(searchFilter || kindFilter !== "all" || winnerFilter !== "all" || savingsFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchFilter("");
                    setKindFilter("all");
                    setWinnerFilter("all");
                    setSavingsFilter("all");
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table */}
          <div className="panel hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-background text-xs text-muted">
                <tr>
                  <th className="p-4">Product</th>
                  {markets.map((m) => (
                    <th key={m} className="p-3">
                      {m} · USD
                    </th>
                  ))}
                  <th className="p-3">Best available</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((e) => {
                  const inCart = basketIds.has(e.product.id);
                  return (
                    <tr key={e.product.id}>
                      <td className="max-w-80 p-4">
                        <ProductLink
                          id={e.product.id}
                          className="flex items-center gap-3 text-ink hover:text-brand"
                        >
                          <Cover
                            src={e.product.cover}
                            title={e.product.title}
                            className="h-16 w-12"
                          />
                          <div>
                            <span className="font-semibold block">{e.product.title}</span>
                            <span className="badge mt-1 !text-[10px] !px-1.5 !py-0.5">
                              {e.product.type}
                            </span>
                          </div>
                        </ProductLink>
                      </td>
                      {markets.map((m) => {
                        const r = e.comparison?.regions.find(
                          (r) => r.market === m,
                        );
                        return (
                          <td
                            key={m}
                            className={`p-3 whitespace-nowrap ${
                              e.comparison?.winners.includes(m)
                                ? "font-semibold text-positive"
                                : "text-muted"
                            }`}
                          >
                            {currency(r?.usd ?? null)}
                            {r && !r.rankEligible && (
                              <span className="mt-1 block text-[10px] text-muted">
                                Reference only
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3">
                        <strong>
                          {e.comparison?.winners.join(", ") || "Unavailable"}
                        </strong>
                        <p className="mt-1 text-xs text-muted">
                          {savings(
                            best(e)?.savingsUsd ?? null,
                            best(e)?.savingsPercent ?? null,
                          )}
                        </p>
                      </td>
                      <td className="p-3 text-xs text-muted">
                        <Freshness
                          at={
                            timestamp(e)
                              ? new Date(timestamp(e)).toISOString()
                              : null
                          }
                        />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleBasket(e)}
                            className={`btn !px-2.5 !py-1 text-xs ${
                              inCart
                                ? "border-brand bg-brand-soft text-brand font-semibold"
                                : "text-muted hover:text-ink"
                            }`}
                            title={inCart ? "In purchasing basket" : "Add to purchasing basket"}
                          >
                            <ShoppingBag size={14} />
                            {inCart ? "In Basket" : "Add to Basket"}
                          </button>
                          <button
                            className="btn !px-2.5 !py-1 text-muted hover:!text-danger"
                            disabled={removing === e.product.id}
                            onClick={() => remove(e.product.id)}
                            aria-label={`Remove ${e.product.title}`}
                            title="Remove from watchlist"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-4 lg:hidden">
            {sorted.map((e) => {
              const inCart = basketIds.has(e.product.id);
              return (
                <article className="panel p-5" key={e.product.id}>
                  <div className="flex items-start justify-between gap-3">
                    <ProductLink
                      id={e.product.id}
                      className="flex items-center gap-3"
                    >
                      <Cover
                        src={e.product.cover}
                        title={e.product.title}
                        className="h-20 w-14"
                      />
                      <div>
                        <h2 className="text-sm font-semibold">{e.product.title}</h2>
                        <span className="badge mt-1 !text-[10px] !px-1.5 !py-0.5">
                          {e.product.type}
                        </span>
                      </div>
                    </ProductLink>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleBasket(e)}
                        className={`btn !px-2.5 text-xs ${
                          inCart ? "border-brand bg-brand-soft text-brand" : "text-muted"
                        }`}
                        title={inCart ? "In basket" : "Add to basket"}
                      >
                        <ShoppingBag size={15} />
                      </button>
                      <button
                        className="btn !px-2.5 !text-muted hover:!text-danger"
                        aria-label={`Remove ${e.product.title}`}
                        onClick={() => remove(e.product.id)}
                        disabled={removing === e.product.id}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    {markets.map((m) => (
                      <div key={m} className="rounded-lg bg-background p-3">
                        <dt className="text-xs text-muted">{regions[m].name}</dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {currency(
                            e.comparison?.regions.find((r) => r.market === m)
                              ?.usd ?? null,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs text-positive font-semibold">
                    Best available:{" "}
                    {e.comparison?.winners.join(", ") || "Unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {savings(
                      best(e)?.savingsUsd ?? null,
                      best(e)?.savingsPercent ?? null,
                    )}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted">
            Open a product to refresh its prices. Use &quot;Refresh all&quot; to update your entire shortlist.
          </p>
        </>
      )}
    </>
  );
}
