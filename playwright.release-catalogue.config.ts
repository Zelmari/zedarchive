import { defineConfig, devices } from '@playwright/test'

const port = 3100
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'release-anime-catalogue.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright-release-catalogue',
  reporter: process.env.CI ? 'github' : 'list',
  retries: 0,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    env: {
      ...process.env,
      ACCOUNT_PURGE_ENABLED: 'false',
      BETTER_AUTH_URL: baseURL,
    },
    url: `${baseURL}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
