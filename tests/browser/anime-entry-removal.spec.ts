import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'
import {
  applyWcagTextSpacing,
  expectRepresentativeAccessibilityBasics,
  expectTargetAtLeast24Px,
  expectTextSpacingLayout,
} from './helpers/accessibility'

test.use({ screenshot: 'off', trace: 'off' })

const fixturePrefix = `m30-browser-${randomUUID()}`
const password = `M30-${randomUUID()}-password`
const ownerA = {
  email: `${fixturePrefix}-owner-a@example.test`,
  username: `M30A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const ownerB = {
  email: `${fixturePrefix}-owner-b@example.test`,
  username: `M30B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const emptyOwner = {
  email: `${fixturePrefix}-empty-owner@example.test`,
  username: `M30E${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const pagedOwner = {
  email: `${fixturePrefix}-paged-owner@example.test`,
  username: `M30P${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const sharedTitle = 'M30 ZZZ Full tracking target'
const adultTitleSentinel = `${fixturePrefix}-adult-title`
const ownerBTitleSentinel = `${fixturePrefix}-owner-b-title`
const hiddenTitle = 'M30 Hidden non-adult target'
const draftTitle = 'M30 Draft non-adult target'
const originTitle = 'M30 Origin-boundary target'
const emptyTransitionTitle = 'M30 Empty-transition target'
const laterPageTitle = 'M30 Paged ZZZ target'
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })

const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []
let ownerAId = ''
let ownerBId = ''
let sharedCatalogueItemId = ''
let sharedOwnerAEntryId = ''
let sharedOwnerBEntryId = ''
let originEntryId = ''
let laterPageEntryId = ''
const removalTargets = new Map<string, { entryId: string; userId: string }>()

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
  }
}

function monitorUnexpectedBrowserErrors(page: Page) {
  let hasConsoleError = false
  let hasPageError = false

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isExpectedSignInRateLimitError(message)
    ) {
      hasConsoleError = true
    }
  })
  page.on('pageerror', () => {
    hasPageError = true
  })

  return () => {
    expect(hasConsoleError).toBe(false)
    expect(hasPageError).toBe(false)
  }
}

function isExpectedSignInRateLimitError(
  message: import('@playwright/test').ConsoleMessage,
) {
  try {
    return (
      new URL(message.location().url).pathname === '/api/auth/sign-in/email' &&
      message.text().includes('429')
    )
  } catch {
    return false
  }
}

async function insertUser(owner: typeof ownerA): Promise<string> {
  const userId = randomUUID()
  const passwordHash = await hashPassword(password)

  await pool.query(
    `
      insert into users (id, username, username_identity_key, email, email_verified)
      values ($1, $2, $3, $4, true)
    `,
    [userId, owner.username, owner.username.toLowerCase(), owner.email],
  )
  fixtureUserIds.push(userId)
  await pool.query(
    `
      insert into accounts (id, user_id, account_id, provider_id, password)
      values ($1, $2, $3, 'credential', $4)
    `,
    [randomUUID(), userId, userId, passwordHash],
  )
  return userId
}

async function insertCatalogueItem({
  title,
  maturity = 'safe',
  catalogueState = 'published',
}: {
  title: string
  maturity?: 'adult' | 'safe'
  catalogueState?: 'draft' | 'hidden' | 'published'
}): Promise<string> {
  const catalogueItemId = randomUUID()

  await pool.query(
    `
      insert into anime_catalogue_items (
        id,
        english_title,
        format,
        release_status,
        episode_count,
        maturity,
        catalogue_state
      )
      values ($1, $2, 'tv', 'finished', 24, $3, $4)
    `,
    [catalogueItemId, title, maturity, catalogueState],
  )
  fixtureCatalogueItemIds.push(catalogueItemId)
  return catalogueItemId
}

