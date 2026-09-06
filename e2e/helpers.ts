import postgres from 'postgres';
import type { Locator, Page } from '@playwright/test';

export interface E2EUser {
  email: string;
  password: string;
  name: string;
}

const EMAIL_PREFIX = 'e2e-';
const EMAIL_SUFFIX = '@zedarchive.test';

// Must mirror playwright.config.ts and stay inside Better Auth's trusted
// local origins (see src/lib/auth.ts).
export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8787';

export function uniqueUser(label?: string): E2EUser {
  const id = `${label ? `${label}-` : ''}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  return {
    email: `${EMAIL_PREFIX}${id}${EMAIL_SUFFIX}`,
    password: 'e2e-Password123!',
    name: `E2E ${id}`,
  };
}

/**
 * Delete every E2E-generated user (and, via FK cascades, their sessions,
 * entries, activity logs, and guestbook comments).
 */
export async function cleanupUsers(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1 });
  try {
    await sql`DELETE FROM "user" WHERE email LIKE ${EMAIL_PREFIX + '%' + EMAIL_SUFFIX}`;
  } finally {
    await sql.end();
  }
}

interface CookieLike {
  name: string;
  value: string;
  domain: string;
  path: string;
}

function parseSetCookies(headerStrings: string[], origin: string): CookieLike[] {
  const { hostname } = new URL(origin);
  return headerStrings
    .map((header) => {
      const pair = header.split(';')[0];
      const eq = pair?.indexOf('=') ?? -1;
      if (eq < 0 || !pair) return null;
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: hostname, path: '/' };
    })
    .filter((c): c is CookieLike => c !== null);
}

/**
 * Fast path: register over HTTP and inject session cookies directly,
 * skipping UI form hydration races entirely. Used by suites whose focus
 * is not the auth form itself.
 */
export async function registerAndAuthenticate(page: Page, user: E2EUser): Promise<void> {
  const body = JSON.stringify({ name: user.name, email: user.email, password: user.password });
  const headers = { 'Content-Type': 'application/json', Origin: E2E_BASE_URL };

  let res = await fetch(`${E2E_BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body,
  });

  // Already created earlier in this run (shared fixture user / retry): sign in.
  if (res.status === 422) {
    res = await fetch(`${E2E_BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body,
    });
  }

  if (!res.ok) {
    throw new Error(`API auth failed (${res.status}): ${await res.text()}`);
  }
  await page.context().addCookies(parseSetCookies(res.headers.getSetCookie(), E2E_BASE_URL));
}

/**
 * UI path with a hydration guard: React resets controlled inputs when it
 * attaches, so early fills get wiped and the form natively GET-submits to
 * `/signup?`. We detect that outcome and retry until the SPA handler wins.
 *
 * `next dev` can pin a "Compiling…" overlay after the first dashboard compile.
 * That overlay intercepts pointer events, so a retry `fill()` waits until the
 * test timeout. Strip the portal and force-fill so the overlay cannot block.
 */
async function clearDevOverlay(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document.querySelector('nextjs-portal')?.remove();
    })
    .catch(() => {
      // Page may not be ready yet.
    });
}

async function fillField(locator: Locator, value: string): Promise<void> {
  await clearDevOverlay(locator.page());
  await locator.fill(value, { force: true });
}

export async function signUp(page: Page, user: E2EUser): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto('/signup');
    await fillField(page.getByPlaceholder('e.g. John Smith'), user.name);
    await fillField(page.getByPlaceholder('name@example.com'), user.email);
    const password = page.getByPlaceholder('At least 8 characters');
    await fillField(password, user.password);

    await password.press('Enter');
    try {
      // First dashboard compile under `next dev` can take well over 10s in CI.
      await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
      return;
    } catch {
      // Likely a pre-hydration native submit or a compiling overlay; retry.
    }
  }
  throw new Error('signUp: dashboard navigation never succeeded');
}

/** UI login with the same hydration guard. */
export async function logIn(page: Page, user: E2EUser): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto('/login');
    await fillField(page.getByPlaceholder('name@example.com'), user.email);
    const password = page.locator('input[type="password"]');
    await fillField(password, user.password);

    await password.press('Enter');
    try {
      await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
      return;
    } catch {
      // Retry on hydration race.
    }
  }
  throw new Error('logIn: dashboard navigation never succeeded');
}
