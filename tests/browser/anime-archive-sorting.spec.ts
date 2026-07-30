import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'
import {
  applyWcagTextSpacing,
  expectNoDocumentHorizontalOverflow,
  expectRepresentativeAccessibilityBasics,
  expectTargetAtLeast24Px,
  expectTextSpacingLayout,
} from './helpers/accessibility'

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
const authRateLimitWindowMilliseconds = 60_000

const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []
type RateLimitSnapshot = Readonly<{
  count: number
  id: string
  key: string
  lastRequest: string
}>
type RateLimitRequestExpectation = Readonly<{
  minimumLastRequest: bigint
}>

const sharedAuthRateLimitKeys = [
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
] as const
const sharedAuthRateLimitBefore = new Map<string, RateLimitSnapshot | null>()
const sharedAuthRateLimitExpected = new Map<string, RateLimitSnapshot | null>()
let fixtureCleanupCompleted = false
let poolClosed = false

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

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
  }
}

async function snapshotSharedAuthRateLimits() {
  const result = await pool.query<RateLimitSnapshot>(
    `
      select id, key, count, last_request::text as "lastRequest"
      from rate_limits
      where key = any($1::text[])
      order by key
    `,
    [sharedAuthRateLimitKeys],
  )

  return result.rows
}

function getSharedAuthRateLimit(
  rows: RateLimitSnapshot[],
  key: (typeof sharedAuthRateLimitKeys)[number],
) {
  return rows.find((row) => row.key === key) ?? null
}

function hasSharedAuthRateLimitExpired(
  rateLimit: RateLimitSnapshot,
  now = BigInt(Date.now()),
) {
  return (
    now >=
    BigInt(rateLimit.lastRequest) + BigInt(authRateLimitWindowMilliseconds)
  )
}

async function prepareSharedAuthRateLimits() {
  const snapshot = await snapshotSharedAuthRateLimits()

  for (const key of sharedAuthRateLimitKeys) {
    const before = getSharedAuthRateLimit(snapshot, key)
    sharedAuthRateLimitBefore.set(key, before)
    sharedAuthRateLimitExpected.set(key, before)
  }
}

async function prepareSharedAuthRateLimitRequest(
  key: (typeof sharedAuthRateLimitKeys)[number],
): Promise<RateLimitRequestExpectation> {
  const expected = sharedAuthRateLimitExpected.get(key)
  if (expected === undefined) {
    throw new Error('Shared authentication rate limit was not prepared')
  }

  const current = getSharedAuthRateLimit(
    await snapshotSharedAuthRateLimits(),
    key,
  )
  const minimumLastRequest = BigInt(Date.now())
  if (
    current === null &&
    expected !== null &&
    hasSharedAuthRateLimitExpired(expected, minimumLastRequest)
  ) {
    sharedAuthRateLimitExpected.set(key, null)
    return { minimumLastRequest }
  }
  expect(current).toEqual(expected)
  if (expected === null) return { minimumLastRequest }

  const cleared = await pool.query<RateLimitSnapshot>(
    `
      update rate_limits
      set count = 0, last_request = last_request - 61_000
      where key = $1
        and id = $2::uuid
        and count = $3
        and last_request = $4::bigint
      returning id, key, count, last_request::text as "lastRequest"
    `,
    [key, expected.id, expected.count, expected.lastRequest],
  )
  expect(cleared.rows).toHaveLength(1)
  const [currentAfterClear] = cleared.rows
  if (currentAfterClear === undefined) {
    throw new Error('Shared authentication rate limit changed before request')
  }
  sharedAuthRateLimitExpected.set(key, currentAfterClear)
  return { minimumLastRequest }
}

async function recordSharedAuthRateLimit(
  key: (typeof sharedAuthRateLimitKeys)[number],
  request: RateLimitRequestExpectation,
) {
  const expected = sharedAuthRateLimitExpected.get(key)
  if (expected === undefined) {
    throw new Error('Shared authentication rate limit was not prepared')
  }

  const current = getSharedAuthRateLimit(
    await snapshotSharedAuthRateLimits(),
    key,
  )
  if (current === null) {
    throw new Error('Authentication request did not create its rate limit')
  }
  expect(current.count).toBe(1)
  expect(BigInt(current.lastRequest)).toBeGreaterThanOrEqual(
    request.minimumLastRequest,
  )
  if (expected !== null) {
    expect(current.id).toBe(expected.id)
    expect(BigInt(current.lastRequest)).toBeGreaterThan(
      BigInt(expected.lastRequest),
    )
  }
  sharedAuthRateLimitExpected.set(key, current)
}

