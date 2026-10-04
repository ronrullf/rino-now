# Final verification — 2026-10-03

| Check | Result |
|---|---|
| `npm run lint` | Passed, no warnings |
| `npm run typecheck` | Passed |
| `npm test` | 46 tests passed across 5 files |
| `npm run db:migrate` | Passed; database persistence also tested across reopening |
| `npm run build` | Passed; all application and API routes are dynamic |
| `npm run test:ui` | 3 browser scenarios passed on the final build |
| `npm run smoke:live` | Passed against the restarted final production build |
| `npm audit --omit=dev` | 0 production vulnerabilities |

Browser verification used headless Microsoft Edge and an isolated fixture database. Covered keyboard title search, exact-edition navigation, four region links, save/watchlist persistence, manual refresh cooldown, theme persistence, empty results, product absence, and rejection of unsafe origins. Axe WCAG A/AA checks passed on the comparison and mobile watchlist screens. Responsive layouts were checked at 320, 390, 768, 1024, and 1440 pixels, with no horizontal page overflow. Screenshots are in `screenshots/` and show the fixture banner.

Live verification exercised Microsoft title search, a paid Xbox edition, a DLC, US/TR/IN/JP currencies, real dated Frankfurter rates, and persisted warm-cache reuse. See `live-smoke-results.json` and `provider-validation.md`. Prices were not asserted against fixed historic amounts.

Known limits: first-page search only; optional ExchangeRate-API adapter requires a key and has not been live-tested; undocumented Microsoft catalog shapes are handled conservatively. One Turkish store request returned 500 before succeeding on repeat. Five development-only lint dependency audit entries remain documented in the README; the forced audit remedy would downgrade the lint framework incompatibly.

The production app was left running at http://127.0.0.1:3000 in live mode. It was not publicly deployed. Start it again with `npm run start` after stopping the session.

## Availability and store-link regression repair — 2026-10-03

- Fixed known payment-instrument restrictions being mistaken for membership eligibility. Unknown rules and entitlement remediations remain excluded.
- Added single-full-SKU in-game add-on identity using product, publisher and explicit add-on parent. Consumables additionally require an offer token and positive pack quantity. Quantity is the number of packs, not the advertised V-Bucks balance.
- Repurchasable consumables can now have public prices. Consumable metadata is classified as DLC.
- Store links use regional product titles and product IDs. Missing public listings offer an explicitly labelled regional store search. Official SKU-suffixed URLs can be pasted into the product lookup (lookup compares the product's eligible offers).
- Database version 2 invalidates obsolete regional/search caches and refresh state once, preserving products, saved watchlist, recents and FX history.
- Added 10 regression tests with sanitized catalog fixtures across four markets. All 56 unit/service tests, lint, TypeScript and production build passed.
- Extended live smoke check: Forza Horizon 5, existing Forza DLC, 800 V-Bucks, Mainframe Break Pack, GTA VI Ultimate Edition, DIRT 5, GTA Criminal Enterprise Starter Pack. Seven products passed live lookup, FX and warm-cache checks.
- Browser verification: V-Bucks comparison has US/IN/JP prices and no public TR offer; Mainframe has four comparable prices. Official US and generated JP V-Bucks pages render the correct product. TR search fallback renders actual search results. Not every catalog product/store page has been checked.
- New schema guidance: https://learn.microsoft.com/en-us/windows/uwp/monetize/data-schemas-for-store-products

## Search and home-page improvements — 2026-10-03

- Separate Games and DLCs/add-ons modes with server-side filtering. Catalog addOnParent relationships also identify add-on bundles.
- Search normalizes punctuation/case/accents, expands common aliases (GTA, COD, FH5, FH4, V-Bucks), corrects unambiguous single-character spelling errors using known titles, and ranks partial/reordered title matches. Up to three catalog queries are merged with locally known titles and deduplicated. The upstream result window remains limited; this is not exhaustive store search.
- Visible search results load local prices for all four regions and the cheapest comparable country automatically. Two concurrent product previews, viewport-based loading, short client caching, and shared server requests limit catalog traffic. Expired caches are refreshed without consuming manual refresh cooldowns.
- Product winner banner now links directly to the cheapest regional store, including separate links on tied winners.
- Home shows the top six percentage price gaps among seven curated, recognized games: Forza Horizon 5, DIRT 5, GTA V, Minecraft, Elden Ring, Red Dead Redemption 2 and Hogwarts Legacy. It compares the highest and lowest eligible regional USD prices. This is an editorial selection, not a download-count leaderboard or a market-wide ranking. Stale prices, failed refreshes, mismatched entitlements and fewer than two eligible countries are excluded.
- Validation: 63 tests passed; lint, TypeScript and production build passed. Browser checked live home ranking (7/7 games checked, six displayed), DLC typo search `fortnit`, Games abbreviation `GTA`, populated country price previews, top winner link, and 390px search/product layouts without horizontal overflow.
- Existing browser automation suite was not rerun for this change; the flows above were checked with the interactive browser tool.

## Vercel compatibility repair — 2026-10-03

- Reproduced HTTP 500 / INTERNAL_ERROR at the production health endpoint before the repair. The original default opened a writable local SQLite file in the deployment directory, incompatible with Vercel's read-only filesystem.
- Added automatic Vercel detection: use in-memory SQLite for disposable provider caches even if DATABASE_PATH is configured to a local directory. Include migration SQL in every API function trace; verified all generated API traces contain it.
- Persist watchlist and recents in browser localStorage in Vercel mode. Preserve the existing local SQLite behavior outside Vercel. Browser saved data is device/domain-specific and not automatically migrated from the desktop database.
- Accept trusted production/preview deployment origins (or explicitly configured APP_ORIGIN) for refresh actions. Continue rejecting mismatched Origin/Host and arbitrary origins. Set upstream-facing API duration to 60 seconds and log unexpected server error details server-side.
- Validation: 70 tests passed; lint and production build/TypeScript passed. Live local Vercel-mode health, GTA search and V-Bucks regional prices verified. Browser save, refresh, watchlist and retained save after full server restart verified. No temporary database was used for personal state.
