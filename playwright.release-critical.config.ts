import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'
import {
  releaseCriticalApplicationOrigin,
  releaseCriticalResendOrigin,
} from './tests/browser-release-critical/fixtures/release-critical-constants'

const databaseTestUrl = process.env.DATABASE_TEST_URL

if (databaseTestUrl === undefined || databaseTestUrl.trim().length === 0) {
  throw new Error(
    'DATABASE_TEST_URL is required for the release-critical browser runner',
  )
}

let configuredDatabaseName: string

try {
  const parsedDatabaseUrl = new URL(databaseTestUrl)
  configuredDatabaseName = parsedDatabaseUrl.pathname.slice(1)
} catch {
  throw new Error(
    'DATABASE_TEST_URL must be a valid URL for the release-critical browser runner',
  )
}

if (configuredDatabaseName !== 'zedarchive_test') {
  throw new Error(
    'The release-critical browser runner requires the zedarchive_test database',
  )
}

const baseURL = releaseCriticalApplicationOrigin
const port = new URL(baseURL).port

export default defineConfig({
  testDir: './tests/browser-release-critical',
  testMatch: ['public-catalogue-core.spec.ts', 'account-and-add-core.spec.ts'],
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results-release-critical',
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['./tests/browser-release-critical/fixtures/privacy-artifact-reporter.ts'],
  ],
  retries: 0,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    acceptDownloads: false,
    baseURL,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: `npm run db:migrate && npm run build && node --import ./tests/browser-release-critical/fixtures/hibp-fetch-redirect.mjs ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      ACCOUNT_PURGE_ENABLED: 'false',
      BETTER_AUTH_URL: baseURL,
      DATABASE_MIGRATION_URL: databaseTestUrl,
      DATABASE_TEST_URL: databaseTestUrl,
      DATABASE_URL: databaseTestUrl,
      RESEND_BASE_URL: releaseCriticalResendOrigin,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/sign-in`,
  },
})
