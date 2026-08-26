import { test, expect } from '@playwright/test';
import { uniqueUser, registerAndAuthenticate, cleanupUsers, type E2EUser } from './helpers';

test.describe('backup export/import roundtrip', () => {
  let user: E2EUser;

  test.beforeAll(() => {
    user = uniqueUser('backup');
  });

  test.afterAll(async () => {
    await cleanupUsers();
  });

  // Fresh browser context per test → authenticate in every one.
  test.beforeEach(async ({ page }) => {
    await registerAndAuthenticate(page, user);
    await page.goto('/dashboard');
  });

  function buildZedArchiveBackup() {
    return JSON.stringify([
      {
        id: 'e2e-backup-entry-1',
        title: 'Klara and the Sun',
        category: 'book',
        status: 'completed',
        primaryUnitCurrent: 1,
        primaryUnitTotal: 1,
        secondaryUnitCurrent: 303,
        secondaryUnitTotal: 303,
        structure: [],
        rewatchCount: 2,
        startedAt: '2026-01-02T00:00:00.000Z',
        completedAt: '2026-02-01T00:00:00.000Z',
        rating: 9,
        tags: ['e2e-fixture'],
        genres: ['science fiction'],
        synopsis: 'E2E roundtrip fixture entry.',
        coverImage: null,
        sourceId: null,
        notes: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  }

  async function openBackupModal(page: import('@playwright/test').Page) {
    await page.getByTitle('Export or Import Backups (Press B)').click();
    await expect(page.getByText('Export as JSON Backup')).toBeVisible();
    // Switch to the Import tab so the hidden file input mounts.
    await page.getByRole('button', { name: /Import Archive/ }).click();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  }

  const BACKUP_FILE = {
    name: 'zedarchive-backup.json',
    mimeType: 'application/json' as const,
    buffer: Buffer.from(buildZedArchiveBackup()),
  };

  test('imports a ZedArchive backup and reports the result', async ({ page }) => {
    await openBackupModal(page);

    await page.setInputFiles('input[type="file"]', BACKUP_FILE);
    await expect(
      page.getByText('Successfully imported 1 new item(s) and updated 0 item(s)! (0 skipped)')
    ).toBeVisible({ timeout: 30_000 });
  });

  test('re-importing the same backup skips duplicates (skip strategy)', async ({ page }) => {
    await openBackupModal(page);

    await page.setInputFiles('input[type="file"]', BACKUP_FILE);
    await expect(
      page.getByText(/\(1 skipped\)/)
    ).toBeVisible({ timeout: 30_000 });
  });

  test('exports the library as JSON containing imported entries', async ({ page }) => {
    await openBackupModal(page);

    // Switch back to the Export tab (openBackupModal leaves us on Import).
    await page.getByRole('button', { name: /Export Data/ }).click();
    await expect(page.getByText('Export as JSON Backup')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Export as JSON Backup').click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(Array.isArray(exported)).toBe(true);
    const entry = exported.find((e: { title: string }) => e.title === 'Klara and the Sun');
    expect(entry).toBeTruthy();
    // Field-fidelity regression guard (fix 1.3): these must survive export.
    expect(entry.rewatchCount).toBe(2);
    expect(entry.synopsis).toContain('roundtrip fixture');
    expect(entry.genres).toEqual(['science fiction']);
  });
});