async function restoreSharedAuthRateLimits() {
  for (const key of sharedAuthRateLimitKeys) {
    const before = sharedAuthRateLimitBefore.get(key)
    const expected = sharedAuthRateLimitExpected.get(key)
    if (before === undefined || expected === undefined) continue

    const current = getSharedAuthRateLimit(
      await snapshotSharedAuthRateLimits(),
      key,
    )

    if (before === null) {
      if (current === null) continue
      if (
        expected === null ||
        JSON.stringify(current) !== JSON.stringify(expected)
      ) {
        throw new Error('Shared authentication rate limit changed during test')
      }

      const deleted = await pool.query<RateLimitSnapshot>(
        `
          delete from rate_limits
          where key = $1
            and id = $2::uuid
            and count = $3
            and last_request = $4::bigint
          returning id, key, count, last_request::text as "lastRequest"
        `,
        [key, expected.id, expected.count, expected.lastRequest],
      )
      expect(deleted.rows).toEqual([expected])
      continue
    }

    if (current === null) {
      if (expected === null || !hasSharedAuthRateLimitExpired(expected)) {
        throw new Error('Shared authentication rate limit changed during test')
      }
      const restored = await pool.query<RateLimitSnapshot>(
        `
          insert into rate_limits (id, key, count, last_request)
          values ($1::uuid, $2, $3, $4::bigint)
          on conflict (key) do nothing
          returning id, key, count, last_request::text as "lastRequest"
        `,
        [before.id, key, before.count, before.lastRequest],
      )
      expect(restored.rows).toEqual([before])
      continue
    }

    if (
      expected === null ||
      JSON.stringify(current) !== JSON.stringify(expected)
    ) {
      throw new Error('Shared authentication rate limit changed during test')
    }

    const restored = await pool.query<RateLimitSnapshot>(
      `
        update rate_limits
        set id = $2::uuid, count = $3, last_request = $4::bigint
        where key = $1
          and id = $5::uuid
          and count = $6
          and last_request = $7::bigint
        returning id, key, count, last_request::text as "lastRequest"
      `,
      [
        key,
        before.id,
        before.count,
        before.lastRequest,
        current.id,
        current.count,
        current.lastRequest,
      ],
    )
    expect(restored.rows).toEqual([before])
  }

  const restored = await snapshotSharedAuthRateLimits()
  expect(restored).toEqual(
    sharedAuthRateLimitKeys.flatMap((key) => {
      const before = sharedAuthRateLimitBefore.get(key)
      return before === null || before === undefined ? [] : [before]
    }),
  )
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
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(owner.email)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password)
  const rateLimitRequest = await prepareSharedAuthRateLimitRequest(
    '127.0.0.1|/sign-in/email',
  )
  const signInResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-in/email',
    { timeout: 5_000 },
  )
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .click({ timeout: 5_000 })
  expect((await signInResponse).status()).toBe(200)
  await recordSharedAuthRateLimit('127.0.0.1|/sign-in/email', rateLimitRequest)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOut(page: Page) {
  const rateLimitRequest = await prepareSharedAuthRateLimitRequest(
    '127.0.0.1|/sign-out',
  )
  const signOutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-out',
    { timeout: 5_000 },
  )
  await page
    .getByRole('button', { name: 'Sign out', exact: true })
    .click({ timeout: 5_000 })
  expect((await signOutResponse).status()).toBe(200)
  await recordSharedAuthRateLimit('127.0.0.1|/sign-out', rateLimitRequest)
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
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  const select = page.locator('select[name="sort"]')
  await select.selectOption(sort)
  await expect(select).toHaveValue(sort)
  expect(
    await select.evaluate((element) => {
      if (!(element instanceof HTMLSelectElement) || element.form === null) {
        return null
      }
      return new FormData(element.form).get('sort')
    }),
  ).toBe(sort)
  await page.getByRole('button', { name: 'Apply sort' }).click()
  await expect(page).toHaveURL(`/archive/anime?sort=${sort}`)
}

async function expectLeadingTitles(page: Page, expectedTitles: string[]) {
  const headings = page.locator('article h2')

  for (const [index, expectedTitle] of expectedTitles.entries()) {
    await expect(headings.nth(index)).toHaveText(expectedTitle)
  }
}