async function insertEntry({
  userId,
  catalogueItemId,
  status = 'planned',
  episodeProgress = 0,
  episodeTotalOverride = null,
  rating = null,
  isFavourite = false,
  startDate = null,
  finishDate = null,
  createdAt = new Date('2026-07-24T12:00:00.000Z'),
}: {
  userId: string
  catalogueItemId: string
  status?: 'completed' | 'planned'
  episodeProgress?: number
  episodeTotalOverride?: number | null
  rating?: number | null
  isFavourite?: boolean
  startDate?: string | null
  finishDate?: string | null
  createdAt?: Date
}): Promise<string> {
  const entryId = randomUUID()

  await pool.query(
    `
      insert into anime_entries (
        id,
        user_id,
        catalogue_item_id,
        status,
        episode_progress,
        episode_total_override,
        rating,
        is_favourite,
        start_date,
        finish_date,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
    `,
    [
      entryId,
      userId,
      catalogueItemId,
      status,
      episodeProgress,
      episodeTotalOverride,
      rating,
      isFavourite,
      startDate,
      finishDate,
      createdAt,
    ],
  )

  return entryId
}

async function signIn(page: Page, owner: typeof ownerA) {
  await page.goto('/sign-in')
  let status = 0

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(owner.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password)
    const signInResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/auth/sign-in/email',
    )
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    status = (await signInResponse).status()
    if (status !== 429) break
    await page.waitForTimeout(60_000)
  }

  expect(status).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page) {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })

  if (await signOut.isVisible().catch(() => false)) {
    const signOutResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/auth/sign-out',
    )
    await signOut.click()
    expect((await signOutResponse).status()).toBe(200)
    await page.reload()
    await expect(
      page
        .getByRole('navigation', { name: 'Account', exact: true })
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible({ timeout: 15_000 })
  }
}

function cardForTitle(page: Page, title: string) {
  return page.locator('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

function archiveActionName(action: string, title: string) {
  return `${action} — ${title}`
}

async function openRemovalDialog(page: Page, title: string) {
  const card = cardForTitle(page, title)
  const launcher = card.getByRole('button', {
    name: archiveActionName('Remove from archive', title),
    exact: true,
  })

  await launcher.click()
  const dialog = page.getByRole('dialog', {
    name: `Remove ${title} from your archive?`,
    exact: true,
  })
  await expect(dialog).toBeVisible()
  return { card, dialog, launcher }
}

async function expectRemovalDialogPresentation(
  page: Page,
  dialog: ReturnType<Page['locator']>,
) {
  await expect(dialog).toHaveClass(/\bza-dialog\b/)
  expect(
    await dialog.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none')
  expect(
    await dialog.evaluate((element) => getComputedStyle(element).overflowY),
  ).toBe('auto')

  const [dialogBox, viewport] = await Promise.all([
    dialog.boundingBox(),
    page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    })),
  ])
  expect(dialogBox).not.toBeNull()
  expect(dialogBox!.x).toBeGreaterThanOrEqual(-0.5)
  expect(dialogBox!.y).toBeGreaterThanOrEqual(-0.5)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
    viewport.width + 0.5,
  )
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
    viewport.height + 0.5,
  )
}

