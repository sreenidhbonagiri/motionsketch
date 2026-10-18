import { defineConfig, devices } from '@playwright/test'

/**
 * Browser coverage: Chromium, Firefox, and Playwright WebKit.
 * WebKit here is useful engine coverage — not a claim of every Safari/iOS version.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Keep failures visible — do not retry to paper over flakes (CI also passes --retries=0).
  retries: 0,
  // One worker in CI: Linux WebKit under two parallel browsers routinely
  // stretches long scenarios past the default 30s test budget.
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // With retries disabled, on-first-retry never captures; keep traces for failed tests.
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    // When CI is set, always start a fresh server (never attach to an unrelated process).
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
})
