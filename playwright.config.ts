import { defineConfig, devices } from '@playwright/test'

const port = 3100
const baseURL = `http://127.0.0.1:${port}`
const browserUsesTestDatabase =
  process.env.CI === 'true' &&
  process.env.DATABASE_URL !== undefined &&
  process.env.DATABASE_URL === process.env.DATABASE_TEST_URL
const accountPurgeTestSecret = 'm34-browser-disposable-cron-secret-32chars'

export default defineConfig({
  testDir: './tests/browser',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  reporter: process.env.CI ? 'github' : 'list',
  retries: 0,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    env: {
      ...process.env,
      BETTER_AUTH_URL: baseURL,
      // Purging is never enabled for ordinary local browser runs. CI may opt
      // in only when the runtime target is exactly the dedicated test database.
      ...(browserUsesTestDatabase
        ? {
            ACCOUNT_PURGE_ENABLED: 'true',
            CRON_SECRET: accountPurgeTestSecret,
          }
        : {
            ACCOUNT_PURGE_ENABLED: 'false',
          }),
    },
    url: `${baseURL}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
