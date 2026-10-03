# Xbox Regional Price Comparator — Codex Build Specification

## 1. Instruction to Codex

Build a complete, working private internal web application from this specification. Implement the frontend, backend, Microsoft integrations, currency conversion, SQLite persistence, migrations, meaningful tests, and setup documentation. Do not stop at a UI mockup or architecture proposal.

Use **Next.js, TypeScript, Tailwind CSS, Microsoft DisplayCatalog, Microsoft product search, an FX provider, and SQLite**. Keep the implementation small enough for one owner to run locally or on a private persistent Node.js host.

The product is an internal research and purchasing comparison tool. Its main flow is:

**Search a game or DLC → select the exact edition → compare US, Turkey, India, and Japan → see USD equivalents and savings → open the regional store page.**

Read the entire specification before implementation. Inspect any existing repository and its AGENTS.md instructions first. Preserve existing working code when applicable. Choose routine implementation details autonomously. Record material assumptions and unresolved upstream limitations in the README.

This document is the build plan, not proof that the proposed Microsoft endpoints currently work. Begin with the integration validation phase below. Never report an untested endpoint, invented product, or fixture price as a live integration.

## 2. Scope and priorities

### Required MVP

- Search Xbox console games, DLCs, editions, and bundles by title.
- Allow a Microsoft/Xbox product URL or product ID as an alternative input.
- Show matching results with cover, title, product type, publisher when available, and platform metadata.
- Select one exact product and retrieve its public purchase prices in US, TR, IN, and JP.
- Show the local currency amount and the approximate USD equivalent for each region.
- Show the absolute and percentage difference from the current US purchase price.
- Highlight the cheapest comparable available region, including US if it wins.
- Open a direct regional Xbox/Microsoft Store listing from each region card.
- Cache successful lookups and FX rates in SQLite.
- Show data freshness, partial failures, unavailable products, and conditional offers accurately.
- Provide manual refresh with bounded requests and a cooldown.
- Persist a small watchlist and recent selections for the single owner.
- Run locally without requiring a paid service, public deployment, or Microsoft account credentials.

### Explicit exclusions

No storefront, shopping cart, checkout, payments, customer accounts, resale workflow, automatic purchases, gifting, account-region changes, fulfillment, profit calculations, or full-store crawler. No Xbox-Now scraping, CAPTCHA bypass, Playwright-based price collection, or proxy service dependency.

A browser testing tool is acceptable for UI verification; it is not a production data collection mechanism.

### Later enhancements

A deals discovery page, historical price charts, export, notification alerts, extra countries, and membership-specific comparison can be added later. Do not let these delay the MVP. A watchlist comparison table may be sortable; do not label its limited results as the best deals across the entire Xbox catalog.

## 3. Product behavior

### Region configuration

| Market | Name | Currency | Catalog language candidate | Store locale candidate |
|---|---|---|---|---|
| US | United States | USD | en-US | en-US |
| TR | Turkey | TRY | tr-TR | tr-TR |
| IN | India | INR | en-IN | en-IN |
| JP | Japan | JPY | ja-JP | ja-JP |

Validate language and locale support during integration work; configure any verified correction centrally. The interface itself is English. Titles may be localized by the upstream provider; use the US title for the main heading when available and retain regional titles as metadata.

“Original USD price” means the **current ordinary public US purchase price** by default. Display the US regular price separately when it can be identified reliably. Clearly label comparisons against the current US price; do not silently compare a foreign sale against the US regular price.

Only compare the selected exact edition and ownership entitlement. A Standard Edition must never be silently substituted for a Deluxe Edition, upgrade, subscription, rental, trial, or different-platform edition.

### Search

- Debounce title searches by about 350 ms; minimum two characters; maximum 120.
- Abort superseded client requests and ignore out-of-order responses.
- Submit URLs and product IDs directly through the lookup path.
- Return at most 20 matches per page; support upstream paging only after it is verified.
- Deduplicate by Microsoft product ID, not by title.
- Keep games and DLC results visible and labeled. Do not infer DLC type solely from title words.
- Do not hide unknown platform metadata as if it were verified Xbox compatibility. Label it explicitly.
- Zero matches means “No matching products found,” not a provider outage.
- A provider outage means “Search is temporarily unavailable,” with local cached matches if present.
- Give an actionable product URL/ID input fallback if title search is blocked or unavailable.

