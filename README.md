# Region — private Xbox price workspace

A lightweight Next.js / TypeScript / Tailwind dashboard for comparing the **same Xbox product** in the United States, Turkey, India, and Japan. Blue actions, green verified savings, responsive cards, and persistent light/dark themes.

## Start locally

Requirements: Node **24.14.1** (see `.node-version`), npm, writable persistent disk, and outbound HTTPS to the configured providers. Windows is supported. The installed better-sqlite3 package includes a compatible native binary on the tested Windows environment; unsupported architectures may require Python and the platform's C++ build tools.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Open **http://127.0.0.1:3000**. No Microsoft credentials or paid service are required with the default Frankfurter provider. Development and production commands bind to loopback only.

For local production:

```powershell
npm run build
npm run start
```

Keep the process running while using the app. Run commands from the project root so the SQLite migration and optional fixtures can be found.

## Use

1. Search a title, or paste an official Xbox product URL / 12-character product ID.
2. Select the exact edition or DLC. Unknown platform metadata remains labeled.
3. Compare native prices and approximate USD amounts across four markets with real-time foreign transaction fee simulations (0%, +1.5%, +2.5%, +3.0%).
4. Track historical price checks and All-Time Low (ATL) indicators, and navigate between related editions and add-ons.
5. Save products to the watchlist with multi-dimensional filtering, batch refresh, and CSV/Markdown export.
6. Assemble a team purchasing basket to compute the optimal multi-market split, consolidated single-store comparisons, and total portfolio savings.

Savings use the **current public US price**, not US MSRP. Membership, subscription, trial, rental, conditional, ambiguous, expired, or excessively stale offers cannot win. A confirmed zero public price is valid; missing prices remain null. Regional links do not control the account/checkout region.

## Team Features & Capabilities

- **Team Purchasing Basket & Multi-Store Planner (`/basket`)**: Add any games or DLCs to a local purchasing basket. Computes the optimal hybrid split (buying each item in its cheapest regional store), complete single-country totals (buying everything in US vs TR vs IN vs JP), aggregate USD savings, and 1-click Markdown reports formatted for Slack/Notion.
- **Watchlist Power Tools**: Batch sequential refresh with polite pacing and progress indicators, multi-dimensional filters (title search, category pills, winning region filter, savings threshold), 1-click RFC 4180 CSV export, 1-click Markdown table export, and basket synchronization.
- **Foreign Transaction Fee Simulator**: Simulate real credit card foreign transaction fees (0%, +1.5%, +2.5%, +3.0%) applied to TRY, INR, and JPY while preserving USD base, updating winner rankings and savings dynamically.
- **Price History & All-Time Low (ATL) Tracking**: Transparent price check history recording with 24h deduplication in SQLite. Displays green "ATL" badges on region cards when a price matches or beats recorded history, with a collapsible history drawer.
- **Related Editions & Add-ons Switcher**: Core franchise discovery identifying standard, deluxe, and premium editions as well as add-on bundles for fast 1-click switching.


## Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install locked dependencies |
| `npm run db:migrate` | Create/open the database and apply versioned SQL migration |
| `npm run probe` | Query live providers, refresh sanitized fixtures, and write diagnostic results |
| `npm run dev` | Local development on 127.0.0.1:3000 |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | TypeScript strict checks |
| `npm test` | Pricing, parser, cache, HTTP, and persistence regression tests |
| `npm run build` | Production build |
| `npm run start` | Local production server |
| `npm run test:ui` | Headless Edge browser and axe accessibility tests; requires a production build |
| `npm run smoke:live` | Live API smoke tests against the running production app |
| `npm run format` | Format source files |

Browser tests use an isolated **fixture** database and port 3100; they never change the live watchlist. Microsoft Edge is installed on the tested Windows machine. On another host, install a Playwright browser and change the `channel` setting in `playwright.config.ts` accordingly. Screenshots are saved under `docs/screenshots` and clearly show the demo banner.

