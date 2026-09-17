import { test, expect } from '@playwright/test';
import {
  uniqueUser,
  registerAndAuthenticate,
  cleanupUsers,
  insertMediaForEmail,
  type E2EUser,
} from './helpers';

const LONG_TITLE = 'The Very Long Title That Should Stay Readable Next To Action Buttons';

test.describe('title layout and cover ratings', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('layout');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('ratings sit in badges, not on covers, and long titles do not letter-wrap', async ({
    page,
  }) => {
    await registerAndAuthenticate(page, user);
    await insertMediaForEmail(user.email, { title: LONG_TITLE, rating: 10 });

    await page.goto('/dashboard');
    const card = page.locator('article', { hasText: LONG_TITLE }).first();
    await expect(card).toBeVisible();

    await expect(card.getByLabel('Rated 10 out of 10')).toHaveCount(0);
    await expect(card.locator('.za-gold-stamp.absolute')).toHaveCount(0);
    await expect(card.getByTitle('Rated 10/10')).toBeVisible();

    const title = card.locator('h3');
    await expect(title).toHaveText(LONG_TITLE);
    const box = await title.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeLessThan(160);
    expect(box!.width).toBeGreaterThan(160);

    await page.getByLabel('Poster cards').click();
    const posterCard = page.locator('article', { hasText: LONG_TITLE }).first();
    await expect(posterCard).toHaveAttribute('data-card-layout', 'poster');
    await expect(posterCard.getByLabel('Rated 10 out of 10')).toHaveCount(0);
    await expect(posterCard.getByTitle('Rated 10/10')).toBeVisible();
    const posterTitle = posterCard.locator('h3');
    const posterBox = await posterTitle.boundingBox();
    expect(posterBox).toBeTruthy();
    expect(posterBox!.height).toBeLessThan(160);
    expect(posterBox!.width).toBeGreaterThan(160);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/settings');
    const settingsTitle = page.locator('h1', { hasText: 'Settings & Account' });
    await expect(settingsTitle).toBeVisible();
    const settingsBox = await settingsTitle.boundingBox();
    expect(settingsBox).toBeTruthy();
    expect(settingsBox!.height).toBeLessThan(80);
    expect(settingsBox!.width).toBeGreaterThan(140);
  });
});
