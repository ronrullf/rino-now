"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  Link2,
  Clock3,
  Globe2,
  Layers3,
  ArrowUpRight,
  Bookmark,
} from "lucide-react";
import Link from "next/link";
import { api } from "./client-api";
import { Cover } from "./cover";
import { ProductLink } from "./product-link";
import { productId } from "@/lib/security/inputs";
import { TopOpportunities } from "./top-opportunities";
import { PricePreview } from "./price-preview";
import { matchesKind, type SearchKind } from "@/lib/search/matching";
import type { Product, SearchPage } from "@/lib/contracts";
export function SearchWorkspace() {
  const [kind, setKind] = useState<SearchKind>("games");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<Product[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const seq = useRef(0);
  const router = useRouter();
  useEffect(() => {
    api<Product[]>("/api/recent")
      .then(setRecent)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const version = ++seq.current;
    const controller = new AbortController();
    const value = query.trim();
    setError("");
    setResult(null);
    if (
      value.length < 2 ||
      /^https?:/i.test(value) ||
      /^[a-z0-9]{12}$/i.test(value)
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api<SearchPage>(
        `/api/search?q=${encodeURIComponent(value)}&kind=${kind}`,
        {
          signal: controller.signal,
        },
      )
        .then((r) => {
          if (version === seq.current) setResult(r);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (version === seq.current) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (
      /^https?:/i.test(query.trim()) ||
      /^[a-z0-9]{12}$/i.test(query.trim())
    ) {
      try {
        const id = productId(query);
        void fetch("/api/recent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: id }),
          keepalive: true,
        });
        router.push(`/product/${id}`);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  return (
    <>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Your regional research desk</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Find your next game.
            <br className="sm:hidden" /> Compare every market.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            The exact Xbox edition, across the US, Turkey, India, and Japan.
            <br className="hidden sm:block" /> Local prices, clear USD
            estimates, and savings you can verify.
          </p>
        </div>
        <span className="badge !border !border-line !bg-surface">
          <Globe2 size={13} />4 comparison markets
        </span>
      </div>
      <div
        className="mb-4 flex gap-2"
        role="group"
        aria-label="Search category"
      >
        {(
          [
            ["games", "Games"],
            ["dlc", "DLCs & add-ons"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={
              "btn flex-1 sm:flex-none " + (kind === value ? "btn-primary" : "")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel overflow-hidden" aria-label="Product search">
        <div className="p-5 sm:p-7">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Search size={17} className="text-brand" />
            {kind === "games"
              ? "Search games & editions"
              : "Search DLCs & add-ons"}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-4 text-muted" size={20} />
              <label htmlFor="search" className="sr-only">
                Game title, product URL, or product ID
              </label>
              <input
                id="search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSubmitted(false);
                }}
                maxLength={500}
                autoComplete="off"
                placeholder="Search a title, or paste an Xbox product link…"
                className="h-14 w-full rounded-xl border border-line bg-background pl-12 pr-4 text-base"
              />
            </div>
            <button type="submit" className="btn btn-primary !h-14 !px-6">
              Find product
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Link2 size={13} />
            Use part of a title, common abbreviations, or a store link. Minor
            spelling mistakes are supported.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-background px-5 py-3 sm:px-7">
          {[
            "United States · USD",
            "Turkey · TRY",
            "India · INR",
            "Japan · JPY",
          ].map((r, i) => (
            <span
              key={r}
              className="flex items-center gap-2 text-xs text-muted"
            >
              <span
                className={`size-1.5 rounded-full ${i === 0 ? "bg-brand" : "bg-positive"}`}
              />
              {r}
            </span>
          ))}
        </div>
      </section>
      <div aria-live="polite" className="mt-5">
        {error && (
          <div className="panel border-danger p-4 text-sm text-danger">
            {error}
          </div>
        )}
        {result?.warnings.map((w) => (
          <p
            key={w}
            className="mb-3 rounded-lg bg-brand-soft p-4 text-sm text-brand"
          >
            {w}
          </p>
        ))}
        {loading && (
          <div className="panel space-y-4 p-5" role="status">
            <span className="sr-only">Searching products</span>
            {[1, 2, 3].map((i) => (
              <div className="flex gap-4" key={i}>
                <div className="skeleton h-16 w-12" />
                <div className="flex-1 space-y-3 py-2">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}
        {result && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">
                {result.products.length} matching products
              </h2>
              <span className="text-xs text-muted">
                {result.source === "local"
                  ? "Local cache"
                  : result.source === "cache"
                    ? "Cached results"
                    : "Exact editions & add-ons"}
              </span>
            </div>
            {result.products.length ? (
              <div className="panel divide-y divide-line overflow-hidden">
                {result.products.map((p) => (
                  <ProductLink
                    id={p.id}
                    key={p.id}
                    className="flex flex-wrap items-center gap-4 p-4 hover:bg-brand-soft"
                  >
                    <Cover
                      src={p.cover}
                      title={p.title}
                      className="h-20 w-14"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{p.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {p.publisher ?? "Publisher unavailable"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="badge capitalize">{p.type}</span>
                        <span className="badge">
                          {p.platforms.includes("Windows.Xbox")
                            ? "Xbox console"
                            : p.platforms.length
                              ? p.platforms.join(", ")
                              : "Platform unverified"}
                        </span>
                      </div>
                    </div>
                    <PricePreview id={p.id} />
                    <ArrowUpRight size={18} className="shrink-0 text-brand" />
                  </ProductLink>
                ))}
              </div>
            ) : (
              <div className="panel p-8 text-center text-sm text-muted">
                {result.source === "local"
                  ? "No local matches. Try a product URL or ID."
                  : "No matching products found. Try another title or a product URL."}
              </div>
            )}
            {result.limited && result.products.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Showing up to 20 relevant matches. Prices load automatically;
                regional coverage can vary.
              </p>
            )}
          </section>
        )}
        {submitted && query.trim().length < 2 && (
          <p className="text-sm text-muted">
            Enter at least two characters to search.
          </p>
        )}
      </div>
      {!query && kind === "games" && <TopOpportunities />}
      {!result && !loading && !query && (
        <>
          <div className="mt-9 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <section className="panel p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <Clock3 size={17} className="text-muted" />
                <h2 className="font-semibold">Recently explored</h2>
              </div>
              {recent.length ? (
                <div className="space-y-1">
                  {recent
                    .filter((p) => matchesKind(p, kind))
                    .slice(0, 5)
                    .map((p) => (
                      <ProductLink
                        id={p.id}
                        key={p.id}
                        className="flex items-center gap-3 rounded-lg py-3 hover:bg-background"
                      >
                        <Cover
                          src={p.cover}
                          title={p.title}
                          className="h-12 w-10"
                        />
                        <span className="flex-1 text-sm font-medium">
                          {p.title}
                        </span>
                        <ArrowRight size={15} className="text-muted" />
                      </ProductLink>
                    ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
                  <Layers3 size={28} className="mx-auto mb-3 text-muted" />
                  <p className="text-sm font-semibold">A fresh workspace</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Games you select will appear here.
                    <br />
                    Search above to make your first comparison.
                  </p>
                </div>
              )}
            </section>
            <section className="panel flex flex-col p-5 sm:p-6">
              <span className="mb-5 flex size-10 items-center justify-center rounded-xl bg-positive-soft text-positive">
                <Bookmark size={20} />
              </span>
              <h2 className="text-lg font-semibold">
                Keep the right games close.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Save exact editions to your watchlist. Revisit regional prices
                without starting another search.
              </p>
              <Link href="/watchlist" className="btn mt-6 self-start">
                Open watchlist
                <ArrowRight size={16} />
              </Link>
              <p className="mt-auto pt-6 text-xs text-muted">
                Saved locally · Private to this workspace
              </p>
            </section>
          </div>
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              [
                "01",
                "Find the exact edition",
                "Games, bundles, and DLC stay clearly labeled.",
              ],
              [
                "02",
                "Compare public prices",
                "Membership offers never determine the winner.",
              ],
              [
                "03",
                "Verify in the store",
                "Open the selected regional listing before buying.",
              ],
            ].map(([n, title, body]) => (
              <div key={n} className="flex gap-3 py-3">
                <span className="text-sm font-semibold text-brand">{n}</span>
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