### Product page

Show title, cover, publisher, product type, selected edition/platform information, and four consistent regional cards. Each card contains:

- Country name and currency.
- Current local price.
- Approximate USD equivalent.
- Savings or extra cost versus US in dollars and percent.
- Regular local price and sale end time only when trustworthy fields support them.
- Price status and freshness.
- A clearly labeled external store link.

The summary displays the cheapest eligible region or tied regions, its USD equivalent, and savings versus US. If US is cheapest, say so. If the US price is missing, absolute ranking may still work, but savings versus US must display “Unavailable.” If not all regions are usable, say “Cheapest among available comparable prices.”

Treat a store link as a link to a listing. Its existence does not prove that the owner's account can complete a purchase in that region. Use a brief product note: “USD conversions are estimates. Final store availability and checkout price may differ.”

## 4. Integration validation — first implementation milestone

Before building pricing UI around assumptions, implement a diagnostic script, `scripts/probe-providers.ts`, and write `docs/provider-validation.md` with the execution date, tested request shapes, redacted example responses, and results.

### Microsoft DisplayCatalog candidate

Investigate and test this candidate server-side request:

```text
GET https://displaycatalog.mp.microsoft.com/v7.0/products
  ?bigIds=<PRODUCT_ID>
  &market=US
  &languages=en-US
  &fieldsTemplate=Details
```

Repeat for the other three markets. This is a candidate integration from the prior conversation, not a promised public API contract or availability guarantee.

Probe at least one verified paid Xbox console game, one DLC, and one product with multiple offers or editions. Identify the actual product, SKU, availability, eligibility, price, currency, sale, platform, and purchase metadata. Preserve small response fixtures for parser tests after removing irrelevant fields and personal data.

Candidate price hierarchy to investigate:

```text
product.DisplaySkuAvailabilities[]
  .Availabilities[]
  .OrderManagementData.Price
```

Candidate fields include `CurrencyCode`, `ListPrice`, and `MSRP`. Confirm their meaning using observed responses and Microsoft documentation where available. Do not assume that the first availability is a purchasable full game or that MSRP always describes the regular public price.

### Microsoft product search candidate

Investigate and test the prior conversation's candidate:

```text
GET https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/Games/products
  ?query=<ENCODED_QUERY>
  &market=US
  &languages=en-US
  &fieldsTemplate=Details
  &platformdependencyname=windows.xbox
```

Verify the path, query parameters, filtering, paging, and response shape. If unsupported, identify the request used by Microsoft's current public Xbox search flow from official sources or a permissible direct inspection. Document the replacement and encapsulate it behind the same adapter. Do not build a massive recommendation-list catalog as a substitute for title search.

If live title search cannot be made reliable, finish the rest of the app with a working ID/URL lookup and cached-title search, expose that limitation clearly, and report that live title search remains blocked. Never substitute fake search results.

### Regional store links

Prefer a trusted regional URL supplied by Microsoft if present. Otherwise test a candidate such as:

```text
https://www.xbox.com/<verified-locale>/games/store/<encoded-slug>/<PRODUCT_ID>
```

Verify route resolution, product identity, and market behavior for all four locales. If an official Microsoft Store route is more reliable, use it consistently. Record any locale redirects. Never claim a link controls account or checkout region. Do not build links from untrusted hosts returned by input or upstream data without validating them.

### Validation outcome

Classify each capability as verified, unsupported, or blocked by the environment. When live network access is blocked, continue with adapter tests and clearly labeled fixture mode, but do not claim the live application is fully verified. GTA VI prices, edition names, and product IDs in earlier examples are not authoritative fixtures; use actual verified products for diagnostics.

## 5. Technology and project organization

- Use a current supported Next.js release with the App Router, pinned in the lockfile.
- TypeScript strict mode; no unvalidated `any` objects at provider boundaries.
- Tailwind CSS following the installed version's official setup.
- Next.js Route Handlers for browser-facing APIs.
- Node.js runtime for SQLite and provider integrations; no Edge runtime for database handlers.
- SQLite with `better-sqlite3` and Drizzle ORM/migrations, or a comparably small maintained SQLite adapter if runtime compatibility requires it.
- Zod for input and normalized-output validation.
- A decimal library, such as `decimal.js`, for currency arithmetic.
- Vitest for business logic and adapter tests.
- Optional lucide-react for icons; avoid a large component framework unless useful.

