import { test, expect } from '@playwright/test';
import { uniqueUser, signUp, logIn, cleanupUsers, type E2EUser } from './helpers';

test.describe('auth flows', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('auth');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  test('signs up and lands on the dashboard with a session', async ({ page, context }) => {
    await signUp(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session'));
    expect(sessionCookie).toBeTruthy();
  });

  test('rejects an invalid password without a session', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(user.email);
    await page.locator('input[type="password"]').fill('definitely-wrong');
    await page.locator('button[type="submit"]').click();

    // Still on login page; error surfaced to the user.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert').or(page.locator('[role="status"]')).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('logs out via the confirmation dialog and back in', async ({ page }) => {
    await logIn(page, user);

    // Header sign-out opens ConfirmModal; confirm inside the dialog.
    await page.getByTitle('Sign Out', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign Out' }).last().click();

    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('logs back in with valid credentials', async ({ page }) => {
    await logIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
