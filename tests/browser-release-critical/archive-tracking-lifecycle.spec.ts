import { randomUUID } from 'node:crypto'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'
import { releaseCriticalApplicationOrigin } from './fixtures/release-critical-constants'
import {
  ReleaseCriticalDiagnostic,
  writeReleaseCriticalFailureDiagnostic,
} from './fixtures/diagnostic-manifest'
import { failReleaseCriticalIfRequested } from './fixtures/controlled-failure'
import {
  assertDynamicResponsePolicy,
  assertReleaseCriticalSecurityEvidence,
  assertAdversarialCspEvidenceUnchanged,
  installReleaseCriticalContextSecurityEvidence,
  installReleaseCriticalSecurityEvidence,
  snapshotAdversarialCspViolationEvidence,
} from './fixtures/response-policy'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })
test.describe.configure({ mode: 'serial' })

type RateLimitRow = Readonly<{
  id: string
  key: string
  count: number
  lastRequest: string
}>

type EntryState = Readonly<{
  count: number
  isFavourite: boolean | null
  progress: number | null
  personalTotal: number | null
  rating: number | null
  status: string | null
}>

const fixturePrefix = `m42-archive-${randomUUID()}`
const password = `M42-${randomUUID()}-${randomUUID()}`
const ownerA = {
  email: `${fixturePrefix}-owner-a@example.test`,
  username: `M42A${randomUUID().replaceAll('-', '').slice(0, 14)}`,
}
const ownerB = {
  email: `${fixturePrefix}-owner-b@example.test`,
  username: `M42B${randomUUID().replaceAll('-', '').slice(0, 14)}`,
}

const titles = {
  episodic: `${fixturePrefix} episodic lifecycle`,
  movie: `${fixturePrefix} ineligible movie`,
  favouriteAlpha: `${fixturePrefix} favourite alpha`,
  favouriteBravo: `${fixturePrefix} favourite bravo`,
  favouriteZulu: `${fixturePrefix} favourite zulu`,
  favouriteUnrated: `${fixturePrefix} favourite unrated`,
  normalTen: `${fixturePrefix} normal ten`,
  serial: `${fixturePrefix} serial removal`,
  origin: `${fixturePrefix} origin boundary`,
  hidden: `${fixturePrefix} hidden removal`,
  draft: `${fixturePrefix} draft removal`,
  adult: `${fixturePrefix} restricted adult sentinel`,
  ownerB: `${fixturePrefix} owner B sentinel`,
  laterPage: `${fixturePrefix} ZZZ zzz later-page removal`,
} as const

const rateLimitKeys = [
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
] as const

function exactTestDatabaseUrl(): string {
  const value = process.env.DATABASE_TEST_URL
  if (value === undefined || value.trim() !== value || value.length === 0) {
    throw new TypeError('M42 archive lifecycle requires DATABASE_TEST_URL')
  }
  const parsed = new URL(value)
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.pathname.slice(1) !== 'zedarchive_test'
  ) {
    throw new TypeError(
      'M42 archive lifecycle requires the exact zedarchive_test database',
    )
  }
  return value
}

const pool = new Pool({ connectionString: exactTestDatabaseUrl() })
const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []
const entryIds = new Map<string, string>()
const rateLimitBefore = new Map<string, RateLimitRow | null>()
const rateLimitExpected = new Map<string, RateLimitRow | null>()
const pendingRateLimitRequests = new Map<
  (typeof rateLimitKeys)[number],
  bigint
>()
let ownerAId = ''
let ownerBId = ''
let serialCatalogueItemId = ''
let poolClosed = false
const diagnostic = new ReleaseCriticalDiagnostic('archive tracking lifecycle')

test.beforeEach(async ({ page }) => {
  await installReleaseCriticalContextSecurityEvidence(page.context())
})

test.afterEach(async ({ page }, testInfo) => {
  await assertReleaseCriticalSecurityEvidence(page.context())
  await writeReleaseCriticalFailureDiagnostic(testInfo, diagnostic)
})

function assertExactTestDatabase(name: string | undefined): void {
  if (name !== 'zedarchive_test') {
    throw new TypeError('M42 archive fixture database target is not allowed')
  }
}

async function guardDatabase(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'> = pool,
): Promise<void> {
  const result = await queryable.query<{ name: string }>(
    'select current_database() as name',
  )
  assertExactTestDatabase(result.rows[0]?.name)
}