function cardForTitle(page: Page, title: string) {
  return page
    .locator('article')
    .filter({
      has: page.getByRole('heading', { name: title, exact: true }),
    })
    .first()
}

async function expectArchiveGridColumns(page: Page, expectedColumns: number) {
  const grid = page
    .locator('ul.grid')
    .filter({ has: page.locator('article') })
    .first()

  await expect(grid).toBeVisible()
  expect(
    await grid.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean)
          .length,
    ),
  ).toBe(expectedColumns)
  expect(
    await grid.evaluate((element) =>
      element.parentElement?.classList.contains('za-card'),
    ),
  ).toBe(false)
}

async function expectRaisedOrdinaryArchiveCard(page: Page, title: string) {
  const card = cardForTitle(page, title)

  await expect(card).toHaveClass(/\bza-archive-card\b/)
  await expect(card).toHaveClass(/\bza-card--raised\b/)
  expect(
    await card.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none')
}

async function cleanupFixtureState() {
  if (fixtureCleanupCompleted) return

  const databaseResult = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

  let cleanupError: unknown
  try {
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
  } catch (error) {
    cleanupError = error
  }

  try {
    await restoreSharedAuthRateLimits()
  } catch (error) {
    cleanupError ??= error
  }

  if (cleanupError !== undefined) throw cleanupError
  fixtureCleanupCompleted = true
}

test.beforeAll(async () => {
  try {
    const databaseResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)
    await prepareSharedAuthRateLimits()

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
  } catch (error) {
    let cleanupError: unknown
    try {
      await cleanupFixtureState()
    } catch (candidate) {
      cleanupError = candidate
    } finally {
      await pool.end()
      poolClosed = true
    }
    throw cleanupError ?? error
  }
})

test.afterAll(async () => {
  if (poolClosed) return

  try {
    await cleanupFixtureState()
  } finally {
    await pool.end()
    poolClosed = true
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

  await expectRepresentativeAccessibilityBasics(page)
  await expect(
    page.getByRole('link', { name: 'My anime', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expectTargetAtLeast24Px(page.locator('select[name="sort"]'))
  await expectTargetAtLeast24Px(
    page.getByRole('button', { name: 'Apply sort', exact: true }),
  )
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expectNoDocumentHorizontalOverflow(page)
  await applyWcagTextSpacing(page)
  await expectTextSpacingLayout(page, {
    content: [
      page.getByRole('heading', { name: 'Your anime archive', exact: true }),
      page.locator('article').first().getByRole('heading'),
    ],
    controls: [
      page.locator('select[name="sort"]'),
      page.getByRole('button', { name: 'Apply sort', exact: true }),
    ],
  })
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
  const restrictedCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Restricted anime' }) })
    .first()
  await expect(restrictedCard).toHaveClass(/\bza-card--restricted\b/)
  expect(
    await restrictedCard.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).toBe('none')
  await expect(restrictedCard.locator('[aria-hidden="true"]')).toHaveCount(0)
  await expect(
    restrictedCard.locator('form, input, button, dialog'),
  ).toHaveCount(0)
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
    { width: 320, height: 568, columns: 1 },
    { width: 390, height: 844, columns: 1 },
    { width: 768, height: 1024, columns: 2 },
    { width: 1280, height: 960, columns: 3 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/archive/anime?sort=alphabetical')
    const masthead = page.locator('main#main-content > header').first()
    const sortForm = page.locator('form[action="/archive/anime"]').first()
    await expect(masthead).toHaveClass(/\bza-card--raised\b/)
    await expect(sortForm).toHaveClass(/\bza-card--raised\b/)
    await expect(page.locator('select[name="sort"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply sort' })).toBeVisible()
    await expectArchiveGridColumns(page, viewport.columns)
    await expectRaisedOrdinaryArchiveCard(page, 'M29 Favourite Alpha')
    await expect(
      cardForTitle(page, 'M29 Favourite Alpha').locator('.za-title-tile'),
    ).toHaveCSS('aspect-ratio', '2 / 3')
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)
  }

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/archive/anime?sort=alphabetical')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expectArchiveGridColumns(page, 1)
  await expectRaisedOrdinaryArchiveCard(page, 'M29 Favourite Alpha')
  await expect
    .poll(() =>
      page
        .locator('main#main-content')
        .first()
        .evaluate((main) => main.scrollWidth <= main.clientWidth),
    )
    .toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })

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
