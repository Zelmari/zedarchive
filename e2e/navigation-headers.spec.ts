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

  test('friends page renders header with zedarchive wordmark and links back to home', async ({
    page,
  }) => {
    await page.goto('/friends');
    await expect(page.locator('h1')).toHaveText('Friends');

    // Brand wordmark exists and links to '/'
    const brandLink = page.locator('header a.za-wordmark');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');

    // Quick navigation link to Dashboard exists
    const dashboardLink = page.locator('header nav a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible();
  });

  test('groups page renders header with zedarchive wordmark and links back to home', async ({
    page,
  }) => {
    await page.goto('/groups');
    await expect(page.locator('h1')).toHaveText('Groups');

    const brandLink = page.locator('header a.za-wordmark');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');

    const dashboardLink = page.locator('header nav a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible();
  });

  test('stacks page renders header with zedarchive wordmark and breadcrumbs', async ({ page }) => {
    await page.goto('/stacks');
    await expect(page.locator('h1')).toContainText('Curated Stacks');

    const brandLink = page.locator('header a.za-wordmark');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });

  test('settings page renders sticky header with zedarchive wordmark', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toHaveText('Settings & Account');

    const brandLink = page.locator('header a.za-wordmark');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });
});