Provider probes are deliberately separate from ordinary tests. They update the recorded fixtures; review resulting changes before committing. The fixture clock is fixed to 2026-10-03T16:00Z to make observed sale offers reproducible. A later probe may require updating fixture-clock tests if offers change. Live smoke tests never assert that current prices equal historic fixture amounts.

## Configuration

See `.env.example`. Set variables in `.env.local` for Next.js, migrations, and the diagnostic script. Restart after configuration changes.

- `DATA_MODE=live` is the default. `fixture` is explicit, shows a persistent **Demo data** banner, and appends `.fixture` to the database path. It supports the two recorded Forza products only. There is no automatic switch to demo data after failure.
- `DATABASE_PATH` defaults to `./data/xbox-comparator.sqlite`.
- `APP_ORIGIN` must match the address used in the browser. It protects mutations through both Origin and Host checks. If changing ports, change this value too.
- `FX_PROVIDER=frankfurter` requires no key. `exchangerate` uses the documented v6 Standard endpoint and `EXCHANGERATE_API_KEY` on the server. This optional adapter was not live-tested because no key was supplied.
- `FX_FALLBACK_PROVIDER=none` prevents silent fallback. Explicitly configure `frankfurter` or `exchangerate` to allow a fallback; each conversion identifies its actual provider.
- Search TTL is 15 minutes (empty results: 2 minutes), regional price TTL 1 hour, absent/conditional/ambiguous listing TTL 15 minutes, metadata TTL 24 hours, and FX fetch TTL 12 hours. Known offer expiry shortens the price TTL.
- Prices older than 6 hours or FX effective dates older than 7 days are reference-only and excluded from ranking.
- Manual refresh cooldown is 30 seconds per product. Upstream calls have an 8-second attempt timeout, at most one transient retry, and a global concurrency limit of four.

## Architecture and price correctness

App Router pages call same-origin Route Handlers. Provider, database, and configuration entry points are server-only; the browser receives normalized DTOs rather than raw catalog responses. APIs are dynamic and `no-store`; SQLite is the authoritative cache.

The catalog parser checks actual purchase actions, active offer dates, market/currency, full ownership SKU type, trial/subscription flags, and eligibility restrictions. Unknown constraints are rejected conservatively. Entitlement keys combine product identity, the sorted bundled product IDs or verified fulfillment identity, and the supported offer platforms. They do **not** assume SKU IDs are globally identical. Differing entitlement keys cannot participate in the same ranking. This may exclude legitimate offers for products whose metadata cannot establish equivalence; their cards explain the limitation.

Within one verified entitlement the lowest ordinary public amount wins, with availability ID as deterministic tiebreaker. `ListPrice` supplies the observed purchase amount. `MSRP` is displayed explicitly as **Reference MSRP**, not guaranteed regular checkout price. Sale end is derived only from a dated eligible discounted offer.

Money and rates are decimal strings. Rates are normalized once to USD per local unit. Decimal arithmetic preserves calculation precision; displayed winner ranking rounds to USD cents with half-up rounding. Missing US price prevents savings calculations but can still allow regional ranking. A zero US baseline never produces a percentage division by zero.

SQLite uses WAL, foreign keys, and a busy timeout. Drizzle handles bound queries. The checked-in SQL migration and `user_version` support reproducible initialization. Product/snapshot/rate payloads use typed JSON TEXT columns to keep the single-owner schema small, with relational keys and ordering/search indexes. Derived USD values are not persisted as source prices. Failed attempts are separate from successful snapshots.

Concurrency deduplication assumes **one Node process**. Stale acceptable snapshots return immediately, followed by one explicit client refresh request. Watchlist reads never refresh the full saved catalog. FX refresh can recalculate cached local prices independently. Network I/O does not occur inside database transactions.

## Verified capabilities and limits

