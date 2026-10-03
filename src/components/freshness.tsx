"use client";
import { useEffect, useState } from "react";
export function Freshness({
  at,
  stale = false,
}: {
  at: string | null;
  stale?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!at) return <span>Not fetched</span>;
  const minutes = Math.max(0, Math.floor((now - Date.parse(at)) / 60000));
  return (
    <time dateTime={at} title={new Date(at).toLocaleString()}>
      {stale ? "Cached" : "Updated"}{" "}
      {minutes < 1
        ? "just now"
        : minutes < 60
          ? `${minutes} min ago`
          : minutes < 1440
            ? `${Math.floor(minutes / 60)} hours ago`
            : `${Math.floor(minutes / 1440)} days ago`}
    </time>
  );
}
