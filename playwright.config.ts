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
  // The real-corpus M36 browser evidence has an exact rehearsal-database
  // baseline. It must be selected through its dedicated runner, never the
  // ordinary browser suite's development/test-database environments.
  testIgnore: [
    '**/release-anime-catalogue.spec.ts',
    // M42 reallocates these lifecycle journeys to the five-test
    // release-critical runner after old/new overlap verification.
    '**/account-deletion.spec.ts',
    '**/anime-entry-removal.spec.ts',
    '**/archive-backup.spec.ts',
    // M34 purge evidence is production HTTP rather than an interactive
    // browser journey and now has a dedicated operational runner.
    '**/account-purge.spec.ts',
  ],
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  reporter: process.env.CI ? 'github' : 'list',
  retries: 0,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    // Production receives this only from Vercel. The local runner supplies the
    // same canonical test address so Better Auth exercises its approved bucket.
    extraHTTPHeaders: {
      'x-vercel-forwarded-for': '127.0.0.1',
    },
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: `corepack npm run build && corepack npm run start -- --port ${port}`,
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
