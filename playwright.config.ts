import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Keep failures visible — do not retry to paper over flakes (CI also passes --retries=0).
  retries: 0,
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
  ],
})
