import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, cleanupUsers, type E2EUser } from './helpers';

test.describe('dashboard keyboard shortcuts', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('keys');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test.beforeEach(async ({ page }) => {
    await registerAndAuthenticate(page, user);
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toHaveText('Your Media Archive');

    // Prove React event handlers are attached before relying on hotkeys:
    // a successful programmatic tab switch + return means hydration finished.
    await page.getByRole('button', { name: /Shows \(/ }).click();
    await expect(page.locator('h1')).toHaveText('Shows & Anime');
    await page.getByRole('button', { name: /Total \(/ }).click();
    await expect(page.locator('h1')).toHaveText('Your Media Archive');
  });

  test('N opens the spotlight add modal and Escape closes it', async ({ page }) => {
    await page.keyboard.press('n');
    const spotlight = page.getByPlaceholder(/Search TV shows/);
    await expect(spotlight).toBeVisible();
    await expect(spotlight).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(spotlight).toBeHidden();
  });

  test('/ focuses the archive search input', async ({ page }) => {
    await page.keyboard.press('/');
    const search = page.getByPlaceholder(/Search archive, tags, notes/);
    await expect(search).toBeFocused();
  });

  test('1 / 2 / 3 switch between Total, Shows and Books tabs', async ({ page }) => {
    await page.keyboard.press('2');
    await expect(page.locator('h1')).toHaveText('Shows & Anime');

    await page.keyboard.press('3');
    await expect(page.locator('h1')).toHaveText('Books & Manga');

    await page.keyboard.press('1');
    await expect(page.locator('h1')).toHaveText('Your Media Archive');
  });

  test('T switches the active theme immediately on <html>', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');

    await page.keyboard.press('t');
    await page.getByRole('button', { name: 'Midnight Slate' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  });
});
