import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, cleanupUsers, type E2EUser } from './helpers';

test.describe('mouse-first dashboard navigation & dialogs', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('mouse');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test.beforeEach(async ({ page }) => {
    await registerAndAuthenticate(page, user);
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toHaveText('Your Media Archive');
  });

  test('mouse clicking Add Media opens spotlight modal and manual entry works', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Add Media' }).click();
    const spotlight = page.getByPlaceholder(/Search TV shows/);
    await expect(spotlight).toBeVisible();
    await expect(spotlight).toBeFocused();

    // Click "Create manually instead →" button with empty query
    await page.getByRole('button', { name: /Create manually instead/i }).click();

    // Empty query stays on Spotlight with "Title required"
    await expect(spotlight).toBeVisible();
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/Title required/i))
        .first(),
    ).toBeVisible();

    // Type a title and create manually
    await spotlight.fill('Manual Folio Title');
    await page.getByRole('button', { name: /Create manually instead/i }).click();

    // Opens folio inspector — match the dialog only so the dashboard card
    // heading of the same title does not keep the locator visible after close.
    const folio = page.getByRole('dialog', { name: /Manual Folio Title/i });
    await expect(folio).toBeVisible({ timeout: 15_000 });

    // Escape closes the folio
    await page.keyboard.press('Escape');
    await expect(folio).toBeHidden();
  });

  test('mouse clicking tabs switches views without relying on hotkeys', async ({ page }) => {
    await page.getByRole('button', { name: /Shows \(/ }).click();
    await expect(page.locator('h1')).toHaveText('Shows & Anime');

    await page.getByRole('button', { name: /Books \(/ }).click();
    await expect(page.locator('h1')).toHaveText('Books & Manga');

    await page.getByRole('button', { name: /Total \(/ }).click();
    await expect(page.locator('h1')).toHaveText('Your Media Archive');
  });

  test('mouse clicking Theme button opens palette and updates data-theme', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');

    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('button', { name: 'Midnight Slate' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  });

  test('mouse clicking Stats and Backup opens their respective modals', async ({ page }) => {
    await page.getByRole('button', { name: 'Stats' }).click();
    await expect(page.getByRole('heading', { name: /Archive Statistics/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /Archive Statistics/i })).toBeHidden();

    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('heading', { name: /Backup & Data Sovereignty/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /Backup & Data Sovereignty/i })).toBeHidden();
  });

  test('calendar, spotlight, and command palette each have a single close control', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Calendar' }).click();
    const calendar = page.getByRole('dialog', { name: /Weekly Airing Schedule/i });
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('.za-modal-close')).toHaveCount(1);
    await calendar.getByRole('button', { name: 'Close calendar' }).click();
    await expect(calendar).toBeHidden();

    await page.getByRole('button', { name: 'Add Media' }).click();
    const spotlight = page.getByRole('dialog', {
      name: /Search for media to add to your archive/i,
    });
    await expect(spotlight).toBeVisible();
    await expect(spotlight.locator('.za-modal-close')).toHaveCount(1);
    await spotlight.getByRole('button', { name: 'Close modal' }).click();
    await expect(spotlight).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: /Command palette/i });
    await expect(palette).toBeVisible();
    await expect(palette.locator('.za-modal-close')).toHaveCount(1);
    await palette.getByRole('button', { name: 'Close command palette' }).click();
    await expect(palette).toBeHidden();
  });

  test('single-key shortcuts are inactive and do not hijack navigation', async ({ page }) => {
    // Pressing '2' does not switch to Shows tab
    await page.keyboard.press('2');
    await expect(page.locator('h1')).toHaveText('Your Media Archive');

    // Pressing 'n' does not open Add Media modal
    await page.keyboard.press('n');
    await expect(page.getByPlaceholder(/Search TV shows/)).toBeHidden();

    // Pressing 't' does not open Theme modal
    await page.keyboard.press('t');
    await expect(page.getByRole('heading', { name: /Choose Theme/i })).toBeHidden();
  });
});
