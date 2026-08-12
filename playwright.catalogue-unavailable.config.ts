import { defineConfig, devices } from '@playwright/test'

const port = 3101
const baseURL = `http://127.0.0.1:${port}`
const unavailableDatabaseUrl =
  'postgresql://m38_unavailable:m38_unavailable@127.0.0.1:1/m38_unavailable?connect_timeout=1'
const portOnePreflight = [
  "import net from 'node:net'",
  "const socket = net.createConnection({ host: '127.0.0.1', port: 1 })",
  "socket.once('connect', () => { socket.destroy(); process.exit(1) })",
  "socket.once('error', (error) => { socket.destroy(); process.exit(error.code === 'ECONNREFUSED' ? 0 : 1) })",
  'socket.setTimeout(1_000, () => { socket.destroy(); process.exit(1) })',
].join('; ')

export default defineConfig({
  testDir: './tests/browser-specialized/catalogue',
  testMatch: 'public-catalogue-unavailable.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results/playwright-catalogue-unavailable',
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
    command: `node --input-type=module -e ${JSON.stringify(portOnePreflight)} && corepack npm run build && corepack npm run start -- --port ${port} 2>/dev/null`,
    env: {
      ...process.env,
      ACCOUNT_PURGE_ENABLED: 'false',
      BETTER_AUTH_URL: baseURL,
      DATABASE_MIGRATION_URL: unavailableDatabaseUrl,
      DATABASE_URL: unavailableDatabaseUrl,
    },
    url: `${baseURL}/zedarchivelogo.png`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
