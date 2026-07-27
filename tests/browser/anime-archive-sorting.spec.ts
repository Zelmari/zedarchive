import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })

const fixturePrefix = `m29-browser-${randomUUID()}`
const password = `M29-${randomUUID()}-password`
const ownerA = {
  email: `${fixturePrefix}-owner-a@example.test`,
  username: `M29A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const ownerB = {
  email: `${fixturePrefix}-owner-b@example.test`,
  username: `M29B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const adultTitleSentinel = `${fixturePrefix}-adult-title`
const ownerBTitleSentinel = `${fixturePrefix}-owner-b-title`
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })

const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []

function monitorUnexpectedBrowserErrors(page: Page) {
  let hasConsoleError = false
  let hasPageError = false

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isKnownMissingFaviconError(message) &&
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

function isKnownMissingFaviconError(
  message: import('@playwright/test').ConsoleMessage,
) {
  const location = message.location().url

  try {
    return (
      new URL(location).pathname === '/favicon.ico' &&
      message.text().includes('404')
    )
  } catch {
    return false
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

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
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
}: {
  title: string
  maturity?: 'adult' | 'safe'
}): Promise<string> {
  const catalogueItemId = randomUUID()

  await pool.query(
    `
      insert into anime_catalogue_items (
        id,
        english_title,
        format,
        release_status,
        maturity,
        catalogue_state
      )
      values ($1, $2, 'tv', 'finished', $3, 'published')
    `,
    [catalogueItemId, title, maturity],
  )

  fixtureCatalogueItemIds.push(catalogueItemId)
  return catalogueItemId
}

async function insertEntry({
  userId,
  catalogueItemId,
  isFavourite = false,
  rating = null,
  createdAt,
  updatedAt,
}: {
  userId: string
  catalogueItemId: string
  isFavourite?: boolean
  rating?: number | null
  createdAt: Date
  updatedAt: Date
}) {
  if (updatedAt.getTime() < createdAt.getTime()) {
    throw new Error('Browser entry fixture timestamp order is invalid')
  }

  await pool.query(
    `
      insert into anime_entries (
        id,
        user_id,
        catalogue_item_id,
        status,
        is_favourite,
        rating,
        created_at,
        updated_at
      )
      values ($1, $2, $3, 'planned', $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      userId,
      catalogueItemId,
      isFavourite,
      rating,
      createdAt,
      updatedAt,
    ],
  )
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

async function signOut(page: Page) {
  const signOutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-out',
  )
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  expect((await signOutResponse).status()).toBe(200)
  await page.reload()
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Signed in as')).toHaveCount(0)
}

async function applySort(
  page: Page,
  sort:
    'alphabetical' | 'recently-updated' | 'recently-added' | 'highest-rated',
) {
  await page.locator('select[name="sort"]').selectOption(sort)
  await page.getByRole('button', { name: 'Apply sort' }).click()
  await expect(page).toHaveURL(`/archive/anime?sort=${sort}`)
}

async function expectLeadingTitles(page: Page, expectedTitles: string[]) {
  const headings = page.locator('article h2')

  for (const [index, expectedTitle] of expectedTitles.entries()) {
    await expect(headings.nth(index)).toHaveText(expectedTitle)
  }
}

test.beforeAll(async () => {
  const databaseResult = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

  const [ownerAId, ownerBId] = await Promise.all([
    insertUser(ownerA),
    insertUser(ownerB),
  ])
  const baseTime = Date.parse('2026-07-24T12:00:00.000Z')

  const ownerAEntries = [
    {
      title: 'M29 Favourite Alpha',
      isFavourite: true,
      rating: 8,
      createdOffset: 1,
      updatedOffset: 3,
    },
    {
      title: 'M29 Favourite Bravo',
      isFavourite: true,
      rating: 8,
      createdOffset: 2,
      updatedOffset: 5,
    },
    {
      title: 'M29 Favourite Unrated',
      isFavourite: true,
      rating: null,
      createdOffset: 3,
      updatedOffset: 4,
    },
    {
      title: 'M29 Normal Ten',
      isFavourite: false,
      rating: 10,
      createdOffset: 4,
      updatedOffset: 4,
    },
    ...Array.from({ length: 22 }, (_, index) => ({
      title: `M29 Regular ${String(index + 1).padStart(2, '0')}`,
      isFavourite: false,
      rating: index === 0 ? 8 : null,
      createdOffset: index + 5,
      updatedOffset: index + 6,
    })),
  ]

  for (const entry of ownerAEntries) {
    const catalogueItemId = await insertCatalogueItem({ title: entry.title })
    await insertEntry({
      userId: ownerAId,
      catalogueItemId,
      isFavourite: entry.isFavourite,
      rating: entry.rating,
      createdAt: new Date(baseTime + entry.createdOffset * 1_000),
      updatedAt: new Date(baseTime + entry.updatedOffset * 1_000),
    })
  }

  for (const suffix of ['a', 'b']) {
    const catalogueItemId = await insertCatalogueItem({
      title: `${adultTitleSentinel}-${suffix}`,
      maturity: 'adult',
    })
    await insertEntry({
      userId: ownerAId,
      catalogueItemId,
      isFavourite: true,
      rating: 10,
      createdAt: new Date(baseTime + 80_000),
      updatedAt: new Date(baseTime + 90_000),
    })
  }

  const ownerBCatalogueItemId = await insertCatalogueItem({
    title: ownerBTitleSentinel,
  })
  await insertEntry({
    userId: ownerBId,
    catalogueItemId: ownerBCatalogueItemId,
    createdAt: new Date(baseTime),
    updatedAt: new Date(baseTime),
  })
})

test.afterAll(async () => {
  try {
    const databaseResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

    if (fixtureUserIds.length > 0) {
      await pool.query('delete from users where id = any($1::uuid[])', [
        fixtureUserIds,
      ])
      const userCount = await pool.query<{ count: string }>(
        'select count(*)::text as count from users where id = any($1::uuid[])',
        [fixtureUserIds],
      )
      expect(userCount.rows[0]?.count).toBe('0')
    }

    if (fixtureCatalogueItemIds.length > 0) {
      await pool.query(
        'delete from anime_catalogue_items where id = any($1::uuid[])',
        [fixtureCatalogueItemIds],
      )
      const catalogueItemCount = await pool.query<{ count: string }>(
        'select count(*)::text as count from anime_catalogue_items where id = any($1::uuid[])',
        [fixtureCatalogueItemIds],
      )
      expect(catalogueItemCount.rows[0]?.count).toBe('0')
    }
  } finally {
    await pool.end()
  }
})

test('sorts the complete private archive, persists only through Apply, and preserves restricted privacy', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)

  await page.goto('/archive/anime?sort=unsupported')
  await expect(
    page.locator('p[role="alert"]').filter({
      hasText:
        /^Sort must be alphabetical, recently-updated, recently-added, or highest-rated$/,
    }),
  ).toHaveText(
    'Sort must be alphabetical, recently-updated, recently-added, or highest-rated',
  )
  await expect(page.locator('select[name="sort"]')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('M29 Favourite Alpha')

  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.getByText('to view your anime archive.')).toBeVisible()
  await expect(page.locator('select[name="sort"]')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('M29 Favourite Alpha')

  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')

  await expect(page.locator('select[name="sort"]')).toHaveValue('alphabetical')
  await expectLeadingTitles(page, [
    'M29 Favourite Alpha',
    'M29 Favourite Bravo',
    'M29 Favourite Unrated',
    'M29 Normal Ten',
  ])

  await applySort(page, 'recently-updated')
  await expectLeadingTitles(page, [
    'M29 Favourite Bravo',
    'M29 Favourite Unrated',
    'M29 Favourite Alpha',
  ])

  await applySort(page, 'recently-added')
  await expectLeadingTitles(page, [
    'M29 Favourite Unrated',
    'M29 Favourite Bravo',
    'M29 Favourite Alpha',
  ])

  await applySort(page, 'highest-rated')
  await expectLeadingTitles(page, [
    'M29 Favourite Alpha',
    'M29 Favourite Bravo',
    'M29 Favourite Unrated',
    'M29 Normal Ten',
  ])

  await expect(
    page.getByRole('link', { name: 'Next', exact: true }),
  ).toHaveAttribute('href', '/archive/anime?sort=highest-rated&page=2')
  await page.getByRole('link', { name: 'Next', exact: true }).focus()
  await expect(
    page.getByRole('link', { name: 'Next', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/archive/anime?sort=highest-rated&page=2')
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Next', exact: true }),
  ).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement
        return (
          activeElement === document.body ||
          activeElement === document.querySelector('main')
        )
      }),
    )
    .toBe(true)
  await expect(
    page.getByRole('heading', { name: 'Restricted anime' }),
  ).toHaveCount(2)
  await expect(page.locator('body')).not.toContainText(adultTitleSentinel)

  await page.locator('select[name="sort"]').selectOption('recently-added')
  await page.getByRole('button', { name: 'Apply sort' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/archive/anime?sort=recently-added')
  await expect(page.locator('select[name="sort"]')).toHaveValue(
    'recently-added',
  )
  await expect(page.getByRole('button', { name: 'Apply sort' })).toBeFocused()

  await page.goto('/archive/anime?sort=highest-rated')
  await page.goto('/archive/anime')
  await expect(page).toHaveURL('/archive/anime?sort=recently-added')
  await expect(page.locator('select[name="sort"]')).toHaveValue(
    'recently-added',
  )
  await expect(page.locator('select[name="sort"]')).not.toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Apply sort' }),
  ).not.toBeFocused()

  await applySort(page, 'alphabetical')
  await expect(page.getByRole('button', { name: 'Apply sort' })).toBeFocused()
  const select = page.locator('select[name="sort"]')
  await select.focus()
  await expect(select).toBeFocused()
  await page.keyboard.press('r')
  await expect(select).toHaveValue('recently-updated')
  await page.getByRole('button', { name: 'Apply sort' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/archive/anime?sort=recently-updated')
  await expect(page.getByRole('button', { name: 'Apply sort' })).toBeFocused()

  await page.goBack()
  await expect(page).toHaveURL('/archive/anime?sort=alphabetical')
  await expect(page.locator('select[name="sort"]')).toHaveValue('alphabetical')
  await page.goForward()
  await expect(page).toHaveURL('/archive/anime?sort=recently-updated')
  await expect(page.locator('select[name="sort"]')).toHaveValue(
    'recently-updated',
  )

  await page.goto('/archive/anime')
  await expect(page).toHaveURL('/archive/anime?sort=recently-updated')
  await expect(page.locator('select[name="sort"]')).toHaveValue(
    'recently-updated',
  )

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 960 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/archive/anime?sort=alphabetical')
    await expect(page.locator('select[name="sort"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply sort' })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
  }

  await signOut(page)
  await signIn(page, ownerB)
  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.locator('body')).toContainText(ownerBTitleSentinel)
  await expect(page.locator('body')).not.toContainText('M29 Favourite Alpha')
  await signOut(page)

  await signIn(page, ownerA)
  await page.goto('/archive/anime?sort=alphabetical')
  await expect(page.locator('body')).toContainText('M29 Favourite Alpha')
  await expect(page.locator('body')).not.toContainText(ownerBTitleSentinel)
  await signOut(page)

  assertNoUnexpectedBrowserErrors()
})
