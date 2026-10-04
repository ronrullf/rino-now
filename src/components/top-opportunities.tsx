"use client";
import { useEffect, useState, useId } from "react";
import {
  ArrowUpRight,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  OpportunitiesPage,
  OpportunityKind,
} from "@/lib/pricing/opportunities";
import { regions } from "@/lib/regions";
import { currency } from "@/lib/pricing/format";
import { api } from "./client-api";
import { Cover } from "./cover";
import { ProductLink } from "./product-link";
export function TopOpportunities({
  kind = "games",
}: {
  kind?: OpportunityKind;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const label = kind === "dlc" ? "DLCs & add-ons" : "games";
  const [data, setData] = useState<OpportunitiesPage | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setData(null);
    setExpanded(false);
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
  return (
    <section
      className="mt-9"
      aria-label={"Biggest regional savings for " + label}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <TrendingDown size={16} />
            {kind === "dlc"
              ? "Known add-ons. Bigger savings."
              : "Known games. Bigger savings."}
          </p>
          <h2 className="text-xl font-bold">
            {kind === "dlc"
              ? "DLC & add-on price gaps"
              : "Biggest regional price gaps"}
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
            A curated selection of recognizable {label}, ranked by percentage
            saved between the highest and lowest comparable regional price. Same
            edition or pack in every country.
          </p>
        </div>
        {data && (
          <span className="badge">
            {data.checked} / {data.selected} {label} checked
          </span>
        )}
      </div>
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
          {data.items.length ? (
            <div
              id={listId}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {(expanded ? data.items : data.items.slice(0, 6)).map(
                (item, index) => (
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
                          #{index + 1} regional saving
                        </p>
                        <h3 className="text-sm font-semibold">
                          {item.product.title}
                        </h3>
                      </div>
                    </ProductLink>
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
                ),
              )}
            </div>
          ) : (
            <div className="panel p-6 text-sm text-muted">
              No verified price gaps in the selected {label} right now. Search
              above to compare another product.
            </div>
          )}
          {data.items.length > 6 && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                className="btn"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? "Show fewer " + label
                  : "Show more " + label + " (" + (data.items.length - 6) + ")"}
                {expanded ? (
                  <ChevronUp size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-muted">
            Curated selection, not a download chart or a ranking of the entire
            store. Membership-only, stale and non-comparable offers are
            excluded. Price differences are before fees and taxes, not
            guaranteed resale profit. Final checkout prices may differ.
          </p>
        </>
      )}
    </section>
  );
}
