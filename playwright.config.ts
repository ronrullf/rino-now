import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      DATA_MODE: "fixture",
      APP_ORIGIN: "http://127.0.0.1:3100",
      DATABASE_PATH: `./test-results/browser-${Date.now()}.sqlite`,
    },
  },
  reporter: [["list"]],
  outputDir: "test-results/browser-artifacts",
});
