import { describe, it, expect } from "vitest";
import { extractProductId, ingestApifyDataset, type ApifyRawItem } from "@/lib/services/apify-import";
import { repository } from "@/lib/db/client";

describe("Apify Actor Data Ingestion & Product Extraction", () => {
  it("extracts 12-char Product IDs from Shahid Irfan schema", () => {
    const item: ApifyRawItem = {
      product_id: "9NKX70BBCDRN",
      title: "Forza Horizon 5 Standard Edition",
      price: "$59.99",
      market: "US",
      url: "https://www.xbox.com/en-US/games/store/forza-horizon-5-standard-edition/9NKX70BBCDRN",
    };

    expect(extractProductId(item)).toBe("9NKX70BBCDRN");
  });

  it("extracts 12-char Product IDs from Fatih Tahta nested schema", () => {
    const item: ApifyRawItem = {
      id: 972249091,
      title: "Grand Theft Auto V",
      url: "https://www.xbox.com/en-US/games/store/grand-theft-auto-v/BPJ686W6S0NH/0001",
      data: {
        detail: {
          additional_information: {
            productId: "BPJ686W6S0NH",
          },
        },
      },
    };

    expect(extractProductId(item)).toBe("BPJ686W6S0NH");
  });

  it("extracts 12-char Product IDs from generic store URL when product_id is missing", () => {
    const item: ApifyRawItem = {
      title: "Minecraft",
      url: "https://www.xbox.com/tr-TR/games/store/p/9MVXMVT8ZKWC",
    };

    expect(extractProductId(item)).toBe("9MVXMVT8ZKWC");
  });

  it("safely ingests mock Apify items into SQLite products without errors", async () => {
    const mockItems: ApifyRawItem[] = [
      {
        product_id: "9P3J32CTXLRZ",
        title: "ELDEN RING",
        price: "$59.99",
        market: "US",
        image_url: "https://store-images.s-microsoft.com/image/apps.1234",
      },
      {
        product_id: "9N2ZDN7NWQKV",
        title: "Red Dead Redemption 2",
        price: "$59.99",
        market: "US",
        image_url: "https://store-images.s-microsoft.com/image/apps.5678",
      },
    ];

    const result = await ingestApifyDataset(mockItems, { batchFetchRegions: false });
    expect(result.totalReceived).toBe(2);
    expect(result.validProductIds).toBe(2);
    expect(result.newProductsAdded).toBe(2);

    const repo = repository();
    const elden = repo.product("9P3J32CTXLRZ");
    expect(elden).toBeDefined();
    expect(elden?.title).toBe("ELDEN RING");
  });
});
