import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    browserName: 'chromium',
    channel: process.env.E2E_CHANNEL || undefined,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: !process.env.CI,
  },
})
