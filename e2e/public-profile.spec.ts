import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, signUp, cleanupUsers, type E2EUser } from './helpers';

async function makeProfilePublic(page: import('@playwright/test').Page, handle: string) {
  await page.getByTitle('Public Share Profile').click();
  await expect(page.locator('#profile-username')).toBeVisible();

  await page.locator('#profile-username').fill(handle);
  await page.locator('input[type="checkbox"]').check();
  await page.locator('form').getByRole('button', { name: 'Save Profile' }).click();

  // Wait for the update to commit (toast confirms), otherwise a quick reopen
  // can read pre-commit state via the modal's own profile fetch.
  await expect(page.getByText(/updated successfully/i)).toBeVisible({ timeout: 20_000 });
}

test.describe('public profile & guestbook', () => {
  let owner: E2EUser;
  let commenter: E2EUser;
  let handle: string;

  test.beforeAll(() => {
    owner = uniqueUser('owner');
    commenter = uniqueUser('guest');
    handle = `e2e${Date.now().toString(36)}`.slice(0, 30);
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('owner publishes a public profile with a handle', async ({ page }) => {
    await registerAndAuthenticate(page, owner);
    await page.goto('/dashboard');
    await makeProfilePublic(page, handle);

    // Owner can view their own public page.
    await page.goto(`/u/${handle}`);
    await expect(page.locator('body')).toContainText(handle);
  });

  test('a logged-out visitor can view the public profile', async ({ browser }) => {
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/u/${handle}`);
    await expect(anonPage.locator('body')).toContainText(handle, { ignoreCase: true });
    await anonContext.close();
  });

  test('another member posts a guestbook comment that expires in 7 days', async ({ page }) => {
    await registerAndAuthenticate(page, commenter);
    await page.goto('/dashboard');
    await makeProfilePublic(page, `guest-${handle}`.slice(0, 30));

    await page.goto(`/u/${handle}`);
    const composer = page.locator('textarea');
    await composer.fill('Great archive! — E2E guestbook test');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/Great archive! — E2E guestbook test/)).toBeVisible();
    await expect(page.getByText(/expires in 7d|expires soon/)).toBeVisible();
  });
});
