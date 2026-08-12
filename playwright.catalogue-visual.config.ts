import { defineConfig, devices } from '@playwright/test'

const port = 3102
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/browser-specialized/catalogue',
  testMatch: 'public-catalogue-visual.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright-catalogue-visual',
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
    command: `corepack npm run build && corepack npm run start -- --port ${port}`,
    env: {
      ...process.env,
      ACCOUNT_PURGE_ENABLED: 'false',
      BETTER_AUTH_URL: baseURL,
    },
    url: `${baseURL}/zedarchivelogo.png`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
