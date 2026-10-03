# Provider validation — 2026-10-03

Executed from this Windows workspace. Network access required sandbox approval; requests succeeded with approved access. Machine-readable results are in `probe-results.json`; the first probe was at 15:08Z and the sanitized repeat is timestamped in that file. Production API smoke checks are recorded separately in `live-smoke-results.json`.

## Capabilities

| Capability | Result | Evidence / limitations |
|---|---|---|
| Microsoft DisplayCatalog product lookup | Verified for tested products | HTTP 200 in US, TR, IN, JP with expected identities and currencies |
| Microsoft title search | Verified first page | `forza`, `forza hot wheels`, and a no-match query; full product metadata returned |
| DLC search and lookup | Verified | Durable product 9PNSZ7GMWCQZ returned as Forza Horizon 5: Hot Wheels |
| Multiple offer selection | Verified fixture behavior | Standard Edition contains public, membership/remediation, and license-only zero-amount availabilities |
| Pagination | Unsupported in this implementation | `HasMorePages` observed; cursor/request semantics not validated |
| Frankfurter v2 rates/currencies | Verified | USD-base array includes TRY, INR, JPY, each with effective date |
| ExchangeRate-API fallback | Implemented, live verification blocked | No API key configured; uses official v6 Standard request schema |
| Regional store links | Verified with transient limitation | Correct identity/localized HTML, no locale redirects; TR once returned HTTP 500, subsequent repeat returned 200 |

## Requests

```text
GET https://displaycatalog.mp.microsoft.com/v7.0/products
  ?bigIds=9NKX70BBCDRN&market=US&languages=en-US&fieldsTemplate=Details
GET https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/Games/products
  ?query=forza&market=US&languages=en-US&fieldsTemplate=Details
  &platformdependencyname=windows.xbox
GET https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,INR,JPY
GET https://api.frankfurter.dev/v2/currencies
GET https://www.xbox.com/en-US/games/store/game/9NKX70BBCDRN
```

Repeated lookup for `9PNSZ7GMWCQZ`, and market/language pairs US/en-US, TR/tr-TR, IN/en-IN, JP/ja-JP. The same four locales were exercised for listing routes. The alternate `/v7.0/productFamilies/games` path returns family/filter metadata rather than products and is not used.

## Observed interpretation

`Products[].DisplaySkuAvailabilities[].Availabilities[].OrderManagementData.Price` contains `CurrencyCode`, `ListPrice`, and `MSRP`. The observed ordinary public availability has Purchase in Actions, matching Markets, an active StartDate/EndDate, Windows.Xbox in AllowedPlatforms, and no remediation requirement or extra eligibility predicate. Membership offers can also contain Purchase and zero prices, but have remediation requirements; license-only entries have no Purchase action. The implementation excludes both from public price comparison.

Example reduced public offer recorded during this run (historic diagnostic data, not a promise of current price):

```json
{
  "ProductId": "9NKX70BBCDRN",
  "SkuId": "0010",
  "AvailabilityId": "B2BMMHL30X4B",
  "Actions": ["Details", "Purchase", "Browse", "Curate", "Redeem"],
  "Markets": ["US"],
  "Price": {"CurrencyCode": "USD", "ListPrice": 23.99, "MSRP": 59.99}
}
```

The same selected edition carries bundled content ID `9NNX1VVR3KNQ` across all four markets. Hot Wheels carries the same fulfillment package family and Xbox/Desktop platform combination across markets. These observed content identities form the comparable entitlement key; matching numeric SKU IDs alone is insufficient.

The parser inspects all current availabilities, ignoring historical-best availability lists. It ranks the lowest ordinary public amount only within an identical entitlement. Unknown constraints or unprovable entitlement mapping result in conservative exclusion. MSRP is labeled as a reference rather than claimed as a guaranteed regular public checkout price.

Frankfurter returns an array such as `{ "date": "2026-10-03", "base": "USD", "quote": "INR", "rate": 96.15 }`. The stored normalized rate is `1 / rate`, represented as a decimal string. Dates and fetch timestamps remain separate. USD uses rate 1 without an FX request.

## Reproduction and fixture hygiene

Run `npm run probe`. Sanitized fixtures retain identifiers, product display metadata, eligibility constraints, purchase dates, prices, and entitlement evidence. Package downloads, wholesale pricing, publisher addresses, and unrelated metadata are removed. Public cover URLs remain. No account information, cookies, credentials, or Microsoft login was used.

Run `npm run smoke:live` against a running live-mode app. It validates identity, currencies, reasonable values, dated FX, and warm-cache reuse without comparing prices to static fixtures. Browser tests use explicitly labeled fixture mode and are not evidence that live prices remain unchanged.

## Primary references

- https://www.xbox.com/en-US/games/store/game/9NKX70BBCDRN
- https://www.xbox.com/en-US/games/store/forza-horizon-5-hot-wheels/9PNSZ7GMWCQZ
- https://frankfurter.dev/
- https://www.exchangerate-api.com/docs/standard-requests

Microsoft's public catalog behavior was established through direct probes. No supported/guaranteed API contract or account-level purchasing eligibility is claimed.