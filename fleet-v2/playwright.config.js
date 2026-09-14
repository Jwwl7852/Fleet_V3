import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.FLEET_E2E_BASE_URL || "http://127.0.0.1:5287",
    browserName: "chromium",
    launchOptions: {
      executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    },
  },
  outputDir: "./artifacts/playwright-results",
  webServer: process.env.FLEET_E2E_BASE_URL ? undefined : {
    command: "npm run dev -- --port 5287 --strictPort",
    url: "http://127.0.0.1:5287",
    env: {
      ...process.env,
      VITE_FLEET_V2_DATABASE_NAME: "veyro-fleet-v2-integration-tests-v1",
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