Do not add Redis, queues, microservices, a separate NestJS backend, or PostgreSQL for this single-user MVP.

Suggested layout:

```text
src/
  app/
    page.tsx
    product/[productId]/page.tsx
    watchlist/page.tsx
    api/search/route.ts
    api/products/[productId]/route.ts
    api/products/[productId]/refresh/route.ts
    api/watchlist/route.ts
    api/watchlist/[productId]/route.ts
    api/recent/route.ts
    api/health/route.ts
  components/
    search-box.tsx
    search-results.tsx
    product-header.tsx
    region-card.tsx
    comparison-summary.tsx
    freshness-label.tsx
    watchlist-table.tsx
  lib/
    config.ts
    contracts.ts
    providers/microsoft-catalog.ts
    providers/microsoft-search.ts
    providers/fx.ts
    providers/frankfurter.ts
    providers/exchangerate.ts
    pricing/normalize-offers.ts
    pricing/compare.ts
    pricing/money.ts
    services/search.ts
    services/comparison.ts
    services/refresh.ts
    db/client.ts
    db/schema.ts
    db/repositories.ts
    http/upstream.ts
    security/inputs.ts
    security/origin.ts
scripts/probe-providers.ts
drizzle/
tests/fixtures/
docs/provider-validation.md
.env.example
README.md
```

Use `server-only` boundaries for provider, database, and secret configuration modules. Send normalized DTOs to the client instead of entire Microsoft responses.

## 6. Provider interfaces and normalized contracts

Define adapters that hide unstable upstream response shapes:

```ts
type Market = 'US' | 'TR' | 'IN' | 'JP';
type Currency = 'USD' | 'TRY' | 'INR' | 'JPY';
type ProductType = 'game' | 'dlc' | 'bundle' | 'edition' | 'unknown';
type PriceStatus =
  | 'available'
  | 'unavailable'
  | 'unknown'
  | 'conditional_only'
  | 'ambiguous';

interface CatalogProvider {
  getProduct(productId: string, market: Market): Promise<NormalizedProduct>;
}
interface SearchProvider {
  search(query: string, cursor?: string): Promise<SearchPage>;
}
interface FxProvider {
  getUsdRates(): Promise<FxSnapshot>;
}
```

Complete the referenced interfaces during implementation. Money amounts and rates should be decimal strings in JSON, never formatted currency strings or floating point database values.

Every normalized region result must retain:

- Product ID, market, expected and observed currency.
- Status and explanatory reason code.
- Current public local amount and regular local amount, nullable separately.
- Selected SKU/availability identifiers and a verified comparable entitlement key.
- Purchase kind, platform, and eligibility classification.
- Sale end when valid.
- Store URL.
- Last successful price fetch, last attempted fetch, and refresh error separately.
- FX rate, rate date, provider, and fetch time when conversion is possible.
- Converted USD, signed difference, savings, and freshness flags as derived values.

Separate absence from operational failure. A confirmed absent listing is `unavailable`; a failed upstream request is `unknown` unless a prior successful snapshot can be returned with a stale/error flag. A malformed response is a parser error, not an empty product.

## 7. Offer selection and equivalence

This is a critical business rule, not just JSON extraction.

1. Validate returned product identity and target market.
2. Inspect all SKU/availability candidates.
3. Reject trials, demos, rentals, subscription access, installment prices, and offers requiring ownership of another product unless the selected item itself is an explicitly identified upgrade/DLC.
4. Separate member, account-specific, and other conditional offers from ordinary public purchase offers.
5. Confirm the offer is active and publicly purchasable using verified fields.
6. Confirm currency matches the configured region. A mismatched currency is not converted as if correct.
7. Match an equivalent ownership entitlement/platform across regions using actual provider metadata. Do not assume SKU IDs are globally stable; verify them or construct a documented mapping.
8. If multiple eligible offers remain, apply a deterministic documented rule only within the same verified entitlement. Preserve the selected identifiers for debugging.
9. If equivalence or eligibility cannot be established, mark the region `ambiguous` and exclude it from cheapest ranking.
10. Treat zero as free only when a valid public purchase offer explicitly returns a zero amount. Never use zero as a missing-value default.

Use `null` for missing prices. Subscription inclusion may be shown as a separate informational badge, but its zero incremental cost is not a purchase price. Membership prices may appear as secondary labeled metadata and must not affect MVP ranking.