async function insertUser(owner: typeof ownerA): Promise<string> {
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  await pool.query(
    `insert into users (id, username, username_identity_key, email, email_verified)
     values ($1, $2, $3, $4, true)`,
    [id, owner.username, owner.username.toLowerCase(), owner.email],
  )
  fixtureUserIds.push(id)
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1, $2, $3, 'credential', $4)`,
    [randomUUID(), id, id, passwordHash],
  )
  return id
}

async function insertCatalogueItem(input: {
  title: string
  format?: 'movie' | 'tv'
  catalogueState?: 'draft' | 'hidden' | 'published'
  episodeCount?: number | null
  maturity?: 'adult' | 'safe'
}): Promise<string> {
  const id = randomUUID()
  await pool.query(
    `insert into anime_catalogue_items (
       id, english_title, romaji_title, original_title, format, release_status,
       release_year, episode_count, maturity, catalogue_state
     ) values ($1, $2, $3, $4, $5, 'finished', 2026, $6, $7, $8)`,
    [
      id,
      input.title,
      `${input.title} romaji`,
      `${input.title} original`,
      input.format ?? 'tv',
      input.episodeCount === undefined ? 12 : input.episodeCount,
      input.maturity ?? 'safe',
      input.catalogueState ?? 'published',
    ],
  )
  fixtureCatalogueItemIds.push(id)
  return id
}

function expectExactTrackedIds(
  rows: readonly { id: string }[],
  expectedIds: readonly string[],
): void {
  if (expectedIds.length === 0) return
  expect(rows.map(({ id }) => id).sort()).toEqual([...expectedIds].sort())
}

async function insertEntry(input: {
  title: string
  userId: string
  catalogueItemId: string
  status?: 'completed' | 'in_progress' | 'planned'
  episodeProgress?: number
  episodeTotalOverride?: number | null
  rating?: number | null
  isFavourite?: boolean
  createdAt?: Date
  updatedAt?: Date
}): Promise<string> {
  const id = randomUUID()
  const createdAt = input.createdAt ?? new Date('2026-07-29T09:00:00.000Z')
  const updatedAt = input.updatedAt ?? createdAt
  await pool.query(
    `insert into anime_entries (
       id, user_id, catalogue_item_id, status, episode_progress,
       episode_total_override, rating, is_favourite, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.userId,
      input.catalogueItemId,
      input.status ?? 'planned',
      input.episodeProgress ?? 0,
      input.episodeTotalOverride ?? null,
      input.rating ?? null,
      input.isFavourite ?? false,
      createdAt,
      updatedAt,
    ],
  )
  entryIds.set(input.title, id)
  return id
}

function cardForTitle(page: Page, title: string) {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .first()
}

function actionName(action: string, title: string): string {
  return `${action} — ${title}`
}

async function readRateLimits(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'> = pool,
): Promise<RateLimitRow[]> {
  const result = await queryable.query<RateLimitRow>(
    `select id, key, count, last_request::text as "lastRequest"
     from rate_limits where key = any($1::text[]) order by key`,
    [[...rateLimitKeys]],
  )
  return result.rows
}

function rateLimitFor(
  rows: readonly RateLimitRow[],
  key: (typeof rateLimitKeys)[number],
): RateLimitRow | null {
  return rows.find((row) => row.key === key) ?? null
}

async function snapshotRateLimits(): Promise<void> {
  const rows = await readRateLimits()
  for (const key of rateLimitKeys) {
    const row = rateLimitFor(rows, key)
    rateLimitBefore.set(key, row)
    rateLimitExpected.set(key, row)
  }
}

async function prepareRateLimitedRequest(
  key: (typeof rateLimitKeys)[number],
): Promise<bigint> {
  const expected = rateLimitExpected.get(key)
  if (expected === undefined) throw new Error('Rate limit was not snapshotted')
  expect(rateLimitFor(await readRateLimits(), key)).toEqual(expected)
  const minimumLastRequest = BigInt(Date.now())
  pendingRateLimitRequests.set(key, minimumLastRequest)
  if (expected === null) return minimumLastRequest

  const result = await pool.query<RateLimitRow>(
    `update rate_limits
     set count = 0, last_request = last_request - 61000
     where key = $1 and id = $2::uuid and count = $3 and last_request = $4::bigint
     returning id, key, count, last_request::text as "lastRequest"`,
    [key, expected.id, expected.count, expected.lastRequest],
  )
  const cleared = result.rows[0]
  if (result.rows.length !== 1 || cleared === undefined) {
    throw new Error('Rate limit changed before the lifecycle request')
  }
  rateLimitExpected.set(key, cleared)
  return minimumLastRequest
}

async function recordRateLimitedRequest(
  key: (typeof rateLimitKeys)[number],
  minimumLastRequest: bigint,
): Promise<void> {
  const expected = rateLimitExpected.get(key)
  if (expected === undefined) throw new Error('Rate limit was not prepared')
  const current = rateLimitFor(await readRateLimits(), key)
  if (current === null || current.count !== 1) {
    throw new Error('Lifecycle request did not produce the expected rate limit')
  }
  expect(BigInt(current.lastRequest)).toBeGreaterThanOrEqual(minimumLastRequest)
  if (expected !== null) {
    expect(current.id).toBe(expected.id)
    expect(BigInt(current.lastRequest)).toBeGreaterThan(
      BigInt(expected.lastRequest),
    )
  }
  rateLimitExpected.set(key, current)
  pendingRateLimitRequests.delete(key)
}

