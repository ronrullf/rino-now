"use client";
import Link from "next/link";
import { api } from "./client-api";
export function ProductLink({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      className={className}
      href={`/product/${id}`}
      onClick={() => {
        void api("/api/recent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: id }),
          keepalive: true,
        }).catch(() => {});
      }}
    >
      {children}
    </Link>
  );
}