See `docs/provider-validation.md`, `docs/probe-results.json`, and `docs/live-smoke-results.json` for evidence.

- Live title search and ID lookup were exercised with real game and DLC products.
- Catalog lookup and currencies were observed across US/TR/IN/JP; dated Frankfurter conversion was verified.
- Title search exposes the first upstream page (10 observed results, client cap 20). Pagination remains deliberately disabled because cursor semantics were not validated. Refine the query for a specific edition.
- A provider outage returns local title matches with a warning; with no local matches it returns an actionable 503. Failures are never cached as empty search results.
- Store listing URLs were checked for product identity and locale. The Turkish listing produced an intermittent HTTP 500 and subsequently returned 200 on retry. These public endpoints are not a guaranteed Microsoft API contract.
- Store availability and final checkout price may differ. No account eligibility, tax adjustment, card fee, payment spread, purchase, or region-change automation is provided.
- `npm audit --omit=dev` reported no production vulnerabilities. The full audit reports five high-severity entries in the development-only eslint-config-next → fast-glob → micromatch → braces chain. The offered forced fix downgrades the Next lint configuration incompatibly; no forced downgrade was applied. Review upstream updates before changing the lockfile.

## Persistence, backup, and private hosting

The database, WAL/SHM files, `.env` files, test databases, and dependencies are ignored by Git. Watchlist limit: 200; recent selections: 50. Recent entries are recorded only through explicit selection POSTs, not page prefetch.

For a simple consistent backup:

1. Stop every application process using this database.
2. Copy the database file and any remaining matching `-wal` / `-shm` files together into a dated backup folder.
3. Restart the application.

Restore only with the application stopped. Move the existing database and sidecars aside, restore the matching backup set to the configured path, then start the app. Never copy only the main file from a running WAL database. For online backups, use better-sqlite3's SQLite backup API instead.

Run remotely only on a persistent Node host with a writable persistent volume and an authenticated reverse proxy or private-network access control covering **all pages and APIs**. Update `APP_ORIGIN` and preserve Host/Origin through the proxy. Keep the Node service bound to loopback behind that proxy. On Vercel, use the serverless mode described below. Edge workers are not supported.

## Vercel deployment

Vercel is detected automatically (`VERCEL=1`). Its application directory is read-only: the app therefore uses in-memory SQLite only as a disposable price/search cache. A copied local `DATABASE_PATH` is ignored on Vercel. Migrations are included in API function bundles. No catalog key or external database is needed for live search and prices.

1. Import this repository using the Next.js preset and Node 24.x. Use the default install/build commands.
2. Keep `DATA_MODE=live`, `FX_PROVIDER=frankfurter`, and `FX_FALLBACK_PROVIDER=none` (these are defaults). Do not set fixture mode.
3. Vercel deployment and production domains are accepted automatically for refresh actions. For a custom domain set `APP_ORIGIN=https://your-domain.example` with no path. Remove any copied localhost `APP_ORIGIN`.
4. Redeploy after changing environment variables. `/api/health` should return `ready: true` and `storage: "browser-with-ephemeral-cache"`.

On Vercel, watchlist and recent selections are stored in localStorage in the current browser and domain. They survive function restarts but do not sync between devices or domains, and clearing site data removes them. Existing local SQLite watchlists are not uploaded or migrated automatically. Saved watchlist prices are labelled references; open a product to obtain a current comparison. Server watchlist mutations are disabled in this mode so temporary instance state cannot be mistaken for durable storage. Local hosting continues to use the persistent SQLite database.

Cold functions fetch their own regional prices; caches and request limits are per instance rather than shared globally. API routes that contact upstream services allow 60 seconds. A shared cloud database would be required for cross-device saved lists and shared cache/cooldowns. Protect an internal Vercel deployment with your chosen access control; the app itself does not provide login. Unexpected API errors are recorded in function logs, while browsers receive a generic error without server paths.