async function confirmRemoval(page: Page, title: string) {
  const { dialog } = await openRemovalDialog(page, title)
  await dialog
    .getByRole('button', {
      name: archiveActionName('Remove from archive', title),
      exact: true,
    })
    .click()
  const status = page.getByRole('status').filter({
    hasText: /^Anime removed from your archive\.$/,
  })
  const target = removalTargets.get(title)
  if (target === undefined) {
    throw new Error(`Missing removal fixture target for ${title}`)
  }

  await expect(dialog).not.toBeVisible()
  const targetCount = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from anime_entries
      where id = $1 and user_id = $2
    `,
    [target.entryId, target.userId],
  )
  expect(targetCount.rows[0]?.count).toBe('0')
  await expect(status).toBeFocused({ timeout: 15_000 })
  await expect(cardForTitle(page, title)).toHaveCount(0, { timeout: 15_000 })
}

async function holdEntryLock(entryId: string): Promise<PoolClient> {
  const client = await pool.connect()

  try {
    await client.query('begin')
    await client.query(
      'select id from anime_entries where id = $1 for update',
      [entryId],
    )
    return client
  } catch (error) {
    client.release()
    throw error
  }
}

test.beforeAll(async () => {
  const databaseResult = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

  ownerAId = await insertUser(ownerA)
  ownerBId = await insertUser(ownerB)
  const emptyOwnerId = await insertUser(emptyOwner)
  const pagedOwnerId = await insertUser(pagedOwner)

  sharedCatalogueItemId = await insertCatalogueItem({ title: sharedTitle })
  await pool.query(
    `
      insert into anime_alternative_titles (catalogue_item_id, title, position)
      values ($1, $2, 0)
    `,
    [sharedCatalogueItemId, `${fixturePrefix}-alternative-title`],
  )
  await pool.query(
    `
      insert into anime_catalogue_sources (
        catalogue_item_id,
        source_key,
        source_item_id
      )
      values ($1, 'm30_browser', $2)
    `,
    [sharedCatalogueItemId, fixturePrefix],
  )
  sharedOwnerAEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: sharedCatalogueItemId,
    status: 'completed',
    episodeProgress: 18,
    episodeTotalOverride: 20,
    rating: 9.5,
    isFavourite: true,
    startDate: '2026-01-02',
    finishDate: '2026-02-03',
    createdAt: new Date('2026-07-24T13:00:00.000Z'),
  })
  removalTargets.set(sharedTitle, {
    entryId: sharedOwnerAEntryId,
    userId: ownerAId,
  })
  sharedOwnerBEntryId = await insertEntry({
    userId: ownerBId,
    catalogueItemId: sharedCatalogueItemId,
  })

  const adultCatalogueItemId = await insertCatalogueItem({
    title: adultTitleSentinel,
    maturity: 'adult',
  })
  await insertEntry({
    userId: ownerAId,
    catalogueItemId: adultCatalogueItemId,
    isFavourite: true,
  })

  const hiddenCatalogueItemId = await insertCatalogueItem({
    title: hiddenTitle,
    catalogueState: 'hidden',
  })
  const hiddenEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: hiddenCatalogueItemId,
  })
  removalTargets.set(hiddenTitle, { entryId: hiddenEntryId, userId: ownerAId })

  const draftCatalogueItemId = await insertCatalogueItem({
    title: draftTitle,
    catalogueState: 'draft',
  })
  const draftEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: draftCatalogueItemId,
  })
  removalTargets.set(draftTitle, { entryId: draftEntryId, userId: ownerAId })

  const originCatalogueItemId = await insertCatalogueItem({
    title: originTitle,
  })
  originEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: originCatalogueItemId,
  })
  removalTargets.set(originTitle, { entryId: originEntryId, userId: ownerAId })

  for (const index of Array.from({ length: 19 }, (_, value) => value + 1)) {
    const catalogueItemId = await insertCatalogueItem({
      title: `M30 Regular ${String(index).padStart(2, '0')}`,
    })
    await insertEntry({
      userId: ownerAId,
      catalogueItemId,
      createdAt: new Date(
        Date.parse('2026-07-24T12:00:00.000Z') + index * 1_000,
      ),
    })
  }

  const ownerBCatalogueItemId = await insertCatalogueItem({
    title: ownerBTitleSentinel,
  })
  await insertEntry({
    userId: ownerBId,
    catalogueItemId: ownerBCatalogueItemId,
  })

  const emptyCatalogueItemId = await insertCatalogueItem({
    title: emptyTransitionTitle,
  })
  const emptyTransitionEntryId = await insertEntry({
    userId: emptyOwnerId,
    catalogueItemId: emptyCatalogueItemId,
  })
  removalTargets.set(emptyTransitionTitle, {
    entryId: emptyTransitionEntryId,
    userId: emptyOwnerId,
  })

  for (const index of Array.from({ length: 24 }, (_, value) => value + 1)) {
    const catalogueItemId = await insertCatalogueItem({
      title: `M30 Paged Regular ${String(index).padStart(2, '0')}`,
    })
    await insertEntry({
      userId: pagedOwnerId,
      catalogueItemId,
    })
  }
  const laterPageCatalogueItemId = await insertCatalogueItem({
    title: laterPageTitle,
  })
  laterPageEntryId = await insertEntry({
    userId: pagedOwnerId,
    catalogueItemId: laterPageCatalogueItemId,
  })
  removalTargets.set(laterPageTitle, {
    entryId: laterPageEntryId,
    userId: pagedOwnerId,
  })
})

test.afterEach(async ({ page }) => {
  if ((await page.locator('dialog[open]').count()) > 0) {
    await page.goto('/archive/anime?sort=alphabetical')
  }
  await signOutIfSignedIn(page)
})

test.afterAll(async () => {
  try {
    const databaseResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

    await pool.query('delete from users where id = any($1::uuid[])', [
      fixtureUserIds,
    ])
    const userCount = await pool.query<{ count: string }>(
      'select count(*)::text as count from users where id = any($1::uuid[])',
      [fixtureUserIds],
    )
    expect(userCount.rows[0]?.count).toBe('0')

    await pool.query(
      'delete from anime_catalogue_items where id = any($1::uuid[])',
      [fixtureCatalogueItemIds],
    )
    const catalogueItemCount = await pool.query<{ count: string }>(
      'select count(*)::text as count from anime_catalogue_items where id = any($1::uuid[])',
      [fixtureCatalogueItemIds],
    )
    expect(catalogueItemCount.rows[0]?.count).toBe('0')
  } finally {
    await pool.end()
  }
})

test('confirms an owner-scoped removal, serializes duplicate submission, and preserves route state', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  await signIn(page, ownerA)
  await expectRepresentativeAccessibilityBasics(page)

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 960 },
  ]) {
    await page.setViewportSize(viewport)
    const response = await page.goto('/archive/anime?sort=alphabetical')
    expect(response?.status()).toBe(200)
    expect(await response?.headerValue('cache-control')).toContain('private')
    expect(await response?.headerValue('cache-control')).toContain('no-store')
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
  }

  for (const title of [hiddenTitle, draftTitle]) {
    await expect(
      cardForTitle(page, title).getByRole('button', {
        name: archiveActionName('Remove from archive', title),
        exact: true,
      }),
    ).toBeVisible()
  }
  const restrictedCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Restricted anime', exact: true }),
  })
  await expect(restrictedCard).toHaveCount(1)
  await expect(restrictedCard).toContainText(
    'Tracking controls aren’t available for restricted anime yet.',
  )
  await expect(restrictedCard.getByRole('button')).toHaveCount(0)
  await expect(restrictedCard.locator('input, dialog')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(adultTitleSentinel)

  await page.getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(page).toHaveURL('/archive/anime?sort=alphabetical')

  const firstOpen = await openRemovalDialog(page, sharedTitle)
  await expect(firstOpen.dialog).toContainText(
    'Removing this entry permanently deletes its status, episode progress, personal episode total, rating, favourite, and viewing dates. This can’t be undone. The shared catalogue anime will remain.',
  )
  const cancelButton = firstOpen.dialog.getByRole('button', {
    name: archiveActionName('Cancel removal', sharedTitle),
    exact: true,
  })
  await expect(cancelButton).toBeFocused()
  await expectTargetAtLeast24Px(cancelButton)
  await expectRemovalDialogPresentation(page, firstOpen.dialog)
  let spacingAuditCompleted = false
  try {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expectRemovalDialogPresentation(page, firstOpen.dialog)
    await applyWcagTextSpacing(page)
    await expectTextSpacingLayout(page, {
      content: [
        firstOpen.dialog.getByRole('heading'),
        firstOpen.dialog.getByText(
          'Removing this entry permanently deletes its status, episode progress, personal episode total, rating, favourite, and viewing dates. This can’t be undone. The shared catalogue anime will remain.',
          { exact: true },
        ),
      ],
      controls: [
        cancelButton,
        firstOpen.dialog.getByRole('button', {
          name: archiveActionName('Remove from archive', sharedTitle),
          exact: true,
        }),
      ],
    })
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(cancelButton).toBeVisible()
    await expect(firstOpen.dialog).toHaveClass(/\bza-dialog\b/)
    spacingAuditCompleted = true
  } finally {
    await page.emulateMedia({ forcedColors: 'none' })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = ''
    })
    await page.setViewportSize({ width: 1280, height: 960 })

    if (!spacingAuditCompleted) {
      await page.goto('/archive/anime?sort=alphabetical')
    }
  }
  await cancelButton.focus()
  await expect(cancelButton).toBeFocused()
  const dialogButtons = firstOpen.dialog.getByRole('button')
  await expect(dialogButtons.nth(0)).toHaveText('Cancel')
  await page.keyboard.press('Tab')
  await expect(dialogButtons.nth(1)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancelButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(firstOpen.dialog).not.toBeVisible()
  await expect(firstOpen.launcher).toBeFocused()
  await page.goto('/archive/anime?sort=alphabetical')

  const secondOpen = await openRemovalDialog(page, sharedTitle)
  await page.mouse.click(1, 1)
  await expect(secondOpen.dialog).toBeVisible()
  await secondOpen.dialog
    .getByRole('button', {
      name: archiveActionName('Cancel removal', sharedTitle),
      exact: true,
    })
    .click()
  await expect(secondOpen.dialog).not.toBeVisible()
  await expect(secondOpen.launcher).toBeFocused()

  const thirdOpen = await openRemovalDialog(page, sharedTitle)
  await page.keyboard.press('Escape')
  await expect(thirdOpen.dialog).not.toBeVisible()
  await expect(thirdOpen.launcher).toBeFocused()

  let removalRequestCount = 0
  const countRemovalRequest = (request: import('@playwright/test').Request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/archive/anime'
    ) {
      removalRequestCount += 1
    }
  }
  page.on('request', countRemovalRequest)

  const lockClient = await holdEntryLock(sharedOwnerAEntryId)
  try {
    const pendingOpen = await openRemovalDialog(page, sharedTitle)
    const confirmButton = pendingOpen.dialog.getByRole('button', {
      name: archiveActionName('Remove from archive', sharedTitle),
      exact: true,
    })
    await confirmButton.click()
    const pendingConfirmButton = pendingOpen.dialog.getByRole('button', {
      name: archiveActionName('Removing…', sharedTitle),
      exact: true,
    })
    await expect(pendingConfirmButton).toBeDisabled()
    await expect(
      pendingOpen.dialog.getByRole('button', {
        name: archiveActionName('Cancel removal', sharedTitle),
        exact: true,
      }),
    ).toBeDisabled()
    await expect(pendingOpen.dialog).toHaveAttribute('aria-busy', 'true')
    await expect(
      pendingOpen.card.getByRole('button', {
        name: archiveActionName('Remove from favourites', sharedTitle),
        exact: true,
      }),
    ).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(pendingOpen.dialog).toBeVisible()
    await pendingConfirmButton.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Pending removal control is unavailable')
      }
      button.click()
    })
  } finally {
    await lockClient.query('commit')
    lockClient.release()
  }

  const status = page.getByRole('status').filter({
    hasText: /^Anime removed from your archive\.$/,
  })
  await expect(cardForTitle(page, sharedTitle)).toHaveCount(0, {
    timeout: 15_000,
  })
  await expect(status).toBeFocused({ timeout: 15_000 })
  expect(removalRequestCount).toBe(1)
  page.off('request', countRemovalRequest)
  await expect(page).toHaveURL('/archive/anime?sort=alphabetical')

  const persistedSort = await page.evaluate(() =>
    window.localStorage.getItem('zedarchive:archive-sort:v1:anime'),
  )
  expect(persistedSort).toBe('alphabetical')

  const deletionEvidence = await pool.query<{
    alternativeTitles: number
    catalogueItems: number
    ownerAEntries: number
    ownerBEntries: number
    sources: number
  }>(
    `
      select
        (
          select count(*)::int
          from anime_entries
          where id = $1 and user_id = $2
        ) as "ownerAEntries",
        (
          select count(*)::int
          from anime_entries
          where id = $3 and user_id = $4
        ) as "ownerBEntries",
        (
          select count(*)::int
          from anime_catalogue_items
          where id = $5
        ) as "catalogueItems",
        (
          select count(*)::int
          from anime_alternative_titles
          where catalogue_item_id = $5
        ) as "alternativeTitles",
        (
          select count(*)::int
          from anime_catalogue_sources
          where catalogue_item_id = $5
        ) as "sources"
    `,
    [
      sharedOwnerAEntryId,
      ownerAId,
      sharedOwnerBEntryId,
      ownerBId,
      sharedCatalogueItemId,
    ],
  )
  expect(deletionEvidence.rows[0]).toEqual({
    alternativeTitles: 1,
    catalogueItems: 1,
    ownerAEntries: 0,
    ownerBEntries: 1,
    sources: 1,
  })

  assertNoUnexpectedBrowserErrors()
})

test('preserves a later-page URL and renders beyond-final recovery after deleting its final row', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  await signIn(page, pagedOwner)
  await page.goto('/archive/anime?sort=alphabetical&page=2')
  await confirmRemoval(page, laterPageTitle)

  await expect(page).toHaveURL('/archive/anime?sort=alphabetical&page=2')
  await expect(
    page.getByRole('heading', {
      name: 'There are no anime on this page',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Go to the first page', exact: true }),
  ).toHaveAttribute('href', '/archive/anime?sort=alphabetical')

  const targetCount = await pool.query<{ count: string }>(
    'select count(*)::text as count from anime_entries where id = $1',
    [laterPageEntryId],
  )
  expect(targetCount.rows[0]?.count).toBe('0')
  assertNoUnexpectedBrowserErrors()
})

test('removes hidden and draft non-adult entries and transitions the final page-one row to empty', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')
  await confirmRemoval(page, hiddenTitle)
  await confirmRemoval(page, draftTitle)
  await expect(cardForTitle(page, hiddenTitle)).toHaveCount(0)
  await expect(cardForTitle(page, draftTitle)).toHaveCount(0)
  await signOutIfSignedIn(page)

  await signIn(page, emptyOwner)
  await page.goto('/archive/anime?sort=alphabetical')
  await confirmRemoval(page, emptyTransitionTitle)
  await expect(
    page.getByRole('heading', {
      name: 'Your anime archive is empty',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page).toHaveURL('/archive/anime?sort=alphabetical')

  assertNoUnexpectedBrowserErrors()
})

test('rejects a mismatched-Origin destructive request without deleting the target', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')

  let modifiedRequest = false
  await page.route('**/archive/anime**', async (route) => {
    const request = route.request()

    if (!modifiedRequest && request.method() === 'POST') {
      modifiedRequest = true
      await route.continue({
        headers: {
          ...request.headers(),
          'x-forwarded-host': 'm30-host-mismatch.invalid',
          origin: 'http://m30-origin-mismatch.invalid',
        },
      })
      return
    }

    await route.continue()
  })

  const { dialog } = await openRemovalDialog(page, originTitle)
  const rejectionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/archive/anime',
  )
  try {
    await dialog
      .getByRole('button', {
        name: archiveActionName('Remove from archive', originTitle),
        exact: true,
      })
      .click()
    await expect.poll(() => modifiedRequest).toBe(true)
    await rejectionResponse
    await expect(dialog.getByRole('alert')).toHaveText(
      'We couldn’t remove this entry right now. Try again.',
    )
  } finally {
    await page.unroute('**/archive/anime**')
  }

  const targetCount = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from anime_entries
      where id = $1 and user_id = $2
    `,
    [originEntryId, ownerAId],
  )
  expect(targetCount.rows[0]?.count).toBe('1')

  await page.goto('/archive/anime?sort=alphabetical')
  await expect(cardForTitle(page, originTitle)).toBeVisible()
})

