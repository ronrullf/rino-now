import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import type { Product, Snapshot, Rate, SearchPage } from "../contracts";
export const products = sqliteTable(
  "products",
  {
    id: text("product_id").primaryKey(),
    title: text("title").notNull(),
    data: text("data", { mode: "json" }).$type<Product>().notNull(),
  },
  (t) => [index("products_title_idx").on(t.title)],
);
export const snapshots = sqliteTable(
  "regional_snapshots",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    market: text("market").notNull(),
    data: text("data", { mode: "json" }).$type<Snapshot>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.market] })],
);
export const refreshState = sqliteTable(
  "regional_refresh_state",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    market: text("market").notNull(),
    lastAttemptAt: text("last_attempt_at").notNull(),
    error: text("last_error_code"),
  },
  (t) => [primaryKey({ columns: [t.productId, t.market] })],
);
export const fx = sqliteTable(
  "fx_snapshots",
  {
    provider: text("provider").notNull(),
    currency: text("quote_currency").notNull(),
    effectiveDate: text("effective_date").notNull(),
    data: text("data", { mode: "json" }).$type<Rate>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.currency, t.effectiveDate] })],
);
export const searchCache = sqliteTable(
  "search_cache",
  {
    key: text("cache_key").primaryKey(),
    data: text("data", { mode: "json" }).$type<SearchPage>().notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("search_expiry_idx").on(t.expiresAt)],
);
export const watchlist = sqliteTable("watchlist", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id),
  addedAt: text("added_at").notNull(),
});
export const recents = sqliteTable("recent_products", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id),
  viewedAt: text("viewed_at").notNull(),
});
export const refreshCooldown = sqliteTable("refresh_cooldowns", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id),
  attemptAt: integer("attempt_at").notNull(),
});
export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    market: text("market").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency").notNull(),
    usd: text("usd"),
    recordedAt: text("recorded_at").notNull(),
  },
  (t) => [
    index("price_history_product_idx").on(t.productId, t.market),
    index("price_history_recorded_idx").on(t.recordedAt),
  ],
);
