"use client";
import { useEffect, useRef, useState } from "react";
import type { Comparison } from "@/lib/contracts";
import { regions } from "@/lib/regions";
import { currency } from "@/lib/pricing/format";
import { api } from "./client-api";
let active = 0;
const waiting: Array<() => void> = [];
const cache = new Map<string, { at: number; data: Comparison }>();
async function load(id: string, signal: AbortSignal) {
  const existing = cache.get(id);
  if (existing && Date.now() - existing.at < 60000) return existing.data;
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    signal.throwIfAborted();
    const data = await api<Comparison>("/api/products/" + id + "?fresh=1", {
      signal,
    });
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(id, { at: Date.now(), data });
    return data;
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function PricePreview({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Comparison | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load(id, controller.signal)
          .then(setData)
          .catch(() => {
            if (!controller.signal.aborted) setFailed(true);
          });
      },
      { rootMargin: "250px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [id]);
  const winner = data?.regions.find((r) => data.winners.includes(r.market));
  return (
    <div
      ref={ref}
      className="w-full rounded-lg bg-background p-3 text-xs sm:w-72 sm:shrink-0"
      aria-label="Price preview"
    >
      {!data ? (
        <p className="text-muted">
          {failed
            ? "Price preview unavailable · open to retry"
            : "Loading regional prices…"}
        </p>
      ) : (
        <>
          {winner ? (
            <p className="font-semibold text-positive">
              {currency(winner.usd)} USD ·{" "}
              {data.winners.map((m) => regions[m].name).join(" / ")}
              <span className="mt-1 block text-[10px] font-normal text-muted">
                {data.regions.every((r) => r.rankEligible)
                  ? "Cheapest country"
                  : "Cheapest among comparable prices"}
                {data.regions.some((r) => r.stale) ? " · cached" : ""}
              </span>
            </p>
          ) : (
            <p className="font-medium text-muted">No comparable winner yet</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {data.regions.map((r) => (
              <p key={r.market}>
                <span className="font-semibold">{r.market}</span>{" "}
                {r.currentAmount !== null
                  ? currency(r.currentAmount, r.currency)
                  : r.status === "unavailable"
                    ? "No offer"
                    : "Unverified"}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