## 8. FX integration and comparison math

Implement one primary FX provider. Prefer Frankfurter after validating the required pairs. Its official documentation is at https://frankfurter.dev/ and currently describes v2 rate and currency endpoints. Confirm the actual response schema during the provider probe rather than mixing v1 and v2 assumptions.

Candidate requests:

```text
GET https://api.frankfurter.dev/v2/rates?base=usd&quotes=try,inr,jpy
GET https://api.frankfurter.dev/v2/currencies
```

Normalize each response to **USD per one local currency unit**. If the endpoint returns local units per USD, invert it exactly once. Set USD's rate to 1 without an upstream request. Retain the rate's effective date separately from the fetch timestamp.

Provide a configurable ExchangeRate API adapter if Frankfurter fails validation or the owner configures a fallback. Implement against the specific provider's official documentation; keep API keys server-side. Automatic fallback is enabled only if configured and must label the actual provider used. Do not silently insert hardcoded exchange rates.

Using decimal arithmetic:

```text
regionalUsd = localAmount × usdPerLocalUnit
deltaUsd = regionalUsd − usCurrentUsd
deltaPercent = (deltaUsd / usCurrentUsd) × 100
savingsUsd = usCurrentUsd − regionalUsd
savingsPercent = (savingsUsd / usCurrentUsd) × 100
```

Use full precision for calculations, then format USD to two decimals. Format local amounts with `Intl.NumberFormat` using each currency's standard fraction digits; JPY usually displays no decimal places.

If the US price is absent, dollar/percentage comparisons versus US are null. If US price is zero, dollar difference is valid but percentage difference is null; never divide by zero. Negative savings should be presented as “Costs $X more,” not as a confusing negative saving.

Rank only comparable public purchase offers with usable FX and acceptable freshness. Use USD cents rounded with a documented half-up rule for displayed ranking; offers rounding to the same cent are tied. Keep full precision in the data. A missing FX rate should leave the local price visible and disable only USD conversion and ranking for that region.

Prices and FX must carry their own timestamps. A refreshed FX rate can recalculate existing local prices without re-fetching all product data. Do not store converted amounts as the source of truth.

Conversions do not include card fees, taxes not already reflected upstream, payment spreads, or purchasing eligibility. Do not add a margin calculator to the MVP.

## 9. SQLite persistence

Use a real persistent file, for example `./data/xbox-comparator.sqlite`. Enable foreign keys, WAL mode, and a reasonable busy timeout. Use migrations committed to source control. Keep transactions short and never hold one open while awaiting network calls.

Suggested schema:

### products

`product_id TEXT PRIMARY KEY`, `title TEXT NOT NULL`, `product_type TEXT NOT NULL`, `publisher TEXT`, `cover_url TEXT`, `platforms_json TEXT`, `metadata_fetched_at TEXT NOT NULL`, `last_viewed_at TEXT`.

### regional_snapshots

Composite primary key `(product_id, market)`, foreign key to products.

Fields: `status`, `reason_code`, `currency`, `current_amount TEXT`, `regular_amount TEXT`, `sku_id`, `availability_id`, `entitlement_key`, `purchase_kind`, `eligibility`, `sale_end_at`, `store_url`, `price_fetched_at`, `expires_at`. Successful snapshot status includes confirmed unavailable/conditional/ambiguous states, not just paid prices.

### regional_refresh_state

Composite key `(product_id, market)`, foreign key to products. Store `last_attempt_at`, `last_error_code`, and `last_error_at`. Failed refreshes update this table without destroying a previous successful snapshot.

### fx_snapshots

Primary key `(provider, quote_currency, effective_date)`. Store `usd_per_local_unit TEXT`, `fetched_at`, and source metadata. Store normalized direction explicitly; require positive finite rates.

### search_cache

`cache_key TEXT PRIMARY KEY`, normalized query, provider identifier, search market, cursor, result JSON, `fetched_at`, `expires_at`. The key must include query and relevant provider/search configuration, not just title text.

### watchlist

`product_id TEXT PRIMARY KEY REFERENCES products(product_id)`, `added_at TEXT NOT NULL`.

### recent_products

`product_id TEXT PRIMARY KEY REFERENCES products(product_id)`, `viewed_at TEXT NOT NULL`. Keep the latest 50 selections.

