"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bookmark, ShoppingBag } from "lucide-react";
import { getBasket, subscribeBasket } from "@/lib/basket-store";
export function Nav() {
  const path = usePathname();
  const [basketCount, setBasketCount] = useState(0);

  useEffect(() => {
    setBasketCount(getBasket().length);
    return subscribeBasket(() => {
      setBasketCount(getBasket().length);
    });
  }, []);

  return (
    <nav aria-label="Main navigation" className="flex gap-1">
      {[
        { href: "/", name: "Explore", icon: Search },
        { href: "/watchlist", name: "Watchlist", icon: Bookmark },
        {
          href: "/basket",
          name: "Basket",
          icon: ShoppingBag,
          badge: basketCount > 0 ? basketCount : undefined,
        },
      ].map(({ href, name, icon: Icon, badge }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={`flex min-h-11 items-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-3 text-xs sm:text-sm font-semibold ${path === href ? "bg-brand-soft text-brand" : "text-muted hover:bg-background"}`}
        >
          <Icon size={16} />
          {name}
          {badge !== undefined && (
            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white dark:text-background">
              {badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
