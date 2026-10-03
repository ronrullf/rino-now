"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bookmark } from "lucide-react";
export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex gap-1">
      {[
        { href: "/", name: "Explore", icon: Search },
        { href: "/watchlist", name: "Watchlist", icon: Bookmark },
      ].map(({ href, name, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${path === href ? "bg-brand-soft text-brand" : "text-muted hover:bg-background"}`}
        >
          <Icon size={16} />
          {name}
        </Link>
      ))}
    </nav>
  );
}
