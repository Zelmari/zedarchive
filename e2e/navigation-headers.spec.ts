import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, cleanupUsers, type E2EUser } from './helpers';

test.describe('unified site header navigation', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('nav');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test.beforeEach(async ({ page }) => {
    await registerAndAuthenticate(page, user);
  });

  test('settings page renders the shared header', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('h1')).toHaveText('Settings & Account');

    const brandLink = page.locator('header a.za-wordmark');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });
});
