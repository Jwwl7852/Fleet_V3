import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: process.env.VEYRO_INTEGRATION_BASE_URL || 'http://127.0.0.1:5197',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
