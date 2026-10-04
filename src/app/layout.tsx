import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Globe2, LockKeyhole } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Nav } from "@/components/nav";
import { config, serverless } from "@/lib/config";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Region — Xbox price workspace", template: "%s · Region" },
  description:
    "A private workspace for comparing exact Xbox products across four markets.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme =
    (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme}>
      <body data-storage={serverless ? "browser" : "server"}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="shell flex min-h-21 flex-wrap items-center justify-between gap-3 py-4">
            <Link
              href="/"
              className="flex items-center gap-3"
              aria-label="Region home"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white dark:text-background">
                <Globe2 size={24} />
              </span>
              <span>
                <strong className="block text-xl tracking-tight">
                  region<span className="text-brand">.</span>
                </strong>
                <span className="eyebrow !text-[9px]">
                  Xbox price workspace
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Nav />
              <span className="hidden h-6 w-px bg-line sm:block" />
              <ThemeToggle initial={theme} />
            </div>
          </div>
        </header>
        {config.DATA_MODE === "fixture" && (
          <div
            role="status"
            className="bg-brand-soft px-4 py-2 text-center text-sm font-semibold text-brand"
          >
            Demo data · Recorded provider fixtures · Not current live prices
          </div>
        )}
        <main
          id="main"
          className="shell min-h-[calc(100vh-180px)] py-8 sm:py-12"
        >
          {children}
        </main>
        <footer className="shell flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-xs text-muted">
          <span className="flex items-center gap-2">
            <LockKeyhole size={13} />
            {serverless
              ? "Saved games stay in this browser · Four markets"
              : "Private workspace · Four markets. One clear comparison."}
          </span>
          <span>USD estimates · Verify final prices in the regional store</span>
        </footer>
      </body>
    </html>
  );
}
