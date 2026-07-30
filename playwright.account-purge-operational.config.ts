import 'dotenv/config'
import { defineConfig } from '@playwright/test'

const databaseTestUrl = process.env.DATABASE_TEST_URL
const accountPurgeEnabled = process.env.ACCOUNT_PURGE_ENABLED

if (
  databaseTestUrl === undefined ||
  databaseTestUrl.trim() === '' ||
  accountPurgeEnabled !== 'true'
) {
  throw new Error(
    'DATABASE_TEST_URL and ACCOUNT_PURGE_ENABLED=true are required for account-purge operations',
  )
}

let parsedDatabaseUrl: URL
try {
  parsedDatabaseUrl = new URL(databaseTestUrl)
} catch {
  throw new Error('Account-purge operations require exact zedarchive_test')
}
if (
  !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
  parsedDatabaseUrl.pathname.slice(1) !== 'zedarchive_test'
) {
  throw new Error('Account-purge operations require exact zedarchive_test')
}

const port = 3106
const baseURL = `http://127.0.0.1:${port}`
const operationalSecret = 'm42-account-purge-operational-disposable-secret'

export default defineConfig({
  testDir: './tests/browser-operational/account-purge',
  testMatch: ['account-purge-operational.spec.ts'],
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results-account-purge-operational',
  reporter: [
    ['./tests/browser-operational/account-purge/operational-reporter.ts'],
  ],
  retries: 0,
  workers: 1,
  use: {
    acceptDownloads: false,
    screenshot: 'off',
    storageState: undefined,
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: `npm run db:migrate && npm run build && node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      ACCOUNT_PURGE_ENABLED: accountPurgeEnabled,
      ACCOUNT_PURGE_OPERATIONAL_SECRET: operationalSecret,
      BETTER_AUTH_URL: baseURL,
      CRON_SECRET: operationalSecret,
      DATABASE_MIGRATION_URL: databaseTestUrl,
      DATABASE_TEST_URL: databaseTestUrl,
      DATABASE_URL: databaseTestUrl,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/sign-in`,
  },
})
