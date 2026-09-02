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

  const navigationCases = [
    {
      name: 'friends',
      path: '/friends',
      heading: 'Friends',
      headingMatch: 'exact',
      dashboardLink: true,
    },
    {
      name: 'groups',
      path: '/groups',
      heading: 'Groups',
      headingMatch: 'exact',
      dashboardLink: true,
    },
    {
      name: 'stacks',
      path: '/stacks',
      heading: 'Curated Stacks',
      headingMatch: 'contains',
      dashboardLink: false,
    },
    {
      name: 'settings',
      path: '/settings',
      heading: 'Settings & Account',
      headingMatch: 'exact',
      dashboardLink: false,
    },
  ] as const;

  for (const navigationCase of navigationCases) {
    test(`${navigationCase.name} page renders the shared header`, async ({ page }) => {
      await page.goto(navigationCase.path);

      if (navigationCase.headingMatch === 'exact') {
        await expect(page.locator('h1')).toHaveText(navigationCase.heading);
      } else {
        await expect(page.locator('h1')).toContainText(navigationCase.heading);
      }

      const brandLink = page.locator('header a.za-wordmark');
      await expect(brandLink).toBeVisible();
      await expect(brandLink).toHaveAttribute('href', '/');

      if (navigationCase.dashboardLink) {
        const dashboardLink = page.locator('header nav a[href="/dashboard"]');
        await expect(dashboardLink).toBeVisible();
      }
    });
  }
});