function rateLimitRowsMatch(
  left: RateLimitRow | null,
  right: RateLimitRow | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function settlePendingRateLimitRequests(
  client: PoolClient,
): Promise<void> {
  for (const [key, minimumLastRequest] of pendingRateLimitRequests) {
    const expected = rateLimitExpected.get(key)
    if (expected === undefined) {
      throw new TypeError('M42 archive rate-limit cleanup state is unavailable')
    }
    const current = rateLimitFor(await readRateLimits(client), key)
    if (rateLimitRowsMatch(current, expected)) {
      pendingRateLimitRequests.delete(key)
      continue
    }
    if (
      current !== null &&
      current.count === 1 &&
      BigInt(current.lastRequest) >= minimumLastRequest &&
      (expected === null || current.id === expected.id)
    ) {
      rateLimitExpected.set(key, current)
      pendingRateLimitRequests.delete(key)
      continue
    }
    throw new TypeError('M42 archive rate-limit cleanup CAS conflict')
  }
}

async function restoreRateLimits(client: PoolClient): Promise<void> {
  for (const key of rateLimitKeys) {
    const before = rateLimitBefore.get(key)
    const expected = rateLimitExpected.get(key)
    if (before === undefined || expected === undefined) continue
    if (before === null) {
      if (expected === null) continue
      const result = await client.query<RateLimitRow>(
        `delete from rate_limits
         where key = $1 and id = $2::uuid and count = $3 and last_request = $4::bigint
         returning id, key, count, last_request::text as "lastRequest"`,
        [key, expected.id, expected.count, expected.lastRequest],
      )
      if (result.rows.length !== 1) {
        throw new Error(
          'Lifecycle rate-limit cleanup found a concurrent change',
        )
      }
      continue
    }
    if (expected === null) {
      throw new Error('Lifecycle rate limit unexpectedly disappeared')
    }
    const result = await client.query<RateLimitRow>(
      `update rate_limits set id = $2::uuid, count = $3, last_request = $4::bigint
       where key = $1 and id = $5::uuid and count = $6 and last_request = $7::bigint
       returning id, key, count, last_request::text as "lastRequest"`,
      [
        key,
        before.id,
        before.count,
        before.lastRequest,
        expected.id,
        expected.count,
        expected.lastRequest,
      ],
    )
    if (
      result.rows.length !== 1 ||
      !rateLimitRowsMatch(result.rows[0] ?? null, before)
    ) {
      throw new TypeError('M42 archive rate-limit cleanup CAS conflict')
    }
  }
}

async function signIn(page: Page, owner: typeof ownerA): Promise<void> {
  await page.goto('/sign-in')
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(owner.email)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password)
  const minimumLastRequest = await prepareRateLimitedRequest(
    '127.0.0.1|/sign-in/email',
  )
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-in/email',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(200)
  await recordRateLimitedRequest('127.0.0.1|/sign-in/email', minimumLastRequest)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page): Promise<boolean> {
  const button = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await button.isVisible().catch(() => false))) return false
  const minimumLastRequest = await prepareRateLimitedRequest(
    '127.0.0.1|/sign-out',
  )
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-out',
  )
  await button.click()
  expect((await response).status()).toBe(200)
  await recordRateLimitedRequest('127.0.0.1|/sign-out', minimumLastRequest)
  return true
}

