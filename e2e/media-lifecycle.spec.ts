import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, cleanupUsers, type E2EUser } from './helpers';

test.describe('media lifecycle', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('life');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('search, add, step progress, and switch seasons', async ({ page }) => {
    await registerAndAuthenticate(page, user);
    await page.goto('/dashboard');

    // Open Spotlight and search TVMaze for a multi-season show.
    await page.keyboard.press('n');
    const spotlight = page.getByPlaceholder(/Search TV shows/);
    await spotlight.fill('Frieren');

    // Styling-agnostic selector: components expose data-testid hooks.
    const firstResult = page.getByTestId('spotlight-item').first();
    await expect(firstResult).toBeVisible({ timeout: 30_000 });
    await firstResult.click();

    // Selecting a result prefills the manual form (title + season structure).
    const titleInput = page.getByPlaceholder(/e\.g\. Frieren: Beyond Journey's End/);
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue(/Frieren/i);
    await page.locator('button[type="submit"]').click();

    // Card appears on the dashboard grid.
    const card = page.locator('article', { hasText: /Frieren/i }).first();
    await expect(card).toBeVisible();

    // Regression guard (fix 1.2): a stepper click must fire exactly ONE
    // server action request — no duplicate network calls.
    const actionPosts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.headers()['next-action']) {
        actionPosts.push(request.url());
      }
    });

    await card.getByLabel('Increment episode').click();
    await expect(card.getByText(/Ep\s+0?1/i)).toBeVisible();
    expect(actionPosts.length).toBe(1);

    // Advance to the next season: episode counter resets, season badge moves.
    await card.getByTitle('Next season').click();
    await expect(card.getByText(/^S2/)).toBeVisible();
    await expect(card.getByText(/Ep\s+0?1/i)).toBeVisible();

    // Progress bar reflects the reset state (not the previous season's %).
    await expect(card.getByText(/^\d+%$/)).toBeVisible();
  });
});
