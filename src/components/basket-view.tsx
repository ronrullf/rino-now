"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  ArrowRight,
  Trash2,
  Copy,
  Check,
  ArrowUpRight,
  Sparkles,
  Store,
  RefreshCw,
} from "lucide-react";
import {
  getBasket,
  removeFromBasket,
  clearBasket,
  subscribeBasket,
  addToBasket,
} from "@/lib/basket-store";
import { calculateBasket, type BasketEntry } from "@/lib/pricing/basket";
import { Cover } from "./cover";
import { ProductLink } from "./product-link";
import { regions } from "@/lib/regions";
import { currency } from "@/lib/pricing/format";
import { api } from "./client-api";
import type { Comparison } from "@/lib/contracts";

export function BasketView() {
  const [items, setItems] = useState<BasketEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setItems(getBasket());
    return subscribeBasket(() => {
      setItems(getBasket());
    });
  }, []);

  async function refreshMissingComparisons() {
    setRefreshing(true);
    try {
      const updated = await Promise.all(
        items.map(async (entry) => {
          if (!entry.comparison) {
            try {
              const comp = await api<Comparison>(`/api/products/${entry.product.id}`);
              return { ...entry, comparison: comp };
            } catch {
              return entry;
            }
          }
          return entry;
        }),
      );
      setItems(updated);
      for (const entry of updated) {
        addToBasket(entry.product, entry.comparison);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const calculation = calculateBasket(items);

  function copyPurchasePlan() {
    const lines: string[] = [
      "# Xbox Purchasing Plan — Team Basket Summary",
      "",
      `*Generated on ${new Date().toLocaleDateString()}*`,
      "",
      "### Optimal Multi-Market Strategy",
      `- **Total Spend**: $${calculation.hybrid.totalUsd} USD`,
      `- **US Baseline Spend**: $${calculation.hybrid.totalBaselineUsd} USD`,
      `- **Total Savings**: $${calculation.hybrid.savingsUsd} USD (${calculation.hybrid.savingsPercent ?? "0"}%)`,
      "",
      "| Item | Type | Best Market | Local Price | USD Equivalent | Store Link |",
      "|---|---|---|---|---|---|",
    ];

    for (const item of calculation.hybrid.items) {
      const link = item.storeUrl ? `[Store Link](${item.storeUrl})` : "N/A";
      const local = item.localAmount && item.chosenCurrency
        ? `${item.localAmount} ${item.chosenCurrency}`
        : "N/A";
      const usd = item.usd ? `$${item.usd}` : "N/A";
      lines.push(
        `| ${item.product.title} | ${item.product.type} | ${item.chosenMarket ?? "N/A"} | ${local} | ${usd} | ${link} |`,
      );
    }

    lines.push("", "### Single-Store Comparison");
    lines.push("| Country | Complete | Total (Local) | Total (USD) | Savings vs US |");
    lines.push("|---|---|---|---|---|");

    for (const [m, s] of Object.entries(calculation.byMarket)) {
      const compLabel = s.complete ? "Yes" : `${s.availableCount}/${s.totalItems}`;
      const local = s.totalLocal ? `${s.totalLocal} ${s.currency}` : "N/A";
      const usd = s.totalUsd ? `$${s.totalUsd}` : "N/A";
      const sav = s.savingsUsd ? `$${s.savingsUsd} (${s.savingsPercent}%)` : "—";
      lines.push(`| ${regions[m as keyof typeof regions].name} | ${compLabel} | ${local} | ${usd} | ${sav} |`);
    }

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!items.length) {
    return (
      <div className="panel px-6 py-20 text-center">
        <ShoppingBag size={40} className="mx-auto mb-5 text-brand" />
        <h2 className="text-xl font-semibold">Your purchasing basket is empty.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Add games and DLCs from search results, product comparisons, or your watchlist to plan your team&apos;s purchases and maximize savings across regional stores.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn btn-primary">
            Search products
            <ArrowRight size={16} />
          </Link>
          <Link href="/watchlist" className="btn">
            View Watchlist
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Team Purchasing Planner</p>
          <h1 className="text-3xl font-bold tracking-tight">Basket &amp; Strategy</h1>
          <p className="mt-3 text-sm text-muted">
            Plan multi-item purchases. Compare the optimal hybrid strategy against checking out completely in Turkey, India, or Japan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyPurchasePlan}
            className="btn btn-primary"
          >
            {copied ? (
              <>
                <Check size={16} /> Copied plan!
              </>
            ) : (
              <>
                <Copy size={16} /> Copy purchase plan (MD)
              </>
            )}
          </button>
          <button
            type="button"
            onClick={clearBasket}
            className="btn !text-danger hover:border-danger"
          >
            <Trash2 size={16} /> Clear basket
          </button>
        </div>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-3">
        {/* Optimal Plan Card */}
        <div className="panel border-2 !border-positive p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="badge !border !border-positive !bg-positive-soft !text-positive">
              <Sparkles size={14} /> Maximum Savings Strategy
            </span>
            <span className="text-xs text-muted">
              {calculation.hybrid.items.length} items planned
            </span>
          </div>
          <h2 className="text-2xl font-bold">
            Optimal Cross-Store Total:{" "}
            <span className="text-positive">${calculation.hybrid.totalUsd} USD</span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <span>
              US Baseline:{" "}
              <strong className="text-ink">${calculation.hybrid.totalBaselineUsd} USD</strong>
            </span>
            <span>
              Total Savings:{" "}
              <strong className="text-positive">
                ${calculation.hybrid.savingsUsd} USD ({calculation.hybrid.savingsPercent ?? "0"}%)
              </strong>
            </span>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-3 text-xs font-semibold text-muted">Store split recommended:</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(calculation.hybrid.marketBreakdown) as (keyof typeof calculation.hybrid.marketBreakdown)[]).map(
                (m) => {
                  const count = calculation.hybrid.marketBreakdown[m];
                  if (!count) return null;
                  return (
                    <span key={m} className="badge !bg-background">
                      {count} from {regions[m].name} ({m})
                    </span>
                  );
                },
              )}
            </div>
          </div>
        </div>

        {/* Single-Store Checkout Comparison */}
        <div className="panel p-6">
          <div className="mb-3 flex items-center gap-2">
            <Store size={18} className="text-brand" />
            <h3 className="font-semibold">Single-Store Totals</h3>
          </div>
          <p className="text-xs leading-5 text-muted">
            Total cost if purchasing everything from a single regional store:
          </p>

          <div className="mt-4 space-y-3">
            {(Object.keys(calculation.byMarket) as (keyof typeof calculation.byMarket)[]).map((m) => {
              const summary = calculation.byMarket[m];
              return (
                <div
                  key={m}
                  className="flex items-center justify-between rounded-lg border border-line bg-background p-3 text-xs"
                >
                  <div>
                    <span className="font-bold">{regions[m].name} ({m})</span>
                    <span className="ml-2 text-muted">
                      {summary.complete ? "All available" : `${summary.availableCount}/${summary.totalItems}`}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-ink">
                      {summary.totalUsd ? `$${summary.totalUsd} USD` : "—"}
                    </span>
                    {summary.savingsUsd && Number(summary.savingsUsd) > 0 && (
                      <span className="block text-[11px] text-positive">
                        Save ${summary.savingsUsd} ({summary.savingsPercent}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Items List */}
      <section className="panel overflow-hidden" aria-label="Basket items">
        <div className="flex items-center justify-between border-b border-line bg-background px-5 py-3">
          <h3 className="font-semibold">{items.length} items in basket</h3>
          {items.some((i) => !i.comparison) && (
            <button
              onClick={refreshMissingComparisons}
              disabled={refreshing}
              className="btn !h-8 !px-3 text-xs"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Fetch missing prices
            </button>
          )}
        </div>

        <div className="divide-y divide-line">
          {calculation.hybrid.items.map((item) => (
            <div
              key={item.product.id}
              className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-brand-soft/30"
            >
              <div className="flex items-center gap-4">
                <Cover
                  src={item.product.cover}
                  title={item.product.title}
                  className="h-16 w-12 rounded"
                />
                <div>
                  <ProductLink
                    id={item.product.id}
                    className="font-semibold text-ink hover:text-brand"
                  >
                    {item.product.title}
                  </ProductLink>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="badge !px-1.5 !py-0.5 text-[10px]">
                      {item.product.type}
                    </span>
                    {item.usBaselineUsd && (
                      <span>US Base: ${item.usBaselineUsd}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-muted">Cheapest in</p>
                  <p className="font-bold text-ink">
                    {item.chosenMarket ? (
                      <>
                        <span className="text-positive">
                          {regions[item.chosenMarket].name} ({item.chosenMarket})
                        </span>
                        {" · "}
                        {currency(item.usd ?? null)}
                      </>
                    ) : (
                      "Price unavailable"
                    )}
                  </p>
                  {item.localAmount && item.chosenCurrency && (
                    <p className="text-[11px] text-muted">
                      {item.localAmount} {item.chosenCurrency}
                    </p>
                  )}
                </div>

                {item.storeUrl && (
                  <a
                    href={item.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn !px-3 text-xs"
                    title={`Open in ${item.chosenMarket} Store`}
                  >
                    Open store
                    <ArrowUpRight size={14} />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => removeFromBasket(item.product.id)}
                  className="btn !px-3 !text-muted hover:!text-danger"
                  aria-label={`Remove ${item.product.title} from basket`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