async function entryState(
  title: string,
  userId = ownerAId,
): Promise<EntryState> {
  const entryId = entryIds.get(title)
  if (entryId === undefined)
    throw new Error(`Missing entry fixture for ${title}`)
  const result = await pool.query<EntryState>(
    `select count(*)::int as count, bool_or(is_favourite) as "isFavourite",
       min(episode_progress)::int as progress,
       min(episode_total_override)::int as "personalTotal", min(rating)::float as rating,
       min(status) as status
     from anime_entries where id = $1::uuid and user_id = $2::uuid`,
    [entryId, userId],
  )
  return (
    result.rows[0] ?? {
      count: 0,
      isFavourite: null,
      progress: null,
      personalTotal: null,
      rating: null,
      status: null,
    }
  )
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

async function confirmRemoval(page: Page, title: string): Promise<void> {
  const card = cardForTitle(page, title)
  await card
    .getByRole('button', {
      name: actionName('Remove from archive', title),
      exact: true,
    })
    .click()
  const dialog = page.getByRole('dialog', {
    name: `Remove ${title} from your archive?`,
    exact: true,
  })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('button', {
      name: actionName('Remove from archive', title),
      exact: true,
    })
    .click()
  await expect(dialog).not.toBeVisible()
  await expect(card).toHaveCount(0)
}

async function cleanFixtureState(): Promise<void> {
  await guardDatabase()
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("set local lock_timeout = '2s'")
    await client.query("set local statement_timeout = '15s'")
    await guardDatabase(client)
    const lockedUsers = await client.query<{ id: string }>(
      'select id from users where id = any($1::uuid[]) order by id for update',
      [fixtureUserIds],
    )
    expectExactTrackedIds(lockedUsers.rows, fixtureUserIds)
    const lockedCatalogueItems = await client.query<{ id: string }>(
      `select id from anime_catalogue_items
       where id = any($1::uuid[]) order by id for update`,
      [fixtureCatalogueItemIds],
    )
    expectExactTrackedIds(lockedCatalogueItems.rows, fixtureCatalogueItemIds)
    const deletedUsers = await client.query<{ id: string }>(
      'delete from users where id = any($1::uuid[]) returning id',
      [fixtureUserIds],
    )
    expectExactTrackedIds(deletedUsers.rows, fixtureUserIds)
    const deletedCatalogueItems = await client.query<{ id: string }>(
      'delete from anime_catalogue_items where id = any($1::uuid[]) returning id',
      [fixtureCatalogueItemIds],
    )
    expectExactTrackedIds(deletedCatalogueItems.rows, fixtureCatalogueItemIds)
    await settlePendingRateLimitRequests(client)
    await restoreRateLimits(client)
    const residue = await client.query<{
      accounts: number
      alternatives: number
      catalogue: number
      entries: number
      sessions: number
      sources: number
      users: number
    }>(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from accounts where user_id = any($1::uuid[])) as accounts,
        (select count(*)::int from sessions where user_id = any($1::uuid[])) as sessions,
        (select count(*)::int from anime_entries where user_id = any($1::uuid[]) or catalogue_item_id = any($2::uuid[])) as entries,
        (select count(*)::int from anime_alternative_titles where catalogue_item_id = any($2::uuid[])) as alternatives,
        (select count(*)::int from anime_catalogue_sources where catalogue_item_id = any($2::uuid[])) as sources,
        (select count(*)::int from anime_catalogue_items where id = any($2::uuid[])) as catalogue`,
      [fixtureUserIds, fixtureCatalogueItemIds],
    )
    expect(residue.rows[0]).toEqual({
      accounts: 0,
      alternatives: 0,
      catalogue: 0,
      entries: 0,
      sessions: 0,
      sources: 0,
      users: 0,
    })
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

test.beforeAll(async () => {
  try {
    await guardDatabase()
    await snapshotRateLimits()
    ownerAId = await insertUser(ownerA)
    ownerBId = await insertUser(ownerB)

    const episodicItemId = await insertCatalogueItem({ title: titles.episodic })
    await insertEntry({
      title: titles.episodic,
      userId: ownerAId,
      catalogueItemId: episodicItemId,
      status: 'in_progress',
      episodeProgress: 1,
    })
    const movieItemId = await insertCatalogueItem({
      title: titles.movie,
      format: 'movie',
      episodeCount: null,
    })
    await insertEntry({
      title: titles.movie,
      userId: ownerAId,
      catalogueItemId: movieItemId,
    })

    const orderItems = [
      [titles.favouriteAlpha, true, 8],
      [titles.favouriteBravo, true, 8],
      [titles.favouriteZulu, true, 9],
      [titles.favouriteUnrated, true, null],
      [titles.normalTen, false, 10],
    ] as const
    for (const [title, isFavourite, rating] of orderItems) {
      const catalogueItemId = await insertCatalogueItem({ title })
      await insertEntry({
        title,
        userId: ownerAId,
        catalogueItemId,
        isFavourite,
        rating,
      })
    }

    serialCatalogueItemId = await insertCatalogueItem({ title: titles.serial })
    await pool.query(
      `insert into anime_alternative_titles (catalogue_item_id, title, position)
       values ($1, $2, 0)`,
      [serialCatalogueItemId, `${fixturePrefix}-serial-alternative`],
    )
    await pool.query(
      `insert into anime_catalogue_sources (
         catalogue_item_id, source_key, source_item_id
       ) values ($1, 'm42_archive', $2)`,
      [serialCatalogueItemId, `${fixturePrefix}-serial-source`],
    )
    const serialEntryId = await insertEntry({
      title: titles.serial,
      userId: ownerAId,
      catalogueItemId: serialCatalogueItemId,
      status: 'completed',
      episodeProgress: 7,
      episodeTotalOverride: 9,
      rating: 6.5,
      isFavourite: true,
    })
    await insertEntry({
      title: `${titles.serial} owner-b`,
      userId: ownerBId,
      catalogueItemId: serialCatalogueItemId,
    })
    expect(serialEntryId).toBe(entryIds.get(titles.serial))

    for (const [title, catalogueState] of [
      [titles.origin, 'published'],
      [titles.hidden, 'hidden'],
      [titles.draft, 'draft'],
    ] as const) {
      const catalogueItemId = await insertCatalogueItem({
        title,
        catalogueState,
      })
      await insertEntry({ title, userId: ownerAId, catalogueItemId })
    }
    const ownerBItemId = await insertCatalogueItem({ title: titles.ownerB })
    await insertEntry({
      title: titles.ownerB,
      userId: ownerBId,
      catalogueItemId: ownerBItemId,
    })

    for (const number of Array.from({ length: 13 }, (_, index) => index + 1)) {
      const title = `${fixturePrefix} ZZZ page filler ${String(number).padStart(2, '0')}`
      const catalogueItemId = await insertCatalogueItem({ title })
      await insertEntry({ title, userId: ownerAId, catalogueItemId })
    }
    const laterPageItemId = await insertCatalogueItem({
      title: titles.laterPage,
    })
    await insertEntry({
      title: titles.laterPage,
      userId: ownerAId,
      catalogueItemId: laterPageItemId,
    })
  } catch (error) {
    try {
      await cleanFixtureState()
    } finally {
      await pool.end()
      poolClosed = true
    }
    throw error
  }
})

test.afterAll(async () => {
  if (poolClosed) return
  try {
    await cleanFixtureState()
  } finally {
    await pool.end()
    poolClosed = true
  }
})

test('composes archive progress, rating, sorting, removal, owner isolation, and origin boundaries', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  let freshContext: BrowserContext | undefined
  let mainPageSignedIn = false
  let primaryError: unknown
  try {
    diagnostic.stage('setup')
    diagnostic.checkpoint('databaseGuarded')
    failReleaseCriticalIfRequested('archive-tracking')
    await signIn(page, ownerA)
    mainPageSignedIn = true
    diagnostic.checkpoint('signedIn')
    const archiveResponse = await page.goto('/archive/anime?sort=alphabetical')
    if (archiveResponse === null) {
      throw new TypeError('M44 archive response is unavailable')
    }
    await assertDynamicResponsePolicy(archiveResponse, {
      cache: 'private-no-store',
      contentType: 'html',
      status: 200,
    })
    expect(await archiveResponse.headerValue('cache-control')).toContain(
      'private',
    )
    expect(await archiveResponse.headerValue('cache-control')).toContain(
      'no-store',
    )
    const flightResponse = page.waitForResponse((response) => {
      const requestHeaders = response.request().headers()
      return (
        new URL(response.url()).pathname === '/settings' &&
        requestHeaders.rsc === '1' &&
        requestHeaders['next-router-prefetch'] === undefined &&
        requestHeaders.purpose?.toLowerCase() !== 'prefetch'
      )
    })
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    const resolvedFlightResponse = await flightResponse
    expect(await resolvedFlightResponse.request().headerValue('rsc')).toBe('1')
    expect(await resolvedFlightResponse.headerValue('content-type')).toContain(
      'text/x-component',
    )
    await assertDynamicResponsePolicy(resolvedFlightResponse, {
      cache: 'private-no-store',
      contentType: 'flight',
      status: 200,
    })
    await page.goto('/archive/anime?sort=alphabetical')

    await expect(
      cardForTitle(page, titles.movie).getByRole('button', {
        name: actionName('Edit progress', titles.movie),
        exact: true,
      }),
    ).toHaveCount(0)

    const episodicCard = cardForTitle(page, titles.episodic)
    await episodicCard
      .getByRole('button', {
        name: actionName('Edit progress', titles.episodic),
        exact: true,
      })
      .click()
    const progressForm = episodicCard.getByRole('form', {
      name: `Update episode progress for ${titles.episodic}`,
      exact: true,
    })
    await expect(progressForm).toBeVisible()
    await progressForm
      .getByRole('spinbutton', { name: 'Episodes watched', exact: true })
      .fill('-1')
    await progressForm
      .getByRole('button', {
        name: actionName('Save progress', titles.episodic),
        exact: true,
      })
      .click()
    const invalidProgress = episodicCard.getByRole('alert').filter({
      hasText: 'Enter a whole number of episodes, 0 or more.',
    })
    await expect(invalidProgress).toBeFocused()
    expect(await entryState(titles.episodic)).toEqual({
      count: 1,
      isFavourite: false,
      personalTotal: null,
      progress: 1,
      rating: null,
      status: 'in_progress',
    })

    await episodicCard
      .getByRole('button', {
        name: actionName('Set personal total', titles.episodic),
        exact: true,
      })
      .click()
    const totalForm = episodicCard.getByRole('form', {
      name: `Update personal episode total for ${titles.episodic}`,
      exact: true,
    })
    await totalForm
      .getByRole('spinbutton', { name: 'Personal episode total', exact: true })
      .fill('5')
    await totalForm
      .getByRole('button', {
        name: actionName('Save personal total', titles.episodic),
        exact: true,
      })
      .click()
    await expect(episodicCard.getByRole('status')).toContainText(
      'Your personal total is now 5 episodes.',
    )
    expect((await entryState(titles.episodic)).personalTotal).toBe(5)

    await episodicCard
      .getByRole('button', {
        name: actionName('Edit progress', titles.episodic),
        exact: true,
      })
      .click()
    await episodicCard
      .getByRole('spinbutton', { name: 'Episodes watched', exact: true })
      .fill('5')
    await episodicCard
      .getByRole('button', {
        name: actionName('Save progress', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard.getByRole('alert').filter({
        hasText:
          /You’ve reached the total of 5 episodes\. Mark this entry as Completed\?/u,
      }),
    ).toBeVisible()
    await episodicCard
      .getByRole('button', {
        name: actionName('Mark completed', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard.getByRole('status').filter({
        hasText: 'Progress updated to 5 episodes. Status updated to Completed.',
      }),
    ).toBeFocused()
    expect(await entryState(titles.episodic)).toEqual({
      count: 1,
      isFavourite: false,
      personalTotal: 5,
      progress: 5,
      rating: null,
      status: 'completed',
    })
    diagnostic.stage('archive-progress', '/archive/anime')
    diagnostic.checkpoint('progressConfirmed')

    await episodicCard
      .getByRole('button', {
        name: actionName('Edit progress', titles.episodic),
        exact: true,
      })
      .click()
    await episodicCard
      .getByRole('button', {
        name: actionName('Reset progress', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard.getByRole('alert').filter({
        hasText:
          'Reset progress to 0 episodes? Your personal total and status will stay the same.',
      }),
    ).toBeVisible()
    const resetConfirmation = episodicCard.getByRole('button', {
      name: actionName('Reset progress', titles.episodic),
      exact: true,
    })
    await expect(resetConfirmation).toBeFocused()
    await resetConfirmation.click()
    await expect(
      episodicCard.getByRole('status').filter({ hasText: 'Progress reset.' }),
    ).toBeFocused()
    expect(await entryState(titles.episodic)).toEqual({
      count: 1,
      isFavourite: false,
      personalTotal: 5,
      progress: 0,
      rating: null,
      status: 'completed',
    })

    await episodicCard
      .getByRole('button', {
        name: actionName('Set rating', titles.episodic),
        exact: true,
      })
      .click()
    await episodicCard
      .getByRole('spinbutton', { name: 'Rating', exact: true })
      .fill('7.5')
    await episodicCard
      .getByRole('button', {
        name: actionName('Save rating', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard
        .getByRole('status')
        .filter({ hasText: 'Rating updated to 7.5/10.' }),
    ).toBeFocused()
    expect((await entryState(titles.episodic)).rating).toBe(7.5)
    await episodicCard
      .getByRole('button', {
        name: actionName('Edit rating', titles.episodic),
        exact: true,
      })
      .click()
    await episodicCard
      .getByRole('spinbutton', { name: 'Rating', exact: true })
      .fill('8.0')
    await episodicCard
      .getByRole('button', {
        name: actionName('Save rating', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard
        .getByRole('status')
        .filter({ hasText: 'Rating updated to 8.0/10.' }),
    ).toBeFocused()
    expect((await entryState(titles.episodic)).rating).toBe(8)
    await episodicCard
      .getByRole('button', {
        name: actionName('Edit rating', titles.episodic),
        exact: true,
      })
      .click()
    await episodicCard
      .getByRole('button', {
        name: actionName('Remove rating', titles.episodic),
        exact: true,
      })
      .click()
    await expect(
      episodicCard.getByRole('status').filter({ hasText: 'Rating removed.' }),
    ).toBeFocused()
    expect((await entryState(titles.episodic)).rating).toBeNull()
    diagnostic.stage('archive-rating', '/archive/anime')
    diagnostic.checkpoint('ratingConfirmed')

    await page.goto('/archive/anime?sort=alphabetical')
    const headings = page.locator('article h2')
    await expect(headings.nth(0)).toHaveText(titles.favouriteAlpha)
    await page.locator('select[name="sort"]').selectOption('highest-rated')
    await expect(headings.nth(0)).toHaveText(titles.favouriteAlpha)
    await page.getByRole('button', { name: 'Apply sort', exact: true }).click()
    await expect(page).toHaveURL('/archive/anime?sort=highest-rated')
    for (const [index, title] of [
      titles.favouriteZulu,
      titles.favouriteAlpha,
      titles.favouriteBravo,
      titles.serial,
      titles.favouriteUnrated,
      titles.normalTen,
    ].entries()) {
      await expect(headings.nth(index)).toHaveText(title)
    }
    await page.reload()
    for (const [index, title] of [
      titles.favouriteZulu,
      titles.favouriteAlpha,
      titles.favouriteBravo,
      titles.serial,
      titles.favouriteUnrated,
      titles.normalTen,
    ].entries()) {
      await expect(headings.nth(index)).toHaveText(title)
    }
    diagnostic.stage('archive-sorting', '/archive/anime')
    diagnostic.checkpoint('sortConfirmed')

    freshContext = await browser.newContext({
      baseURL: releaseCriticalApplicationOrigin,
      extraHTTPHeaders: { 'x-vercel-forwarded-for': '127.0.0.1' },
    })
    await installReleaseCriticalContextSecurityEvidence(freshContext)
    const freshPage = await freshContext.newPage()
    await installReleaseCriticalSecurityEvidence(freshPage)
    await signIn(freshPage, ownerA)
    await freshPage.goto('/archive/anime')
    await expect(freshPage.locator('select[name="sort"]')).toHaveValue(
      'alphabetical',
    )
    await expect(freshPage.locator('article h2').first()).toHaveText(
      titles.favouriteAlpha,
    )
    await signOutIfSignedIn(freshPage)
    await assertReleaseCriticalSecurityEvidence(freshContext)
    await freshContext.close()
    freshContext = undefined

    await page.goto('/archive/anime?sort=alphabetical')
    await page.setExtraHTTPHeaders({
      'x-forwarded-host': 'm42-host-mismatch.invalid',
      origin: 'http://m42-origin-mismatch.invalid',
    })
    const originCspSnapshot =
      await snapshotAdversarialCspViolationEvidence(page)
    try {
      const originCard = cardForTitle(page, titles.origin)
      await originCard
        .getByRole('button', {
          name: actionName('Remove from archive', titles.origin),
          exact: true,
        })
        .click()
      const originDialog = page.getByRole('dialog', {
        name: `Remove ${titles.origin} from your archive?`,
        exact: true,
      })
      const rejectedOrigin = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/archive/anime',
      )
      await originDialog
        .getByRole('button', {
          name: actionName('Remove from archive', titles.origin),
          exact: true,
        })
        .click()
      const rejectedOriginResponse = await rejectedOrigin
      expect(rejectedOriginResponse.status()).toBeGreaterThanOrEqual(400)
      expect(rejectedOriginResponse.request().method()).toBe('POST')
      await expect(
        originDialog.getByRole('alert').filter({
          hasText: 'We couldn’t remove this entry right now. Try again.',
        }),
      ).toBeVisible()
      expect((await entryState(titles.origin)).count).toBe(1)
      diagnostic.checkpoint('originRejected')
    } finally {
      await page.setExtraHTTPHeaders({})
    }
    await assertAdversarialCspEvidenceUnchanged(page, originCspSnapshot)

    await page.goto('/archive/anime?sort=alphabetical&page=2')
    await expect(page.locator('article')).toHaveCount(1)
    await expect(cardForTitle(page, titles.laterPage)).toBeVisible()
    await confirmRemoval(page, titles.laterPage)
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

    await page.goto('/archive/anime?sort=alphabetical')
    const serialEntryId = entryIds.get(titles.serial)
    if (serialEntryId === undefined)
      throw new Error('Missing serial removal fixture')
    const serialBeforeCancellation = await entryState(titles.serial)
    const serialCard = cardForTitle(page, titles.serial)
    await serialCard
      .getByRole('button', {
        name: actionName('Remove from archive', titles.serial),
        exact: true,
      })
      .click()
    const cancellationDialog = page.getByRole('dialog', {
      name: `Remove ${titles.serial} from your archive?`,
      exact: true,
    })
    await cancellationDialog
      .getByRole('button', {
        name: actionName('Cancel removal', titles.serial),
        exact: true,
      })
      .click()
    await expect(cancellationDialog).not.toBeVisible()
    expect(await entryState(titles.serial)).toEqual(serialBeforeCancellation)

    let removalRequests = 0
    const countRemovalRequest = (
      request: import('@playwright/test').Request,
    ) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/archive/anime'
      ) {
        removalRequests += 1
      }
    }
    page.on('request', countRemovalRequest)
    const lock = await holdEntryLock(serialEntryId)
    try {
      await serialCard
        .getByRole('button', {
          name: actionName('Remove from archive', titles.serial),
          exact: true,
        })
        .click()
      const serialDialog = page.getByRole('dialog', {
        name: `Remove ${titles.serial} from your archive?`,
        exact: true,
      })
      const confirm = serialDialog.getByRole('button', {
        name: actionName('Remove from archive', titles.serial),
        exact: true,
      })
      await confirm.click()
      const pending = serialDialog.getByRole('button', {
        name: actionName('Removing…', titles.serial),
        exact: true,
      })
      await expect(pending).toBeDisabled()
      await pending.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('No removal button')
        button.click()
      })
    } finally {
      await lock.query('commit')
      lock.release()
    }
    await expect(cardForTitle(page, titles.serial)).toHaveCount(0)
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Anime removed from your archive.' }),
    ).toBeFocused()
    await expect(page).toHaveURL('/archive/anime?sort=alphabetical')
    expect(removalRequests).toBe(1)
    page.off('request', countRemovalRequest)
    expect((await entryState(titles.serial)).count).toBe(0)
    expect((await entryState(`${titles.serial} owner-b`, ownerBId)).count).toBe(
      1,
    )
    const sharedCatalogueEvidence = await pool.query<{
      alternatives: number
      catalogue: number
      ownerBEntries: number
      sources: number
    }>(
      `select
         (select count(*)::int from anime_catalogue_items where id = $1::uuid) as catalogue,
         (select count(*)::int from anime_alternative_titles where catalogue_item_id = $1::uuid) as alternatives,
         (select count(*)::int from anime_catalogue_sources where catalogue_item_id = $1::uuid) as sources,
         (select count(*)::int from anime_entries where catalogue_item_id = $1::uuid and user_id = $2::uuid) as "ownerBEntries"`,
      [serialCatalogueItemId, ownerBId],
    )
    expect(sharedCatalogueEvidence.rows[0]).toEqual({
      alternatives: 1,
      catalogue: 1,
      ownerBEntries: 1,
      sources: 1,
    })
    diagnostic.stage('archive-removal', '/archive/anime')
    diagnostic.checkpoint('removalConfirmed')

    const adultItemId = await insertCatalogueItem({
      title: titles.adult,
      maturity: 'adult',
    })
    await insertEntry({
      title: titles.adult,
      userId: ownerAId,
      catalogueItemId: adultItemId,
    })
    await page.goto('/archive/anime?sort=alphabetical')
    await expect(page.getByText(titles.adult, { exact: true })).toHaveCount(0)
    const restrictedCard = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Restricted anime',
        exact: true,
      }),
    })
    await expect(restrictedCard).toBeVisible()
    await expect(restrictedCard.locator('button, input, dialog')).toHaveCount(0)

    await confirmRemoval(page, titles.hidden)
    await confirmRemoval(page, titles.draft)
    await expect(page).toHaveURL('/archive/anime?sort=alphabetical')

    await signOutIfSignedIn(page)
    mainPageSignedIn = false
    await signIn(page, ownerB)
    mainPageSignedIn = true
    await page.goto('/archive/anime?sort=alphabetical')
    await expect(page.locator('body')).toContainText(titles.ownerB)
    await expect(cardForTitle(page, titles.serial)).toBeVisible()
    await expect(page.locator('body')).not.toContainText(titles.episodic)
    await signOutIfSignedIn(page)
    mainPageSignedIn = false

    await signIn(page, ownerA)
    mainPageSignedIn = true
    await page.goto('/archive/anime?sort=alphabetical')
    await expect(page.locator('body')).toContainText(titles.episodic)
    await expect(page.locator('body')).not.toContainText(titles.ownerB)
    diagnostic.checkpoint('ownerIsolationConfirmed')
    await signOutIfSignedIn(page)
    mainPageSignedIn = false
    const signedOutArchiveResponse = await page.goto(
      '/archive/anime?sort=alphabetical',
    )
    expect(signedOutArchiveResponse?.status()).toBe(200)
    expect(
      await signedOutArchiveResponse?.headerValue('cache-control'),
    ).toContain('private')
    expect(
      await signedOutArchiveResponse?.headerValue('cache-control'),
    ).toContain('no-store')
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Remove from archive — /u }),
    ).toHaveCount(0)
    await expect(page.locator('input[name="entryId"], dialog')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(titles.episodic)
    await expect(page.locator('body')).not.toContainText(titles.ownerB)
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      if (mainPageSignedIn) {
        await signOutIfSignedIn(page)
        mainPageSignedIn = false
      }
      await freshContext?.close()
      diagnostic.cleanup('passed')
    } catch {
      diagnostic.cleanup('failed')
      if (primaryError === undefined) {
        diagnostic.stage('cleanup')
        throw new TypeError('M42 archive lifecycle cleanup failed')
      }
    }
  }
})
