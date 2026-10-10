import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Repository } from "../src/lib/db/repository";
import type { Product } from "../src/lib/contracts";

const testProduct: Product = {
  id: "9NKX70BBCDRN",
  title: "Forza Horizon 5",
  type: "game",
  publisher: "Xbox Game Studios",
  cover: "https://example.com/cover.jpg",
  platforms: ["Windows.Xbox"],
  metadataFetchedAt: "2026-10-10T12:00:00Z",
  sourceMarket: "US",
};

describe("Price history and all-time low tracking in Repository", () => {
  let db: Repository;

  beforeEach(() => {
    db = new Repository(":memory:");
    db.saveProduct(testProduct);
  });

  afterEach(() => {
    db.close();
  });

  it("records price history entries and computes all-time lows", () => {
    // Record first check
    db.recordPriceHistory(
      testProduct.id,
      "TR",
      "599.00",
      "TRY",
      "19.99",
      "2026-10-01T10:00:00Z",
    );

    // Record second check (lower price on sale)
    db.recordPriceHistory(
      testProduct.id,
      "TR",
      "299.00",
      "TRY",
      "9.99",
      "2026-10-05T10:00:00Z",
    );

    // Record US check
    db.recordPriceHistory(
      testProduct.id,
      "US",
      "59.99",
      "USD",
      "59.99",
      "2026-10-01T10:00:00Z",
    );

    const history = db.priceHistory(testProduct.id);
    expect(history.length).toBe(3);

    const atls = db.allTimeLows(testProduct.id);
    expect(atls.TR?.amount).toBe("299.00");
    expect(atls.TR?.usd).toBe("9.99");
    expect(atls.US?.amount).toBe("59.99");
  });

  it("deduplicates identical prices recorded on the same day", () => {
    db.recordPriceHistory(
      testProduct.id,
      "IN",
      "2499.00",
      "INR",
      "29.99",
      "2026-10-10T10:00:00Z",
    );

    // Repeat check on the same day with same price
    db.recordPriceHistory(
      testProduct.id,
      "IN",
      "2499.00",
      "INR",
      "29.99",
      "2026-10-10T14:00:00Z",
    );

    const history = db.priceHistory(testProduct.id);
    expect(history.length).toBe(1);
  });
});
