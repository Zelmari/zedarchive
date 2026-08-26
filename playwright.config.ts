import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Local dev runs on 8787 because it is part of Better Auth's trusted local
// origins (see src/lib/auth.ts); other ports would fail CSRF origin checks.
const PORT = process.env.E2E_PORT || '8787';
// Use `localhost`, not 127.0.0.1: Next.js dev blocks static chunks from
// non-default origins (allowedDevOrigins), and localhost:8787 is already in
// Better Auth's trusted local origins.
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Prefer a system browser when bundled browsers are unavailable
        // (offline/minimal environments). Set PW_EXECUTABLE to override.
        launchOptions: process.env.PW_EXECUTABLE
          ? { executablePath: process.env.PW_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