Optional `refresh_leases` table if multiple Node workers are supported. For the default single-process deployment, in-process single-flight deduplication is sufficient; document that scope.

Add indexes for titles, cache expiry, recent selections, and watchlist ordering. Use bound parameters through the ORM. Store UTC ISO timestamps consistently. Back up the SQLite file safely with SQLite's backup API or stop the process first; copying an active WAL database file alone is not a reliable backup.

## 10. Caching, concurrency, and reliability

Defaults, configurable through environment variables:

| Data/action | Default |
|---|---|
| Successful title search | 15 minutes |
| Empty successful search | 2 minutes |
| Product metadata | 24 hours |
| Regional prices | 1 hour |
| Confirmed unavailable listing | 15 minutes |
| FX fetch | 12 hours |
| Maximum price age for ranking | 6 hours |
| Maximum FX effective-date age for ranking | 7 days |
| Manual refresh cooldown | 30 seconds per product |
| Upstream timeout | 8 seconds per attempt |
| Transient retries | At most 1 |

Price TTL must also respect a known sale expiry; expire at the earlier of the configured TTL and sale end. After sale end, do not keep presenting an expired sale as current even if a general stale window remains.

Fetch the four regions concurrently with `Promise.allSettled`, with a small global outbound concurrency limit such as 4. Preserve successful regions when others fail. Fetch FX independently, typically once for the whole comparison.

Deduplicate simultaneous requests for the same product/market. A cold lookup awaits bounded requests; warm fresh lookups return from SQLite. Stale but acceptable snapshots may be returned immediately with explicit freshness state. Use a reliable local scheduler/client follow-up refresh or a supported server after-response mechanism; do not depend on unawaited promises surviving a serverless request.

Retry only transient failures such as network errors, 429, and selected 5xx statuses. Honor `Retry-After` within the request budget; otherwise return a retryable error. Do not retry normal not-found results or hammer CAPTCHA/sign-in walls. Never cache a provider failure as a successful empty search.

When a snapshot exceeds its ranking age, keep it visible as stale reference data but exclude it from winner selection. If the live refresh fails, show the failure and last successful time. Add a short upstream failure cooldown to avoid repeated identical failing calls.

## 11. Application API

Use same-origin Route Handlers with runtime validation and a common envelope:

