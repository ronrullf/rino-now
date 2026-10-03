"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ArrowRight, Trash2 } from "lucide-react";
import { api } from "./client-api";
import { ProductLink } from "./product-link";
import { Cover } from "./cover";
import { Freshness } from "./freshness";
import type { Product, Comparison } from "@/lib/contracts";
import { markets, regions } from "@/lib/regions";
import { currency, savings } from "@/lib/pricing/format";
type Entry = { product: Product; comparison: Comparison | null };
export function Watchlist() {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("title");
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    api<Entry[]>("/api/watchlist")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
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
  const best = (e: Entry) =>
    e.comparison?.regions.find((r) => e.comparison?.winners.includes(r.market));
  const timestamp = (e: Entry) =>
    Math.max(
      0,
      ...(e.comparison?.regions.map((r) =>
        r.fetchedAt ? Date.parse(r.fetchedAt) : 0,
      ) ?? []),
    );
  const sorted = [...(items ?? [])].sort((a, b) =>
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
            Exact editions worth keeping an eye on. Prices shown from your local
            cache.
          </p>
        </div>
        <Link href="/" className="btn btn-primary">
          Find a game
          <ArrowRight size={16} />
        </Link>
      </div>
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {items.length} / 200 saved products
            </p>
            <label className="flex items-center gap-2 text-sm">
              Sort by
              <select
                className="min-h-11 rounded-lg border border-line bg-surface px-3"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="title">Title</option>
                <option value="savings">Savings</option>
                <option value="freshness">Last update</option>
              </select>
            </label>
          </div>
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
                  <th className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((e) => (
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
                        <span className="font-semibold">{e.product.title}</span>
                      </ProductLink>
                    </td>
                    {markets.map((m) => {
                      const r = e.comparison?.regions.find(
                        (r) => r.market === m,
                      );
                      return (
                        <td
                          key={m}
                          className={`p-3 whitespace-nowrap ${e.comparison?.winners.includes(m) ? "font-semibold text-positive" : "text-muted"}`}
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
                    <td className="p-3">
                      <button
                        className="btn !px-3"
                        disabled={removing === e.product.id}
                        onClick={() => remove(e.product.id)}
                        aria-label={`Remove ${e.product.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4 lg:hidden">
            {sorted.map((e) => (
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
                    <h2 className="text-sm font-semibold">{e.product.title}</h2>
                  </ProductLink>
                  <button
                    className="btn !px-3"
                    aria-label={`Remove ${e.product.title}`}
                    onClick={() => remove(e.product.id)}
                    disabled={removing === e.product.id}
                  >
                    <Trash2 size={16} />
                  </button>
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
                <p className="mt-4 text-xs text-positive">
                  Best available:{" "}
                  {e.comparison?.winners.join(", ") || "Unavailable"}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {savings(
                    best(e)?.savingsUsd ?? null,
                    best(e)?.savingsPercent ?? null,
                  )}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Open a product to refresh its prices. This is your shortlist, not a
            catalog-wide deals ranking.
          </p>
        </>
      )}
    </>
  );
}
