import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const locales = { US: "en-US", TR: "tr-TR", IN: "en-IN", JP: "ja-JP" };
const ids = ["9NKX70BBCDRN", "9PNSZ7GMWCQZ"];
const results = [];
function sanitizeProduct(p) {
  return {
    ProductId: p.ProductId,
    ProductType: p.ProductType,
    ProductKind: p.ProductKind,
    LocalizedProperties: p.LocalizedProperties.map((l) => ({
      ProductTitle: l.ProductTitle,
      PublisherName: l.PublisherName,
      Images: l.Images.filter((i) =>
        ["Poster", "BoxArt"].includes(i.ImagePurpose),
      )
        .slice(0, 2)
        .map((i) => ({ Uri: i.Uri, ImagePurpose: i.ImagePurpose })),
    })),
    MarketProperties: p.MarketProperties.map((m) => ({ Markets: m.Markets })),
    Properties: {
      IsDemo: p.Properties.IsDemo,
      XboxConsoleGenCompatible: p.Properties.XboxConsoleGenCompatible,
    },
    DisplaySkuAvailabilities: p.DisplaySkuAvailabilities.map(
      ({ Sku: s, Availabilities: offers }) => ({
        Sku: {
          ProductId: s.ProductId,
          SkuId: s.SkuId,
          SkuType: s.SkuType,
          RecurrencePolicy: s.RecurrencePolicy,
          SubscriptionPolicyId: s.SubscriptionPolicyId,
          Properties: {
            IsTrial: s.Properties.IsTrial,
            IsPreOrder: s.Properties.IsPreOrder,
            IsBundle: s.Properties.IsBundle,
            IsRepurchasable: s.Properties.IsRepurchasable,
            BundledSkus:
              s.Properties.BundledSkus?.map((b) => ({ BigId: b.BigId })) ??
              null,
            FulfillmentData: s.Properties.FulfillmentData
              ? {
                  ProductId: s.Properties.FulfillmentData.ProductId,
                  PackageFamilyName:
                    s.Properties.FulfillmentData.PackageFamilyName,
                  WuCategoryId: s.Properties.FulfillmentData.WuCategoryId,
                }
              : null,
          },
        },
        Availabilities: offers.map((a) => ({
          AvailabilityId: a.AvailabilityId,
          SkuId: a.SkuId,
          Actions: a.Actions,
          Markets: a.Markets,
          Conditions: a.Conditions,
          RemediationRequired: a.RemediationRequired,
          Remediations: a.Remediations,
          Properties: a.Properties,
          OrderManagementData: {
            GrantedEntitlementKeys:
              a.OrderManagementData?.GrantedEntitlementKeys,
            PIFilter: a.OrderManagementData?.PIFilter,
            Price: a.OrderManagementData?.Price
              ? {
                  CurrencyCode: a.OrderManagementData.Price.CurrencyCode,
                  ListPrice: a.OrderManagementData.Price.ListPrice,
                  MSRP: a.OrderManagementData.Price.MSRP,
                }
              : undefined,
          },
        })),
      }),
    ),
  };
}
async function probe(name, url, save = false) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {}
    const entry = {
      name,
      url,
      status: r.status,
      finalUrl: r.url,
      shape: data ? Object.keys(data) : "html",
      productIds: data?.Products?.map((p) => p.ProductId),
      count: data?.Products?.length,
      hasMorePages: data?.HasMorePages,
      htmlProductIdentity: !data
        ? text.toUpperCase().includes("9NKX70BBCDRN")
        : undefined,
      htmlLanguage: !data
        ? text.match(/<html[^>]*lang="([^"]+)"/)?.[1]
        : undefined,
    };
    results.push(entry);
    console.log(JSON.stringify(entry));
    if (r.ok && save && data) {
      const sanitized = data.Products
        ? {
            Products: data.Products.map(sanitizeProduct),
            ProductIds: data.ProductIds,
            HasMorePages: data.HasMorePages,
          }
        : data;
      await writeFile(
        `tests/fixtures/${name}.json`,
        JSON.stringify(sanitized, null, 2),
      );
    }
    return data;
  } catch (e) {
    results.push({ name, url, error: e.message });
    console.log(name, e.message);
  }
}
await mkdir("tests/fixtures", { recursive: true });
await mkdir("docs", { recursive: true });
for (const id of ids)
  for (const [market, language] of Object.entries(locales))
    await probe(
      `${id}-${market}`,
      `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${id}&market=${market}&languages=${language}&fieldsTemplate=Details`,
      true,
    );
for (const [name, query] of [
  ["search", "forza"],
  ["search-dlc", "forza hot wheels"],
  ["search-empty", "zzqqnonexistent9876"],
])
  await probe(
    name,
    `https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/Games/products?query=${encodeURIComponent(query)}&market=US&languages=en-US&fieldsTemplate=Details&platformdependencyname=windows.xbox`,
    true,
  );
await probe(
  "fx",
  "https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,INR,JPY",
  true,
);
await probe("currencies", "https://api.frankfurter.dev/v2/currencies");
for (const [market, locale] of Object.entries(locales))
  await probe(
    `link-${market}`,
    `https://www.xbox.com/${locale}/games/store/game/9NKX70BBCDRN`,
  );
await writeFile(
  "docs/probe-results.json",
  JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2),
);
