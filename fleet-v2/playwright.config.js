import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187",
    browserName: "chromium",
    launchOptions: {
      executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    },
  },
  outputDir: "./artifacts/playwright-results",
  webServer: {
    command: "npm run dev -- --port 5187",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
