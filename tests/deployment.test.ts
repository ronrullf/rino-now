import { afterEach, describe, it, expect, vi } from "vitest";
import { deploymentSettings } from "../src/lib/deployment";
import { Repository } from "../src/lib/db/repository";
import { config, deploymentOrigins } from "../src/lib/config";
import { checkOrigin } from "../src/lib/security/origin";
describe("Vercel deployment", () => {
  it("uses memory even when a local DATABASE_PATH was copied into Vercel", () => {
    const settings = deploymentSettings({
      VERCEL: "1",
      DATABASE_PATH: "./data/xbox-comparator.sqlite",
      VERCEL_URL: "preview.vercel.app",
    });
    expect(settings.databasePath).toBe(":memory:");
    expect(settings.appOrigin).toBe("https://preview.vercel.app");
    const repo = new Repository(settings.databasePath);
    expect(repo.health()).toEqual({ ready: 1 });
    repo.close();
  });
  it("preserves persistent SQLite locally", () => {
    expect(
      deploymentSettings({ DATABASE_PATH: "./data/test.sqlite" }).databasePath,
    ).toBe("./data/test.sqlite");
  });
  it("recognizes explicit custom origins and production/preview hosts", () => {
    const settings = deploymentSettings({
      VERCEL: "1",
      APP_ORIGIN: "https://games.example.com",
      VERCEL_URL: "preview.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "rino.vercel.app",
    });
    expect(settings.appOrigin).toBe("https://games.example.com");
    expect(settings.allowedOrigins).toEqual([
      "https://preview.vercel.app",
      "https://rino.vercel.app",
    ]);
  });
});
afterEach(() => vi.restoreAllMocks());
it("keeps cross-origin mutation protection", () => {
  const expected = new URL(config.APP_ORIGIN);
  expect(() =>
    checkOrigin(
      new Request(expected.origin + "/api/recent", {
        headers: { origin: expected.origin, host: expected.host },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    checkOrigin(
      new Request(expected.origin + "/api/recent", {
        headers: { origin: "https://evil.example", host: expected.host },
      }),
    ),
  ).toThrow();
  expect(() =>
    checkOrigin(
      new Request(expected.origin + "/api/recent", {
        headers: { origin: expected.origin, host: "evil.example" },
      }),
    ),
  ).toThrow();
  expect(Array.isArray(deploymentOrigins)).toBe(true);
});
