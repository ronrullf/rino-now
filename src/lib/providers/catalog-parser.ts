import { z } from "zod";
import { Decimal } from "decimal.js";
import {
  productSchema,
  snapshotSchema,
  type Product,
  type Snapshot,
} from "../contracts";
import { regions, type Market } from "../regions";
import { AppError } from "../errors";
const obj = z.record(z.string(), z.unknown());
const platform = z.object({ PlatformName: z.string() });
const price = z.object({
  CurrencyCode: z.string(),
  ListPrice: z.number().finite().nonnegative(),
  MSRP: z.number().finite().nonnegative().optional(),
});
const availability = z
  .object({
    AvailabilityId: z.string(),
    SkuId: z.string(),
    Actions: z.array(z.string()),
    Markets: z.array(z.string()),
    Conditions: z
      .object({
        StartDate: z.string(),
        EndDate: z.string(),
        ClientConditions: z
          .object({ AllowedPlatforms: z.array(platform) })
          .passthrough(),
      })
      .passthrough(),
    OrderManagementData: z
      .object({
        Price: price,
        PIFilter: obj.optional(),
        GrantedEntitlementKeys: z.array(z.string()).optional(),
      })
      .passthrough(),
    RemediationRequired: z.boolean().optional(),
    Remediations: z.array(z.unknown()).optional(),
    Properties: obj.optional(),
  })
  .passthrough();