test('keeps private archives isolated across an A/B/A principal sequence', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)

  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.locator('body')).toContainText('M30 Regular 01')
  await expect(page.locator('body')).not.toContainText(ownerBTitleSentinel)
  await signOutIfSignedIn(page)

  await signIn(page, ownerB)
  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.locator('body')).toContainText(sharedTitle)
  await expect(page.locator('body')).toContainText(ownerBTitleSentinel)
  await expect(page.locator('body')).not.toContainText('M30 Regular 01')
  await signOutIfSignedIn(page)

  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.locator('body')).toContainText('M30 Regular 01')
  await expect(page.locator('body')).not.toContainText(ownerBTitleSentinel)

  await signOutIfSignedIn(page)
  const signedOutResponse = await page.goto('/archive/anime?sort=alphabetical')
  expect(signedOutResponse?.status()).toBe(200)
  expect(await signedOutResponse?.headerValue('cache-control')).toContain(
    'private',
  )
  expect(await signedOutResponse?.headerValue('cache-control')).toContain(
    'no-store',
  )
  await expect(
    page
      .locator('#main-content')
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: /^Remove from archive — /,
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(page.locator('dialog, input[name="entryId"]')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(sharedTitle)
  await expect(page.locator('body')).not.toContainText(adultTitleSentinel)

  assertNoUnexpectedBrowserErrors()
})
