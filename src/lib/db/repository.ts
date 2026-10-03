import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, like, sql } from "drizzle-orm";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as t from "./schema";
import {
  productSchema,
  snapshotSchema,
  rateSchema,
  type Product,
  type Snapshot,
  type FxSnapshot,
  type SearchPage,
} from "../contracts";
import { AppError } from "../errors";
export class Repository {
  readonly sqlite: Database.Database;
  readonly db;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.sqlite = new Database(path);
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("busy_timeout = 5000");
    const version = this.sqlite.pragma("user_version", { simple: true });
    if (version === 0)
      this.sqlite.transaction(() => {
        this.sqlite.exec(
          readFileSync(resolve("drizzle/0000_initial.sql"), "utf8"),
        );
        this.sqlite.pragma("user_version = 1");
      })();
    // Recompute cached prices produced by the old eligibility parser. Preserve
    // products, watchlist, recents and FX history.
    if (Number(version) < 2)
      this.sqlite.transaction(() => {
        this.sqlite.exec(
          "DELETE FROM regional_snapshots; DELETE FROM search_cache; DELETE FROM regional_refresh_state; DELETE FROM refresh_cooldowns;",
        );
        this.sqlite.pragma("user_version = 2");
      })();
    if (Number(version) > 2) throw Error("Database schema newer than this app");
    this.db = drizzle(this.sqlite);
  }
  close() {
    this.sqlite.close();
  }
  product(id: string) {
    const row = this.db
      .select()
      .from(t.products)
      .where(eq(t.products.id, id))
      .get();
    return row ? productSchema.parse(row.data) : null;
  }
  saveProduct(p: Product) {
    const existing = this.product(p.id);
    if (existing?.sourceMarket === "US" && p.sourceMarket !== "US") return;
    this.db
      .insert(t.products)
      .values({ id: p.id, title: p.title, data: p })
      .onConflictDoUpdate({
        target: t.products.id,
        set: { title: p.title, data: p },
      })
      .run();
  }
  snapshots(id: string) {
    return this.db
      .select()
      .from(t.snapshots)
      .where(eq(t.snapshots.productId, id))
      .all()
      .map((r) => snapshotSchema.parse(r.data));
  }
  saveSnapshot(s: Snapshot) {
    this.db
      .insert(t.snapshots)
      .values({ productId: s.productId, market: s.market, data: s })
      .onConflictDoUpdate({
        target: [t.snapshots.productId, t.snapshots.market],
        set: { data: s },
      })
      .run();
  }
  attempt(id: string, market: string, at: string, error: string | null) {
    this.db
      .insert(t.refreshState)
      .values({ productId: id, market, lastAttemptAt: at, error })
      .onConflictDoUpdate({
        target: [t.refreshState.productId, t.refreshState.market],
        set: { lastAttemptAt: at, error },
      })
      .run();
  }
  attempts(id: string) {
    return this.db
      .select()
      .from(t.refreshState)
      .where(eq(t.refreshState.productId, id))
      .all();
  }
  saveFx(rates: FxSnapshot) {
    for (const r of Object.values(rates))
      this.db
        .insert(t.fx)
        .values({
          provider: r.provider,
          currency: r.currency,
          effectiveDate: r.effectiveDate,
          data: r,
        })
        .onConflictDoUpdate({
          target: [t.fx.provider, t.fx.currency, t.fx.effectiveDate],
          set: { data: r },
        })
        .run();
  }
  rates(providers: string[]): FxSnapshot {
    const result: FxSnapshot = {};
    for (const r of this.db
      .select()
      .from(t.fx)
      .orderBy(desc(t.fx.effectiveDate))
      .all()) {
      const rate = rateSchema.parse(r.data);
      if (providers.includes(rate.provider) && !result[rate.currency])
        result[rate.currency] = rate;
    }
    return result;
  }
  cachedSearch(key: string, at: number) {
    const row = this.db
      .select()
      .from(t.searchCache)
      .where(eq(t.searchCache.key, key))
      .get();
    return row && row.expiresAt > at ? row.data : null;
  }
  saveSearch(key: string, data: SearchPage, expiresAt: number) {
    this.db
      .insert(t.searchCache)
      .values({ key, data, expiresAt })
      .onConflictDoUpdate({
        target: t.searchCache.key,
        set: { data, expiresAt },
      })
      .run();
    this.db
      .delete(t.searchCache)
      .where(sql`${t.searchCache.expiresAt} < ${Date.now() - 86400000}`)
      .run();
  }
  searchCandidates() {
    return this.db
      .select()
      .from(t.products)
      .limit(5000)
      .all()
      .map((r) => productSchema.parse(r.data));
  }
  localSearch(query: string) {
    return this.db
      .select()
      .from(t.products)
      .where(
        like(
          t.products.title,
          `%${query.replaceAll("%", "").replaceAll("_", "")}%`,
        ),
      )
      .limit(20)
      .all()
      .map((r) => r.data);
  }
  isSaved(id: string) {
    return !!this.db
      .select()
      .from(t.watchlist)
      .where(eq(t.watchlist.productId, id))
      .get();
  }
  saveWatch(id: string, at: string) {
    this.sqlite.transaction(() => {
      if (this.isSaved(id)) return;
      if (this.db.select().from(t.watchlist).all().length >= 200)
        throw new AppError(
          "WATCHLIST_FULL",
          "The watchlist is limited to 200 products.",
          400,
        );
      this.db.insert(t.watchlist).values({ productId: id, addedAt: at }).run();
    })();
  }
  removeWatch(id: string) {
    this.db.delete(t.watchlist).where(eq(t.watchlist.productId, id)).run();
  }
  watchlist() {
    return this.db
      .select({ data: t.products.data })
      .from(t.watchlist)
      .innerJoin(t.products, eq(t.products.id, t.watchlist.productId))
      .orderBy(desc(t.watchlist.addedAt))
      .all()
      .map((r) => r.data);
  }
  recent() {
    return this.db
      .select({ data: t.products.data })
      .from(t.recents)
      .innerJoin(t.products, eq(t.products.id, t.recents.productId))
      .orderBy(desc(t.recents.viewedAt))
      .all()
      .map((r) => r.data);
  }
  recordRecent(id: string, at: string) {
    this.sqlite.transaction(() => {
      this.db
        .insert(t.recents)
        .values({ productId: id, viewedAt: at })
        .onConflictDoUpdate({
          target: t.recents.productId,
          set: { viewedAt: at },
        })
        .run();
      this.sqlite
        .prepare(
          "DELETE FROM recent_products WHERE product_id NOT IN (SELECT product_id FROM recent_products ORDER BY viewed_at DESC LIMIT 50)",
        )
        .run();
    })();
  }
  claimRefresh(id: string, at: number, cooldown: number) {
    return this.sqlite.transaction(() => {
      const r = this.db
        .select()
        .from(t.refreshCooldown)
        .where(eq(t.refreshCooldown.productId, id))
        .get();
      if (r && at - r.attemptAt < cooldown) return false;
      this.db
        .insert(t.refreshCooldown)
        .values({ productId: id, attemptAt: at })
        .onConflictDoUpdate({
          target: t.refreshCooldown.productId,
          set: { attemptAt: at },
        })
        .run();
      return true;
    })();
  }
  nextRefresh(id: string, cooldown: number) {
    const r = this.db
      .select()
      .from(t.refreshCooldown)
      .where(eq(t.refreshCooldown.productId, id))
      .get();
    return r ? new Date(r.attemptAt + cooldown).toISOString() : null;
  }
  health() {
    return this.db.get(sql`SELECT 1 AS ready`);
  }
}