```ts
type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
};
type ApiEnvelope<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: ApiError };
```

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/search?q=...` | GET | Title search; optional validated cursor |
| `/api/products/:productId` | GET | Normalized four-region comparison |
| `/api/products/:productId/refresh` | POST | Bounded refresh; return updated comparison |
| `/api/watchlist` | GET | Saved products and cached comparison summaries |
| `/api/watchlist` | POST | Add validated product ID after successful metadata resolution |
| `/api/watchlist/:productId` | DELETE | Remove saved item |
| `/api/recent` | GET | Most recent selected products |
| `/api/health` | GET | Local liveness and database readiness |

Record a recent selection through an explicit same-origin POST action/endpoint when the user selects a product; background prefetch must not create recent selections. Complete that small endpoint during implementation.

HTTP 400 for invalid input, 404 for confirmed product absence, 429 for cooldown/rate limit, and 502/503 for unusable provider results. A partial successful comparison returns 200 with per-region status and warnings. An entirely failed uncached lookup returns an error, not four “unavailable” cards. Health checks must not fetch Microsoft on every call.

Keep upstream raw JSON, API secrets, stack traces, and internal database paths out of client responses. For dynamic comparison handlers, control Next.js caching explicitly and keep SQLite as the authoritative data cache. Prevent static build-time provider fetching.

## 12. UI and accessibility

Use a restrained dashboard design: neutral background, readable typography, compact spacing, and green emphasis for verified savings. Avoid promotional storefront styling and heavy decorative imagery.

Home page: prominent search field, results, recent products, and watchlist shortcut. Product page: header, winner summary, four regional cards, manual refresh, save/remove watchlist button. Watchlist: compact sortable table with product, four USD equivalents, best region, savings, and update time.

Use a four-card row on wide screens, two columns at intermediate widths, and one column on mobile. A comparison table may be provided on desktop if clearer. Every winner/error status must include text or an icon label; do not rely on color alone.

Support keyboard search and result selection, visible focus, labeled controls, `aria-live` status updates, loading skeletons, empty states, error states, and missing-cover fallback. Avoid a large combobox accessibility burden if a search field plus accessible results list suffices.

External links open in a new tab with `rel="noopener noreferrer"`; label the destination market. Keep refresh and watchlist controls outside the clickable store link to avoid nested interactive elements.

Display “Updated 18 minutes ago” and make the exact timestamp available. UI timestamps may be localized to the owner's browser timezone; persisted timestamps remain UTC. Show FX date in the comparison footer and specific rate dates when they differ.

## 13. Private operation and input safety

Default to local-only operation bound to `127.0.0.1`. Do not publish or deploy the app as part of this build unless explicitly requested later.

No customer account system is needed. If hosted remotely, place the entire app and API behind a private network or an authenticated reverse proxy before exposing it. A secret URL is not access control. Document a simple private-host deployment option without implementing a multiuser identity platform.

Validate product IDs using the actual verified Microsoft ID format; an initial candidate is a 12-character alphanumeric ID. Parse Xbox/Microsoft input URLs locally, allow only known official hosts/routes, and extract the ID. Do not fetch arbitrary user-supplied URLs. Allowlist provider hosts in the adapters and validate redirects, avoiding SSRF.

Keep FX keys in server environment variables, never `NEXT_PUBLIC_*`. Check Origin/Host for state-changing requests in addition to deployment-level access controls. Bound query lengths, timeouts, refresh rate, and watchlist size (for example 200). Do not log credentials or complete provider request URLs containing keys.

The app reads public product information and opens store pages. It does not collect Microsoft passwords or store authentication cookies.

## 14. Configuration and local setup

Provide an `.env.example` with comments and safe defaults, adapted to the selected providers:

```dotenv
DATABASE_PATH=./data/xbox-comparator.sqlite
APP_ORIGIN=http://127.0.0.1:3000
FX_PROVIDER=frankfurter
FX_FALLBACK_PROVIDER=none
EXCHANGERATE_API_KEY=
SEARCH_TTL_SECONDS=900
PRICE_TTL_SECONDS=3600
PRICE_MAX_RANK_AGE_SECONDS=21600
FX_TTL_SECONDS=43200
FX_MAX_RATE_AGE_DAYS=7
REFRESH_COOLDOWN_SECONDS=30
UPSTREAM_TIMEOUT_MS=8000
DATA_MODE=live
```

Fixture mode must be explicit (`DATA_MODE=fixture`) and display a persistent “Demo data” badge. Never switch automatically from live mode to fixture mode when a provider fails.

Document commands for install, migration, provider probing, development, lint, typecheck, tests, production build, and local production start. Define all referenced package scripts. Pin a compatible supported Node.js LTS version and document native SQLite prerequisites if needed.

Use a persistent Node process/host and a writable persistent disk. Ordinary ephemeral serverless storage and Edge workers do not satisfy this SQLite design. Keep database files, WAL/SHM files, `.env` secrets, and provider diagnostics containing sensitive values out of Git.

Use Docker only if it simplifies the owner's chosen deployment; it is not a prerequisite. Include private persistent-host notes and SQLite backup/restore instructions in the README.

## 15. Meaningful tests and verification

### Pricing unit tests

- Correct conversion for TRY, INR, and JPY, including inverted USD-base FX responses.
- Same US price with cheaper and more expensive foreign prices.
- Cheapest region can be US; ties at a displayed USD cent are handled.
- Missing US price allows ranking but removes US savings.
- US zero price produces no percentage division by zero.
- Missing local price differs from a verified free offer.
- Missing FX retains local price but excludes that region from ranking.
- Stale prices/FX and expired sales cannot win.
- Membership, trial, subscription, and incomparable offers cannot win.
- Rounding is consistent and negative savings uses extra-cost presentation.

### Adapter and service tests

- Parse actual sanitized Microsoft fixtures with multiple SKU/availability candidates.
- Reject unexpected identity, currency, malformed values, and unsupported shape changes.
- Handle absent regional listing versus transport failure separately.
- Warm cache avoids provider calls.
- Concurrent duplicate lookups share the same upstream work.
- Partial regional failure preserves other results and prior snapshots.
- Refresh failure does not overwrite successful cached prices or their fetch timestamps.
- Sale expiry shortens cache validity.
- Search failure is not cached as “no results.”
- URL input rejects arbitrary hosts and unsafe paths.
- SQLite migrations and persistence work across app restarts.
- Watchlist mutations are idempotent and recent selections are bounded.

### UI verification

Verify desktop and mobile layouts, keyboard search, selecting an exact edition, each market link, manual refresh, watchlist persistence, and missing/error states. UI tests can use mocked provider adapters, but live integration verification must be reported separately.

Do not assert that live prices equal static fixture amounts. Live smoke tests validate identity, response shape, currency, status, and sane values, not unstable prices. If network tests are skipped, explain why.

## 16. Implementation sequence

1. Inspect repository and instructions. Initialize the pinned stack and scripts.
2. Probe Microsoft lookup/search, FX currencies/rates, and regional links. Save the validation report and sanitized fixtures.
3. Implement typed adapters and deterministic offer selection.
4. Implement decimal conversion and comparison logic with unit tests.
5. Add SQLite migrations, repositories, cache lifecycle, and request deduplication.
6. Add API routes with input validation and partial-failure handling.
7. Build search, product comparison, watchlist, and recent selections UI.
8. Run checks, verify responsive/accessibility behavior, and smoke-test live integrations when available.
9. Complete README, configuration, known limitations, and private-host instructions.

If an upstream capability is blocked, continue independent implementation and document the exact limitation. Do not silently redefine the requirement or claim the blocked feature is complete.

## 17. Acceptance criteria

The tool is ready when:

- A title search returns actual matching Xbox products through the validated Microsoft integration.
- A supported ID/URL lookup works independently of title search.
- Selecting an exact product displays four regional statuses with correct native currencies.
- Valid regional public prices convert using actual dated FX rates.
- Savings use the current public US price, with clear labels.
- Cheapest highlighting excludes unavailable, ambiguous, conditional, expired, and overly stale data.
- Each region links to the verified product listing for that locale.
- Repeat fresh comparisons use persisted cache and do not re-fetch all four markets.
- One upstream failure does not erase valid comparisons elsewhere.
- Refresh, watchlist, and recent selections behave correctly across restarts.
- No production price is fabricated, guessed, or drawn from unlabeled fixtures.
- The app runs privately with SQLite on persistent disk and documented setup steps.
- Lint/typecheck, meaningful tests, and production build pass, or an exact blocker is reported.

If live search or provider access remains blocked, label the deliverable as a working implementation with that integration limitation, not a fully live completed tool.

## 18. Final delivery expected from Codex

Deliver the implemented source, dependency lockfile, migrations, tests, provider validation report, `.env.example`, and README. Finish with a concise report containing what works, commands run and their outcomes, provider capabilities verified, outstanding limitations, and how to start the app locally. Do not deploy publicly.

## 19. Source and verification notes

- Product scope is based on the supplied conversation and the explicit internal-only clarification.
- Microsoft endpoint examples in this specification are integration candidates requiring validation. The prior conversation contains conflicting recommendations and unverified example prices; those are not authoritative data.
- Frankfurter official documentation: https://frankfurter.dev/ — reviewed while preparing this specification on 2026-10-03. Recheck its supported versions, required currencies, request parameters, and response contracts at implementation time.
- ExchangeRate API official documentation: https://www.exchangerate-api.com/docs/overview — consult when implementing that optional provider; no plan, price, or quota is assumed here.
- Next.js documentation: https://nextjs.org/docs
- TypeScript documentation: https://www.typescriptlang.org/docs/
- Tailwind CSS documentation: https://tailwindcss.com/docs
- SQLite documentation: https://www.sqlite.org/docs.html
- Microsoft documentation portal: https://learn.microsoft.com/ — use applicable primary documentation alongside actual provider probes; do not equate a public-facing endpoint with a supported guaranteed API.

---

## Copyable Codex launch instruction

> Read `XBOX_INTERNAL_TOOL_BUILD_SPEC.md` completely, inspect the repository and AGENTS.md instructions, and implement the internal Xbox regional price comparator end to end. Start by validating Microsoft product search, DisplayCatalog, FX rates, and regional links. Use Next.js, TypeScript, Tailwind, and SQLite. Implement accurate offer selection, four-market comparison, caching, watchlist, recent selections, and meaningful tests. Never fabricate live prices or silently use demo data. Keep the application local/private and do not deploy publicly. Continue through implementation and verification; report exact upstream blockers rather than stopping at a plan.
