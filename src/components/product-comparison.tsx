"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  Trophy,
  Info,
  Clock3,
  AlertCircle,
  Check,
  ShoppingBag,
  TrendingDown,
  Layers,
  History,
  CreditCard,
} from "lucide-react";
import { api } from "./client-api";
import { Cover } from "./cover";
import { Freshness } from "./freshness";
import { ProductLink } from "./product-link";
import { regions } from "@/lib/regions";
import { currency, savings } from "@/lib/pricing/format";
import type { Comparison, RegionResult } from "@/lib/contracts";
import {
  addToBasket,
  removeFromBasket,
  isInBasket,
  subscribeBasket,
} from "@/lib/basket-store";
import {
  applyCardFee,
  CARD_FEE_PRESETS,
} from "@/lib/pricing/fx-fees";
import type { RelatedGroup } from "@/lib/services/related";

function RegionCard({
  region: r,
  winner,
  cardFee,
}: {
  region: RegionResult;
  winner: boolean;
  cardFee: number;
}) {
  const missingListing = r.status === "unavailable";
  const storeUrl = missingListing
    ? "https://www.xbox.com/" +
      regions[r.market].locale +
      "/Search/Results?q=" +
      encodeURIComponent(r.regionalTitle ?? r.productId)
    : r.storeUrl;
  const noPrice =
    r.status === "ambiguous"
      ? "Price unverified"
      : r.status === "conditional_only"
        ? "Restricted offer"
        : r.status === "unavailable"
          ? "Not sold here"
          : "Price unknown";
  const expired = r.rankingReason === "OFFER_EXPIRED";

  return (
    <article
      className={`panel relative flex flex-col overflow-hidden ${
        winner ? "!border-positive" : ""
      }`}
      aria-label={`${regions[r.market].name} comparison`}
    >
      <div className={`h-1 ${winner ? "bg-positive" : "bg-transparent"}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-background text-xs font-bold">
              {r.market}
            </span>
            <div>
              <h3 className="text-sm font-semibold">
                {regions[r.market].name}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {r.currency}
                {r.market === "US" ? " · Baseline" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {r.isAllTimeLow && r.status === "available" && (
              <span
                className="badge !border !border-positive !bg-positive-soft !text-positive text-[10px]"
                title="Matches or beats lowest price seen in this system"
              >
                <TrendingDown size={11} /> ATL
              </span>
            )}
            {winner && (
              <span className="text-positive" title="Lowest comparable price">
                <Trophy size={18} />
              </span>
            )}
          </div>
        </div>

        <p className="eyebrow mb-2">
          {expired
            ? "Expired offer · reference"
            : r.stale
              ? "Cached local price"
              : "Public purchase price"}
        </p>
        <p
          className={`text-2xl font-bold tracking-tight ${
            expired ? "text-muted line-through" : ""
          }`}
        >
          {r.currentAmount === null
            ? noPrice
            : currency(r.currentAmount, r.currency)}
        </p>
        {r.regularAmount && (
          <p className="mt-1 text-xs text-muted">
            Reference MSRP{" "}
            <span className="line-through">
              {currency(r.regularAmount, r.currency)}
            </span>
          </p>
        )}
        <p className="mt-3 text-sm text-muted">
          {r.usd !== null ? (
            <>
              ≈{" "}
              <strong className="font-semibold text-ink">
                {currency(r.usd)}
              </strong>{" "}
              USD
              {cardFee > 0 && r.market !== "US" && (
                <span className="ml-1 text-[11px] text-muted font-normal">
                  (+{cardFee}%)
                </span>
              )}
            </>
          ) : (
            "USD conversion unavailable"
          )}
        </p>

        {r.allTimeLow && !r.isAllTimeLow && r.status === "available" && (
          <p className="mt-1 text-[11px] text-muted">
            Lowest recorded: {currency(r.allTimeLow.amount, r.allTimeLow.currency)}
          </p>
        )}

        <div
          className={`mt-4 rounded-lg px-3 py-3 text-xs font-semibold ${
            r.savingsUsd !== null && Number(r.savingsUsd) > 0
              ? "bg-positive-soft text-positive"
              : "bg-background text-muted"
          }`}
        >
          {r.market === "US" && r.rankEligible
            ? "Current US comparison baseline"
            : savings(r.savingsUsd, r.savingsPercent)}
        </div>

        <div className="mt-5 flex-1 space-y-2 text-xs leading-5 text-muted">
          <p className="flex items-center gap-1.5">
            {r.rankEligible ? <Check size={13} /> : <AlertCircle size={13} />}{" "}
            {r.rankEligible
              ? "Comparable public offer"
              : r.status === "available"
                ? (r.rankingReason ?? "Excluded from ranking")
                    .replaceAll("_", " ")
                    .toLowerCase()
                : r.status.replaceAll("_", " ")}
          </p>
          {r.saleEndAt && !expired && (
            <p>Offer ends {new Date(r.saleEndAt).toLocaleString()}</p>
          )}
          {r.refreshError && (
            <p className="text-danger">
              Refresh failed · Previous snapshot retained
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Clock3 size={12} />
            <Freshness at={r.fetchedAt} stale={r.stale} />
          </p>
          {r.fx && r.currency !== "USD" && (
            <p>
              FX {r.fx.effectiveDate} · {r.fx.provider}
            </p>
          )}
        </div>

        <a
          className="btn mt-5 !w-full"
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {missingListing ? "Search" : "Open"} {r.market} store
          <ArrowUpRight size={15} />
          <span className="sr-only"> (new tab)</span>
        </a>
        {r.status !== "available" && (
          <p className="mt-2 text-[10px] text-muted">
            {missingListing
              ? "No public purchase offer in this region. Search for other editions or packs."
              : "The catalog could not confirm a comparable public price. Check the store for details."}
          </p>
        )}
      </div>
    </article>
  );
}

export function ProductComparison({ id }: { id: string }) {
  const [rawComparison, setRawComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [inCart, setInCart] = useState(false);
  const [cardFee, setCardFee] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const saved = localStorage.getItem("xbox_card_fee");
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [related, setRelated] = useState<RelatedGroup | null>(null);
  const followed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Comparison>(`/api/products/${id}`, { signal: controller.signal })
      .then((res) => {
        setRawComparison(res);
        setInCart(isInBasket(res.product.id));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    api<RelatedGroup>(`/api/products/${id}/related`, { signal: controller.signal })
      .then(setRelated)
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const updateBasketStatus = () => setInCart(isInBasket(id));
    updateBasketStatus();
    return subscribeBasket(updateBasketStatus);
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rawComparison?.refreshNeeded && !followed.current && !rawComparison.demo) {
      followed.current = true;
      setBusy(true);
      api<Comparison>(`/api/products/${id}/refresh`, { method: "POST" })
        .then((res) => setRawComparison(res))
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [rawComparison, id]);

  function handleCardFeeChange(fee: number) {
    setCardFee(fee);
    try {
      localStorage.setItem("xbox_card_fee", String(fee));
    } catch {
      // ignore
    }
  }

  function handleBasketToggle() {
    if (!rawComparison) return;
    if (inCart) {
      removeFromBasket(rawComparison.product.id);
    } else {
      addToBasket(rawComparison.product, rawComparison);
    }
  }

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const updated = await api<Comparison>(`/api/products/${id}/refresh`, {
        method: "POST",
      });
      setRawComparison(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rawComparison) return;
    setSaving(true);
    try {
      await api(rawComparison.saved ? `/api/watchlist/${id}` : "/api/watchlist", {
        method: rawComparison.saved ? "DELETE" : "POST",
        ...(rawComparison.saved ? {} : { body: JSON.stringify({ productId: id }) }),
      });
      setRawComparison({ ...rawComparison, saved: !rawComparison.saved });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cooldown = rawComparison?.nextRefreshAt
    ? Math.max(0, Math.ceil((Date.parse(rawComparison.nextRefreshAt) - clock) / 1000))
    : 0;

  if (!rawComparison) {
    return (
      <>
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft size={16} />
          Back to search
        </Link>
        {error ? (
          <div role="alert" className="panel p-8">
            <h1 className="text-xl font-semibold">
              Could not load this product
            </h1>
            <p className="mt-3 text-sm text-muted">{error}</p>
            <button className="btn mt-5" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <div role="status" aria-label="Loading comparison">
            <div className="panel mb-6 flex gap-6 p-6">
              <div className="skeleton h-36 w-24" />
              <div className="flex-1 space-y-4 py-4">
                <div className="skeleton h-8 w-2/3" />
                <div className="skeleton h-4 w-1/3" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div className="panel h-80 p-5" key={n}>
                  <div className="skeleton h-8 w-1/2" />
                  <div className="skeleton mt-10 h-12 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  const data = applyCardFee(rawComparison, cardFee);
  const winner = data.regions.find((r) => data.winners.includes(r.market));
  const complete = data.regions.every((r) => r.rankEligible);

  return (
    <>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-brand"
      >
        <ArrowLeft size={16} />
        Back to search
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-5">
          <Cover
            src={data.product.cover}
            title={data.product.title}
            className="h-32 w-22 sm:h-40 sm:w-28"
          />
          <div className="min-w-0">
            <p className="eyebrow mb-2">Exact product comparison</p>
            <h1 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              {data.product.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {data.product.publisher ?? "Publisher unavailable"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge capitalize">{data.product.type}</span>
              <span className="badge">
                {data.product.platforms.includes("Windows.Xbox")
                  ? "Xbox console"
                  : "Platform unverified"}
              </span>
              <span className="badge font-mono">{id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBasketToggle}
            className={`btn ${
              inCart ? "border-brand bg-brand-soft text-brand font-semibold" : ""
            }`}
          >
            <ShoppingBag size={17} />
            {inCart ? "In purchasing basket" : "Add to basket"}
          </button>
          <button className="btn" onClick={save} disabled={saving}>
            {data.saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
            {data.saved ? "Saved to watchlist" : "Save to watchlist"}
          </button>
          <button
            className="btn"
            onClick={refresh}
            disabled={busy || cooldown > 0}
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            {busy
              ? "Refreshing…"
              : cooldown
                ? `Refresh in ${cooldown}s`
                : "Refresh prices"}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-danger p-4 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {data.warnings.map((w) => (
          <p
            key={w}
            className="mb-3 rounded-lg bg-brand-soft p-3 text-sm text-brand"
          >
            {w}
          </p>
        ))}
      </div>

      {/* Winner Summary Banner */}
      <section className="panel mb-7 flex flex-wrap items-center justify-between gap-5 !border-positive/25 bg-positive-soft px-6 py-5">
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-positive/10 text-positive">
            <Trophy size={23} />
          </span>
          <div>
            <p className="eyebrow !text-positive">
              {complete
                ? "Lowest comparable price"
                : "Cheapest among available comparable prices"}
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {winner
                ? `${data.winners.map((m) => regions[m].name).join(" & ")}${
                    data.winners.length > 1 ? " · tied" : ""
                  }`
                : "No comparable winner yet"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {winner
                ? savings(winner.savingsUsd, winner.savingsPercent)
                : "Refresh or review the regional statuses below."}
            </p>
          </div>
        </div>
        {winner && (
          <div className="text-right">
            <strong className="text-3xl tracking-tight">
              {currency(winner.usd)}
            </strong>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {data.winners.map((m) => {
                const r = data.regions.find((reg) => reg.market === m)!;
                return (
                  <a
                    key={m}
                    className="btn btn-primary"
                    href={r.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open {regions[m].name} store <ArrowUpRight size={16} />
                    <span className="sr-only"> (new tab)</span>
                  </a>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">
              Approximate USD · public purchase
              {cardFee > 0 && ` (incl. ${cardFee}% card fee)`}
            </p>
          </div>
        )}
      </section>

      {/* Card FX Fee Controls */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 sm:p-3.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted">
          <CreditCard size={15} className="text-brand shrink-0" />
          <span className="font-semibold text-ink">Foreign Card Fee:</span>
          <span className="hidden sm:inline">Simulate credit card FX fees on TRY, INR, and JPY</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {CARD_FEE_PRESETS.map((fee) => (
            <button
              key={fee}
              type="button"
              onClick={() => handleCardFeeChange(fee)}
              className={`rounded-lg px-2 py-1 text-[11px] sm:text-xs font-semibold transition ${
                cardFee === fee
                  ? "bg-brand text-white dark:text-background"
                  : "bg-background text-muted hover:text-ink"
              }`}
            >
              {fee === 0 ? "0% (Raw FX)" : `+${fee}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Regional Price Cards Grid */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Regional prices</h2>
        <span className="text-xs text-muted">
          Savings compared with the current US purchase price
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.regions.map((r) => (
          <RegionCard
            key={r.market}
            region={r}
            winner={data.winners.includes(r.market)}
            cardFee={cardFee}
          />
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>
          USD conversions are estimates. Final store availability and checkout
          price may differ. A regional link does not change your account or
          checkout region.
        </p>
      </div>

      {/* Related Editions and Add-ons Carousel/Grid */}
      {related && (related.editions.length > 0 || related.addons.length > 0) && (
        <section className="mt-10" aria-label="Related editions and add-ons">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-brand" />
              <h2 className="font-semibold">Related editions &amp; add-ons</h2>
            </div>
            <span className="text-xs text-muted">
              Explore other packages in this franchise
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...related.editions, ...related.addons].slice(0, 8).map((rel) => {
              const bestReg = rel.comparison?.regions.find((r) =>
                rel.comparison?.winners.includes(r.market),
              );
              return (
                <ProductLink
                  key={rel.product.id}
                  id={rel.product.id}
                  className="panel flex flex-col p-4 transition hover:border-brand hover:bg-brand-soft/20"
                >
                  <div className="flex items-center gap-3">
                    <Cover
                      src={rel.product.cover}
                      title={rel.product.title}
                      className="h-16 w-12 rounded shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="badge mb-1 text-[10px] !px-1.5 !py-0.5">
                        {rel.relationType}
                      </span>
                      <h3 className="line-clamp-2 text-xs font-semibold leading-snug">
                        {rel.product.title}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                    <span className="text-muted">
                      {bestReg ? `Best: ${bestReg.market}` : "View"}
                    </span>
                    <span className="font-bold text-ink">
                      {bestReg?.usd ? `$${bestReg.usd} USD` : "Compare →"}
                    </span>
                  </div>
                </ProductLink>
              );
            })}
          </div>
        </section>
      )}

      {/* Details & Price History Section */}
      <details className="panel mt-8 p-5 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-ink flex items-center gap-2">
          <History size={15} />
          Comparison details &amp; recorded price history
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="font-semibold text-ink mb-2">Technical offer details:</h4>
            {data.regions.map((r) => (
              <p key={r.market} className="break-all mb-1">
                <strong>{r.market}</strong> · {r.reason} · SKU {r.skuId ?? "—"} ·
                Availability {r.availabilityId ?? "—"} · Last attempt:{" "}
                {r.lastAttemptAt ?? "None"} · {r.regionalTitle ?? "No regional title"}
              </p>
            ))}
          </div>

          {rawComparison.priceHistory && Object.keys(rawComparison.priceHistory).length > 0 && (
            <div className="border-t border-line pt-4">
              <h4 className="font-semibold text-ink mb-2">Recorded price check history:</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(rawComparison.priceHistory).map(([m, entries]) => (
                  <div key={m} className="rounded-lg bg-background p-3">
                    <strong className="block text-ink">{regions[m as keyof typeof regions].name} ({m}):</strong>
                    <ul className="mt-1 space-y-1">
                      {entries?.slice(0, 5).map((e) => (
                        <li key={e.id} className="text-[11px] text-muted">
                          {new Date(e.recordedAt).toLocaleDateString()} — {currency(e.amount, e.currency)}
                          {e.usd ? ` (≈ $${e.usd} USD)` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="border-t border-line pt-3">
            Source: Microsoft DisplayCatalog. FX rates and prices are fetched
            independently. MSRP is an upstream reference amount, not a guaranteed regular checkout price.
          </p>
        </div>
      </details>
    </>
  );
}