const sku = z.object({
  ProductId: z.string(),
  SkuId: z.string(),
  SkuType: z.string(),
  RecurrencePolicy: z.unknown().optional(),
  SubscriptionPolicyId: z.unknown().optional(),
  Properties: z
    .object({
      IsTrial: z.boolean().optional(),
      IsPreOrder: z.boolean().optional(),
      IsBundle: z.boolean().optional(),
      IsRepurchasable: z.boolean().optional(),
      ConsumableQuantity: z.number().int().positive().optional(),
      BundledSkus: z.array(z.object({ BigId: z.string() })).nullish(),
      FulfillmentData: z
        .object({
          ProductId: z.string().optional(),
          PackageFamilyName: z.string().nullish(),
          WuCategoryId: z.string().nullish(),
        })
        .nullish(),
    })
    .passthrough(),
});
export const rawProduct = z.object({
  ProductId: z.string(),
  ProductType: z.string(),
  ProductKind: z.string().optional(),
  LocalizedProperties: z
    .array(
      z.object({
        ProductTitle: z.string(),
        PublisherName: z.string().optional(),
        Images: z
          .array(z.object({ Uri: z.string(), ImagePurpose: z.string() }))
          .optional(),
      }),
    )
    .min(1),
  MarketProperties: z
    .array(
      z.object({
        Markets: z.array(z.string()),
        RelatedProducts: z
          .array(
            z.object({
              RelatedProductId: z.string(),
              RelationshipType: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  Properties: z
    .object({
      IsDemo: z.boolean().optional(),
      XboxConsoleGenCompatible: z.array(z.string()).nullish(),
    })
    .passthrough(),
  DisplaySkuAvailabilities: z.array(
    z.object({ Sku: sku, Availabilities: z.array(availability) }),
  ),
});
export const catalogResponse = z.object({ Products: z.array(rawProduct) });
type RawProduct = z.infer<typeof rawProduct>;
export function metadata(p: RawProduct, market: Market, at: string): Product {
  const lp = p.LocalizedProperties[0];
  const image =
    lp.Images?.find((i) => i.ImagePurpose === "Poster") ??
    lp.Images?.find((i) => i.ImagePurpose === "BoxArt");
  let cover: string | null = null;
  if (image) {
    try {
      const u = new URL(
        image.Uri.startsWith("//") ? `https:${image.Uri}` : image.Uri,
      );
      if (
        u.protocol === "https:" &&
        (u.hostname === "store-images.s-microsoft.com" ||
          u.hostname.endsWith(".xboxlive.com"))
      )
        cover = u.toString();
    } catch {}
  }
  const platforms = [
    ...new Set(
      p.DisplaySkuAvailabilities.flatMap((s) =>
        s.Availabilities.flatMap((a) =>
          a.Conditions.ClientConditions.AllowedPlatforms.map(
            (v) => v.PlatformName,
          ),
        ),
      ),
    ),
  ];
  const bundled = p.DisplaySkuAvailabilities.some(
    (s) => s.Sku.Properties.IsBundle,
  );
  return productSchema.parse({
    id: p.ProductId,
    title: lp.ProductTitle,
    type:
      ["Durable", "Consumable"].includes(p.ProductType) ||
      p.MarketProperties?.some((m) =>
        m.RelatedProducts?.some((r) => r.RelationshipType === "addOnParent"),
      )
        ? "dlc"
        : bundled
          ? "bundle"
          : p.ProductType === "Game"
            ? "game"
            : "unknown",
    publisher: lp.PublisherName ?? null,
    cover,
    platforms,
    metadataFetchedAt: at,
    sourceMarket: market,
  });
}
export function emptySnapshot(id: string, market: Market): Snapshot {
  return {
    productId: id,
    market,
    currency: regions[market].currency,
    observedCurrency: null,
    status: "unknown",
    reason: "NOT_FETCHED",
    currentAmount: null,
    regularAmount: null,
    skuId: null,
    availabilityId: null,
    entitlementKey: null,
    purchaseKind: null,
    eligibility: "unknown",
    platforms: [],
    regionalTitle: null,
    saleEndAt: null,
    offerEndAt: null,
    storeUrl: `https://www.xbox.com/${regions[market].locale}/games/store/p/${id}`,
    fetchedAt: null,
    expiresAt: null,
  };
}
export function parseCatalog(
  raw: unknown,
  id: string,
  market: Market,
  at: string,
  ttl = 3600,
): { product: Product | null; snapshot: Snapshot } {
  const parsed = catalogResponse.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      "CATALOG_SHAPE",
      "The catalog returned an unsupported response.",
      502,
    );
  const base = emptySnapshot(id, market);
  base.fetchedAt = at;
  base.expiresAt = new Date(Date.parse(at) + ttl * 1000).toISOString();
  if (!parsed.data.Products.length)
    return {
      product: null,
      snapshot: {
        ...base,
        status: "unavailable",
        reason: "LISTING_ABSENT",
        expiresAt: new Date(Date.parse(at) + 900000).toISOString(),
      },
    };
  const p = parsed.data.Products.find((p) => p.ProductId === id);
  if (!p)
    throw new AppError(
      "IDENTITY_MISMATCH",
      "The catalog returned a different product.",
      502,
    );
  if (
    p.MarketProperties?.length &&
    !p.MarketProperties.some((m) => m.Markets.includes(market))
  )
    throw new AppError(
      "MARKET_MISMATCH",
      "The catalog returned a different market.",
      502,
    );
  const product = metadata(p, market, at);
  base.regionalTitle = product.title;
  const slug =
    product.title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "p";
  base.storeUrl =
    "https://www.xbox.com/" +
    regions[market].locale +
    "/games/store/" +
    slug +
    "/" +
    id.toLowerCase();
  const parents = [
    ...new Set(
      p.MarketProperties?.filter((m) => m.Markets.includes(market))
        .flatMap((m) => m.RelatedProducts ?? [])
        .filter((r) => r.RelationshipType === "addOnParent")
        .map((r) => r.RelatedProductId) ?? [],
    ),
  ].sort();
  const fullSkus = p.DisplaySkuAvailabilities.filter(
    (e) =>
      e.Sku.SkuType === "full" &&
      !e.Sku.Properties.IsTrial &&
      !e.Sku.RecurrencePolicy &&
      !e.Sku.SubscriptionPolicyId,
  );
  const paymentRules = new Set([
    "preordercontent",
    "credit_card",
    "ewallet:token",
    "Token",
    "ewallet:stored_value",
    "ewallet:paypal",
    "xboxonlycontent",
    "legacy:Tokens",
    "legacy:CurrencyStoredValue",
    "legacy:CreditCard",
    "legacy:CurrencyStoredValueWithCreditCardTopOff",
    "legacy:PayPal",
  ]);
  const candidates: Snapshot[] = [];
  let conditional = false,
    uncertain = false;
  const now = Date.parse(at);
  for (const entry of p.DisplaySkuAvailabilities) {
    const s = entry.Sku;
    if (s.ProductId !== id)
      throw new AppError(
        "IDENTITY_MISMATCH",
        "The catalog returned a different SKU product.",
        502,
      );
    if (
      s.SkuType !== "full" ||
      s.Properties.IsTrial ||
      s.RecurrencePolicy ||
      s.SubscriptionPolicyId ||
      p.Properties.IsDemo
    )
      continue;
    for (const a of entry.Availabilities) {
      if (!a.Actions.includes("Purchase") || !a.Markets.includes(market))
        continue;
      if (a.SkuId !== s.SkuId) {
        uncertain = true;
        continue;
      }
      const start = Date.parse(a.Conditions.StartDate),
        end = Date.parse(a.Conditions.EndDate);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        uncertain = true;
        continue;
      }
      if (start > now || end <= now) continue;
      const cond = a.Conditions;
      const unexpectedConditions = Object.keys(cond).filter(
        (k) =>
          ![
            "StartDate",
            "EndDate",
            "ClientConditions",
            "ResourceSetIds",
          ].includes(k),
      );
      const filter = a.OrderManagementData.PIFilter;
      if (
        a.RemediationRequired ||
        a.Remediations?.length ||
        unexpectedConditions.length ||
        Object.keys(cond.ClientConditions).some(
          (k) => k !== "AllowedPlatforms",
        ) ||
        (filter &&
          Object.entries(filter).some(
            ([key, value]) =>
              !["InclusionProperties", "ExclusionProperties"].includes(key) ||
              !Array.isArray(value) ||
              value.some((v) => typeof v !== "string" || !paymentRules.has(v)),
          ))
      ) {
        conditional = true;
        continue;
      }
      const platforms = [
        ...new Set(
          cond.ClientConditions.AllowedPlatforms.map((p) => p.PlatformName),
        ),
      ].sort();
      if (!platforms.includes("Windows.Xbox")) {
        uncertain = true;
        continue;
      }
      const amount = a.OrderManagementData.Price;
      if (amount.CurrencyCode !== base.currency)
        throw new AppError(
          "CURRENCY_MISMATCH",
          "The catalog returned an unexpected currency.",
          502,
        );
      const props = s.Properties;
      const bundles = props.BundledSkus?.map((b) => b.BigId).sort();
      const fulfillment = props.FulfillmentData;
      // In-game add-ons may have no downloadable package. Only accept a single
      // full SKU with an explicit parent; consumables also require token + quantity.
      const token = p.Properties.InAppOfferToken;
      const addonIdentity =
        fullSkus.length === 1 &&
        parents.length > 0 &&
        typeof p.Properties.PublisherId === "string" &&
        (p.ProductType === "Durable" ||
          (p.ProductType === "Consumable" &&
            typeof token === "string" &&
            token.length > 0 &&
            props.ConsumableQuantity))
          ? JSON.stringify([
              "addon",
              p.ProductType,
              id,
              p.Properties.PublisherId,
              parents,
              token ?? null,
              props.ConsumableQuantity ?? null,
              !!props.IsRepurchasable,
            ])
          : null;
      const identity = bundles?.length
        ? `bundle:${bundles.join(",")}`
        : fulfillment?.ProductId === id &&
            (fulfillment.PackageFamilyName || fulfillment.WuCategoryId)
          ? `fulfillment:${fulfillment.PackageFamilyName ?? fulfillment.WuCategoryId}`
          : addonIdentity;
      if (
        !identity ||
        (s.Properties.IsRepurchasable && p.ProductType !== "Consumable")
      ) {
        uncertain = true;
        continue;
      }
      const current = new Decimal(amount.ListPrice);
      const regular =
        amount.MSRP !== undefined &&
        new Decimal(amount.MSRP).greaterThan(current)
          ? String(amount.MSRP)
          : null;
      candidates.push({
        ...base,
        status: "available",
        reason: "PUBLIC_PURCHASE",
        observedCurrency: amount.CurrencyCode,
        currentAmount: current.toFixed(),
        regularAmount: regular,
        skuId: s.SkuId,
        availabilityId: a.AvailabilityId,
        entitlementKey: `${id}|${identity}|${platforms.join(",")}|full`,
        purchaseKind:
          p.ProductType === "Consumable" ? "consumable" : "ownership",
        eligibility: "public",
        platforms,
        saleEndAt: regular ? new Date(end).toISOString() : null,
        offerEndAt: new Date(end).toISOString(),
        expiresAt: new Date(
          Math.min(Date.parse(base.expiresAt!), end),
        ).toISOString(),
      });
    }
  }
  if (!candidates.length)
    return {
      product,
      snapshot: {
        ...base,
        status: uncertain
          ? "ambiguous"
          : conditional
            ? "conditional_only"
            : "unavailable",
        reason: uncertain
          ? "UNVERIFIED_ENTITLEMENT"
          : conditional
            ? "CONDITIONAL_OFFERS_ONLY"
            : "NO_PUBLIC_PURCHASE",
        expiresAt: new Date(now + 900000).toISOString(),
      },
    };
  if (new Set(candidates.map((c) => c.entitlementKey)).size !== 1)
    return {
      product,
      snapshot: {
        ...base,
        status: "ambiguous",
        reason: "MULTIPLE_ENTITLEMENTS",
      },
    };
  candidates.sort(
    (a, b) =>
      new Decimal(a.currentAmount!).cmp(b.currentAmount!) ||
      a.availabilityId!.localeCompare(b.availabilityId!),
  );
  return { product, snapshot: snapshotSchema.parse(candidates[0]) };
}
