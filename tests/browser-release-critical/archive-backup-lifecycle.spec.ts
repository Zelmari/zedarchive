import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'
import {
  auditAndDeleteArchiveBackupDownload,
  type ArchiveBackupDownload,
} from './fixtures/archive-backup-auditor'
import {
  ReleaseCriticalDiagnostic,
  writeReleaseCriticalFailureDiagnostic,
} from './fixtures/diagnostic-manifest'
import { failReleaseCriticalIfRequested } from './fixtures/controlled-failure'

test.use({
  acceptDownloads: true,
  screenshot: 'off',
  trace: 'off',
  video: 'off',
})
test.describe.configure({ mode: 'serial' })

const marker = randomUUID().replaceAll('-', '')
const password = `M42-${randomUUID()}-${randomUUID()}`
const databaseUrl = requireExactTestDatabaseUrl()
const pool = new Pool({ connectionString: databaseUrl })
const authRateLimitWindowMilliseconds = 60_000
const rateLimitKeys = [
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
] as const

type Owner = Readonly<{ email: string; username: string }>
type RateLimitSnapshot = Readonly<{
  id: string
  key: string
  count: number
  lastRequest: string
}>

const ownerA: Owner = {
  email: `m42-backup-${marker}-a@example.test`,
  username: `M42BackupA${marker.slice(0, 10)}`,
}
const ownerB: Owner = {
  email: `m42-backup-${marker}-b@example.test`,
  username: `M42BackupB${marker.slice(0, 10)}`,
}
const pendingOwner: Owner = {
  email: `m42-backup-${marker}-pending@example.test`,
  username: `M42BackupP${marker.slice(0, 10)}`,
}
const dueOwner: Owner = {
  email: `m42-backup-${marker}-due@example.test`,
  username: `M42BackupD${marker.slice(0, 10)}`,
}
const titles = {
  aAdult: `M42 ${marker} adult archive`,
  aSafe: `M42 ${marker} safe archive`,
  b: `M42 ${marker} owner b`,
  source: `m42-${marker}-source`,
} as const

const allPrivateSentinels = [
  titles.aSafe,
  titles.aAdult,
  titles.b,
  titles.source,
  ownerA.email,
  ownerA.username,
  ownerB.email,
  ownerB.username,
  password,
] as const

const settingsFlightProhibitedSentinels = [
  titles.aSafe,
  titles.aAdult,
  titles.b,
  titles.source,
  ownerB.email,
  ownerB.username,
  password,
] as const

const userIds = new Map<Owner, string>()
const catalogueItemIds: string[] = []
let originalRateLimitSnapshot: RateLimitSnapshot[] = []
let expectedRateLimits: RateLimitSnapshot[] = []
let rateLimitSnapshotTaken = false
const preparedRateLimitTransitions = new Map<
  (typeof rateLimitKeys)[number],
  Readonly<{ prior: RateLimitSnapshot | undefined; requestStartedAt: number }>
>()
const diagnostic = new ReleaseCriticalDiagnostic('archive backup lifecycle')

function requireExactTestDatabaseUrl(): string {
  const value = process.env.DATABASE_TEST_URL
  if (value === undefined || value.trim() === '' || value !== value.trim()) {
    throw new TypeError('M42 backup requires DATABASE_TEST_URL')
  }
  const parsed = new URL(value)
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.pathname.slice(1) !== 'zedarchive_test'
  ) {
    throw new TypeError('M42 backup requires exact zedarchive_test')
  }
  return value
}

async function guardDatabase(queryable: Pick<Pool, 'query'> | PoolClient) {
  const result = await queryable.query<{ name: string }>(
    'select current_database() as name',
  )
  if (result.rows[0]?.name !== 'zedarchive_test') {
    throw new TypeError('M42 backup fixture target is not allowed')
  }
}

async function createUser(owner: Owner): Promise<string> {
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  await pool.query(
    `insert into users (id, username, username_identity_key, email, email_verified)
     values ($1::uuid, $2, $3, $4, true)`,
    [id, owner.username, owner.username.toLowerCase(), owner.email],
  )
  userIds.set(owner, id)
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1::uuid, $2::uuid, $2::uuid, 'credential', $3)`,
    [randomUUID(), id, passwordHash],
  )
  return id
}

async function createCatalogueItem(input: {
  title: string
  maturity: 'adult' | 'safe'
  state: 'hidden' | 'published'
}): Promise<string> {
  const id = randomUUID()
  await pool.query(
    `insert into anime_catalogue_items
       (id, english_title, format, release_status, release_year, episode_count,
        maturity, catalogue_state)
     values ($1::uuid, $2, 'tv', 'finished', 2026, 12, $3, $4)`,
    [id, input.title, input.maturity, input.state],
  )
  catalogueItemIds.push(id)
  return id
}

async function createEntry(
  userId: string,
  catalogueItemId: string,
  status: 'completed' | 'planned',
) {
  await pool.query(
    `insert into anime_entries (id, user_id, catalogue_item_id, status,
       episode_progress, rating, is_favourite)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 3, 8.5, false)`,
    [randomUUID(), userId, catalogueItemId, status],
  )
}

async function readRateLimits(
  queryable: Pick<Pool, 'query'> | PoolClient = pool,
): Promise<RateLimitSnapshot[]> {
  const result = await queryable.query<RateLimitSnapshot>(
    `select id, key, count, last_request::text as "lastRequest"
       from rate_limits
      where key = any($1::text[])
      order by key`,
    [[...rateLimitKeys]],
  )
  return result.rows
}

function expectedRateLimitFor(key: (typeof rateLimitKeys)[number]) {
  return expectedRateLimits.find((row) => row.key === key)
}

function replaceExpectedRateLimit(
  key: (typeof rateLimitKeys)[number],
  next: RateLimitSnapshot | undefined,
) {
  expectedRateLimits = expectedRateLimits.filter((row) => row.key !== key)
  if (next !== undefined) expectedRateLimits.push(next)
  expectedRateLimits.sort((left, right) => left.key.localeCompare(right.key))
}

function hasRateLimitExpired(rateLimit: RateLimitSnapshot, now = Date.now()) {
  return now >= Number(rateLimit.lastRequest) + authRateLimitWindowMilliseconds
}

async function prepareRateLimit(key: (typeof rateLimitKeys)[number]) {
  let expected = expectedRateLimitFor(key)
  const current = (await readRateLimits()).find((row) => row.key === key)
  const requestStartedAt = Date.now()
  if (
    current === undefined &&
    expected !== undefined &&
    hasRateLimitExpired(expected, requestStartedAt)
  ) {
    replaceExpectedRateLimit(key, undefined)
    expected = undefined
  }
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new TypeError(
      'M42 backup encountered concurrent auth rate-limit state',
    )
  }
  preparedRateLimitTransitions.set(key, { prior: current, requestStartedAt })
  if (current === undefined) return
  const agedLastRequest = String(requestStartedAt - 60_000)
  const cleared = await pool.query<{ id: string }>(
    `update rate_limits set count = 0, last_request = $5::bigint
      where id = $1::uuid and key = $2 and count = $3 and last_request::text = $4
      returning id`,
    [
      current.id,
      current.key,
      current.count,
      current.lastRequest,
      agedLastRequest,
    ],
  )
  if (cleared.rows.length !== 1) {
    throw new TypeError('M42 backup could not prepare exact auth rate limit')
  }
  replaceExpectedRateLimit(key, {
    ...current,
    count: 0,
    lastRequest: agedLastRequest,
  })
}

async function captureRateLimitTransition(key: (typeof rateLimitKeys)[number]) {
  const current = (await readRateLimits()).find((row) => row.key === key)
  const prepared = preparedRateLimitTransitions.get(key)
  if (
    current === undefined ||
    prepared === undefined ||
    current.count !== 1 ||
    Number(current.lastRequest) < prepared.requestStartedAt ||
    (prepared.prior !== undefined &&
      (current.id !== prepared.prior.id ||
        Number(current.lastRequest) <= prepared.requestStartedAt - 60_000))
  ) {
    throw new TypeError(
      'M42 backup did not observe expected auth rate transition',
    )
  }
  preparedRateLimitTransitions.delete(key)
  replaceExpectedRateLimit(key, current)
}

function rateLimitRowsMatch(
  left: RateLimitSnapshot | undefined,
  right: RateLimitSnapshot | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function settlePendingRateLimitRequests(
  client: PoolClient,
): Promise<void> {
  for (const [key, prepared] of preparedRateLimitTransitions) {
    const expected = expectedRateLimits.find((row) => row.key === key)
    const current = (await readRateLimits(client)).find(
      (row) => row.key === key,
    )
    if (rateLimitRowsMatch(current, expected)) {
      preparedRateLimitTransitions.delete(key)
      continue
    }
    if (
      current === undefined &&
      expected !== undefined &&
      hasRateLimitExpired(expected)
    ) {
      replaceExpectedRateLimit(key, undefined)
      preparedRateLimitTransitions.delete(key)
      continue
    }
    if (
      current !== undefined &&
      current.count === 1 &&
      Number(current.lastRequest) >= prepared.requestStartedAt &&
      (prepared.prior === undefined || current.id === prepared.prior.id)
    ) {
      replaceExpectedRateLimit(key, current)
      preparedRateLimitTransitions.delete(key)
      continue
    }
    throw new TypeError('M42 backup rate-limit cleanup CAS conflict')
  }
}

function authenticationResponse(page: Page, pathname: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === pathname,
    { timeout: 5_000 },
  )
}

async function signIn(
  page: Page,
  owner: Owner,
  expectedAccess: 'active' | 'recoverable' | 'due' = 'active',
) {
  await prepareRateLimit('127.0.0.1|/sign-in/email')
  await page.goto('/sign-in')
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(owner.email)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password)
  const response = authenticationResponse(page, '/api/auth/sign-in/email')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(200)
  await captureRateLimitTransition('127.0.0.1|/sign-in/email')
  if (expectedAccess === 'active') {
    await expect(page.getByText('Signed in as')).toBeVisible()
    return
  }
  const restrictedHeading =
    expectedAccess === 'recoverable'
      ? 'Account deletion requested'
      : 'Recovery period ended'
  await page.waitForURL('/account/deletion')
  await expect(
    page.getByRole('heading', { name: restrictedHeading, exact: true }),
  ).toBeVisible()
}

async function signOut(page: Page): Promise<boolean> {
  const button = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await button.isVisible().catch(() => false))) return false
  await prepareRateLimit('127.0.0.1|/sign-out')
  const response = authenticationResponse(page, '/api/auth/sign-out')
  await button.click({ timeout: 5_000 })
  expect((await response).status()).toBe(200)
  await captureRateLimitTransition('127.0.0.1|/sign-out')
  return true
}

async function stabilizeActiveSettings(page: Page): Promise<void> {
  const response = await page.goto('/settings')
  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Archive data', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'Download archive backup (JSON)',
      exact: true,
    }),
  ).toBeVisible()
}

function expectExactTrackedIds(
  rows: readonly { id: string }[],
  expectedIds: readonly string[],
): void {
  expect(rows.map(({ id }) => id).sort()).toEqual([...expectedIds].sort())
}

async function excludesPrivateSentinels(
  response: Readonly<{ body(): Promise<Buffer> }>,
  sentinels: readonly string[],
): Promise<boolean> {
  try {
    const bytes = await response.body()
    if (bytes.byteLength > 256 * 1024) return false
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return sentinels.every((sentinel) => !body.includes(sentinel))
  } catch {
    return false
  }
}

async function settingsFlightResponse(page: Page) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Network.enable')
    await session.send('Network.setExtraHTTPHeaders', { headers: { rsc: '1' } })
    const response = await page.goto('/settings')
    if (response === null) {
      throw new TypeError('M42 settings Flight response is unavailable')
    }
    return response
  } finally {
    await session.send('Network.setExtraHTTPHeaders', { headers: {} })
    await session.send('Network.disable')
    await session.detach()
  }
}

function isExpectedDownloadNavigationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('ERR_ABORTED') ||
      error.message.includes('Download is starting'))
  )
}

async function fixtureFingerprint() {
  const result = await pool.query<{ fingerprint: string }>(
    `select md5(concat_ws('|',
      (select coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id), '') from users u where u.id = any($1::uuid[])),
      (select coalesce(string_agg(to_jsonb(e)::text, ',' order by e.id), '') from anime_entries e where e.user_id = any($1::uuid[])),
      (select coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id), '') from anime_catalogue_items c where c.id = any($2::uuid[])),
      (select coalesce(string_agg(to_jsonb(s)::text, ',' order by s.catalogue_item_id), '') from anime_catalogue_sources s where s.catalogue_item_id = any($2::uuid[]))
    )) as fingerprint`,
    [[...userIds.values()], catalogueItemIds],
  )
  return result.rows[0]?.fingerprint
}

function asArchiveBackupDownload(download: Download): ArchiveBackupDownload {
  return {
    createReadStream: () => download.createReadStream(),
    delete: () => download.delete(),
  }
}

async function assertBackupDownload(
  download: Download,
  expectation: Readonly<{
    entryCount: number
    requiredTitles: readonly string[]
    prohibitedText: readonly string[]
  }> = {
    entryCount: 2,
    requiredTitles: [titles.aSafe, titles.aAdult],
    prohibitedText: [
      titles.b,
      titles.source,
      ownerA.email,
      ownerA.username,
      ownerB.email,
      ownerB.username,
      password,
      'catalogueItemId',
      'userId',
      'source_key',
    ],
  },
) {
  const audit = await auditAndDeleteArchiveBackupDownload(
    asArchiveBackupDownload(download),
    {
      expectedEntryCount: expectation.entryCount,
      requiredEnglishTitles: expectation.requiredTitles,
      prohibitedText: expectation.prohibitedText,
    },
  )
  expect(audit).toMatchObject({
    entryCount: expectation.entryCount,
    prohibitedTextAbsent: true,
    requiredTitlesPresent: true,
    strictSchemaValid: true,
  })
  expect(audit.byteCount).toBeGreaterThan(0)
}

test.beforeAll(async () => {
  await guardDatabase(pool)
  originalRateLimitSnapshot = await readRateLimits()
  expectedRateLimits = [...originalRateLimitSnapshot]
  rateLimitSnapshotTaken = true
  const ownerAId = await createUser(ownerA)
  const ownerBId = await createUser(ownerB)
  const pendingId = await createUser(pendingOwner)
  const dueId = await createUser(dueOwner)
  const safeItem = await createCatalogueItem({
    title: titles.aSafe,
    maturity: 'safe',
    state: 'published',
  })
  const adultItem = await createCatalogueItem({
    title: titles.aAdult,
    maturity: 'adult',
    state: 'hidden',
  })
  const bItem = await createCatalogueItem({
    title: titles.b,
    maturity: 'safe',
    state: 'hidden',
  })
  await createEntry(ownerAId, safeItem, 'planned')
  await createEntry(ownerAId, adultItem, 'completed')
  await createEntry(ownerBId, bItem, 'planned')
  await pool.query(
    `insert into anime_catalogue_sources (catalogue_item_id, source_key, source_item_id)
     values ($1::uuid, 'fixture', $2)`,
    [safeItem, titles.source],
  )
  const now = new Date()
  await pool.query(
    `insert into account_deletion_requests (user_id, requested_at, purge_after)
     values ($1::uuid, $3::timestamptz, $4::timestamptz),
            ($2::uuid, $5::timestamptz, $6::timestamptz)`,
    [
      pendingId,
      dueId,
      now,
      new Date(now.getTime() + 336 * 60 * 60 * 1_000),
      new Date(now.getTime() - 337 * 60 * 60 * 1_000),
      new Date(now.getTime() - 60 * 60 * 1_000),
    ],
  )
})

test.afterEach(async ({}, testInfo) => {
  const outputEntries = await readdir(testInfo.outputDir).catch(() => [])
  expect(outputEntries).toEqual([])
  await writeReleaseCriticalFailureDiagnostic(testInfo, diagnostic)
})

test.afterAll(async () => {
  const client = await pool.connect()
  try {
    await guardDatabase(client)
    const trackedUsers = [...userIds.values()]
    await client.query('begin')
    await client.query("set local lock_timeout = '2s'")
    await client.query("set local statement_timeout = '15s'")
    const lockedUsers = await client.query<{ id: string }>(
      'select id from users where id = any($1::uuid[]) order by id for update',
      [trackedUsers],
    )
    expectExactTrackedIds(lockedUsers.rows, trackedUsers)
    const lockedCatalogueItems = await client.query<{ id: string }>(
      `select id from anime_catalogue_items
       where id = any($1::uuid[]) order by id for update`,
      [catalogueItemIds],
    )
    expectExactTrackedIds(lockedCatalogueItems.rows, catalogueItemIds)
    const deletedUsers = await client.query<{ id: string }>(
      'delete from users where id = any($1::uuid[]) returning id',
      [trackedUsers],
    )
    expectExactTrackedIds(deletedUsers.rows, trackedUsers)
    const deletedCatalogueItems = await client.query<{ id: string }>(
      'delete from anime_catalogue_items where id = any($1::uuid[]) returning id',
      [catalogueItemIds],
    )
    expectExactTrackedIds(deletedCatalogueItems.rows, catalogueItemIds)
    const residue = await client.query<{ count: number }>(
      `select ((select count(*) from users where id = any($1::uuid[])) +
               (select count(*) from accounts where user_id = any($1::uuid[])) +
               (select count(*) from sessions where user_id = any($1::uuid[])) +
               (select count(*) from account_deletion_requests where user_id = any($1::uuid[])) +
               (select count(*) from anime_entries where user_id = any($1::uuid[]) or catalogue_item_id = any($2::uuid[])) +
               (select count(*) from anime_catalogue_items where id = any($2::uuid[])) +
               (select count(*) from anime_catalogue_sources where catalogue_item_id = any($2::uuid[])))::int as count`,
      [trackedUsers, catalogueItemIds],
    )
    if (residue.rows[0]?.count !== 0)
      throw new TypeError('M42 backup fixture residue remains')

    if (rateLimitSnapshotTaken) {
      await settlePendingRateLimitRequests(client)
      for (const key of rateLimitKeys) {
        const expected = expectedRateLimitFor(key)
        const desired = originalRateLimitSnapshot.find((row) => row.key === key)
        const current = (await readRateLimits(client)).find(
          (row) => row.key === key,
        )
        const expectedExpiredAndRemoved =
          current === undefined &&
          expected !== undefined &&
          hasRateLimitExpired(expected)
        if (
          !rateLimitRowsMatch(current, expected) &&
          !expectedExpiredAndRemoved
        ) {
          throw new TypeError('M42 backup rate-limit cleanup state conflict')
        }
        if (desired === undefined && current !== undefined) {
          const removed = await client.query(
            `delete from rate_limits where id = $1::uuid and key = $2 and count = $3 and last_request::text = $4`,
            [current.id, current.key, current.count, current.lastRequest],
          )
          if (removed.rowCount !== 1)
            throw new TypeError('M42 backup rate-limit cleanup conflict')
        } else if (desired !== undefined) {
          if (current === undefined) {
            const restored = await client.query<RateLimitSnapshot>(
              `insert into rate_limits (id, key, count, last_request)
               values ($1::uuid, $2, $3, $4::bigint)
               on conflict (key) do nothing
               returning id, key, count, last_request::text as "lastRequest"`,
              [desired.id, desired.key, desired.count, desired.lastRequest],
            )
            if (JSON.stringify(restored.rows) !== JSON.stringify([desired])) {
              throw new TypeError('M42 backup rate-limit restore conflict')
            }
            continue
          }
          const restored = await client.query(
            `update rate_limits
                set id = $1::uuid, count = $2, last_request = $3::bigint
              where id = $4::uuid and key = $5 and count = $6 and last_request::text = $7
            returning id`,
            [
              desired.id,
              desired.count,
              desired.lastRequest,
              current.id,
              current.key,
              current.count,
              current.lastRequest,
            ],
          )
          if (restored.rowCount !== 1)
            throw new TypeError('M42 backup rate-limit restore conflict')
        }
      }
      expect(await readRateLimits(client)).toEqual(originalRateLimitSnapshot)
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
})

test('archive backup lifecycle preserves privacy, ownership, state boundaries, and no-JavaScript download', async ({
  browser,
  page,
}) => {
  let download: Download | undefined
  let pageMayBeSignedIn = false
  let primaryError: unknown
  try {
    diagnostic.stage('setup')
    diagnostic.checkpoint('databaseGuarded')
    await signIn(page, ownerA)
    pageMayBeSignedIn = true
    diagnostic.checkpoint('signedIn')
    const settings = await page.goto('/settings')
    expect(settings?.status()).toBe(200)
    expect(await settings?.headerValue('cache-control')).toContain('private')
    expect(await settings?.headerValue('cache-control')).toContain('no-store')
    await expect(page.getByText(titles.aAdult, { exact: true })).toHaveCount(0)
    await expect(page.getByText(titles.source, { exact: true })).toHaveCount(0)
    const settingsFlightResponseValue = await settingsFlightResponse(page)
    expect(settingsFlightResponseValue.status()).toBe(200)
    expect(
      await settingsFlightResponseValue.headerValue('cache-control'),
    ).toContain('private')
    expect(
      await settingsFlightResponseValue.headerValue('cache-control'),
    ).toContain('no-store')
    expect(
      await excludesPrivateSentinels(
        settingsFlightResponseValue,
        settingsFlightProhibitedSentinels,
      ),
    ).toBe(true)
    await page.goto('/settings')
    const link = page.getByRole('link', {
      name: 'Download archive backup (JSON)',
      exact: true,
    })
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account/archive-backup',
    )
    const downloadPromise = page.waitForEvent('download')
    await link.click()
    download = await downloadPromise
    diagnostic.stage('archive-backup', '/settings')
    diagnostic.checkpoint('backupDownloaded')
    failReleaseCriticalIfRequested('archive-backup')
    const response = await responsePromise
    expect(response.status()).toBe(200)
    expect(await response.headerValue('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(await response.headerValue('content-disposition')).toBe(
      'attachment; filename="zedarchive-archive-backup-v1.json"',
    )
    expect(await response.headerValue('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(await response.headerValue('pragma')).toBe('no-cache')
    expect(await response.headerValue('x-content-type-options')).toBe('nosniff')
    expect(await response.headerValue('referrer-policy')).toBe('no-referrer')
    expect(await response.headerValue('x-robots-tag')).toBe('noindex, nofollow')
    expect(await response.headerValue('cross-origin-resource-policy')).toBe(
      'same-origin',
    )
    expect(await response.headerValue('access-control-allow-origin')).toBeNull()
    expect(await response.headerValue('set-cookie')).toBeNull()
    expect(download.suggestedFilename()).toBe(
      'zedarchive-archive-backup-v1.json',
    )
    const backupBefore = await fixtureFingerprint()
    await assertBackupDownload(download)
    download = undefined
    diagnostic.checkpoint('backupAudited')
    diagnostic.checkpoint('downloadDeleted')
    expect(await fixtureFingerprint()).toBe(backupBefore)

    const directNavigationPage = await page.context().newPage()
    try {
      const directDownloadPromise =
        directNavigationPage.waitForEvent('download')
      await directNavigationPage
        .goto('/api/account/archive-backup')
        .catch((error: unknown) => {
          if (!isExpectedDownloadNavigationError(error)) {
            throw new TypeError('M42 backup direct download navigation failed')
          }
        })
      download = await directDownloadPromise
      await assertBackupDownload(download)
      download = undefined
    } finally {
      await directNavigationPage.close()
    }

    const noJavaScriptPage = await page.context().newPage()
    const cdp = await page.context().newCDPSession(noJavaScriptPage)
    try {
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: true })
      const noJavaScriptSettings = await noJavaScriptPage.goto('/settings')
      expect(noJavaScriptSettings?.status()).toBe(200)
      const noJavaScriptLink = noJavaScriptPage.getByRole('link', {
        name: 'Download archive backup (JSON)',
        exact: true,
      })
      const noJavaScriptDownloadPromise =
        noJavaScriptPage.waitForEvent('download')
      await noJavaScriptLink.click()
      download = await noJavaScriptDownloadPromise
      const noJavaScriptBackupBefore = await fixtureFingerprint()
      await assertBackupDownload(download)
      download = undefined
      expect(await fixtureFingerprint()).toBe(noJavaScriptBackupBefore)
    } finally {
      await cdp.detach()
      await noJavaScriptPage.close()
    }
    await stabilizeActiveSettings(page)
    await signOut(page)
    pageMayBeSignedIn = false

    const signedOut = await page.goto('/api/account/archive-backup')
    if (signedOut === null) {
      throw new TypeError('M42 signed-out backup response is unavailable')
    }
    expect(signedOut.status()).toBe(401)
    expect(await excludesPrivateSentinels(signedOut, allPrivateSentinels)).toBe(
      true,
    )
    diagnostic.stage('archive-access')
    diagnostic.checkpoint('backupDenied')

    for (const [owner, expectedAccess] of [
      [pendingOwner, 'recoverable'],
      [dueOwner, 'due'],
    ] as const) {
      await signIn(page, owner, expectedAccess)
      pageMayBeSignedIn = true
      const restrictedSettings = await page.goto('/settings')
      expect(restrictedSettings?.status()).toBe(200)
      expect(new URL(page.url()).pathname).toBe('/account/deletion')
      const restrictedHeading =
        expectedAccess === 'recoverable'
          ? 'Account deletion requested'
          : 'Recovery period ended'
      await expect(
        page.getByRole('heading', { name: restrictedHeading, exact: true }),
      ).toBeVisible()
      const unavailable = await page.goto('/api/account/archive-backup')
      if (unavailable === null) {
        throw new TypeError('M42 restricted backup response is unavailable')
      }
      expect(unavailable.status()).toBe(403)
      expect(
        await excludesPrivateSentinels(unavailable, allPrivateSentinels),
      ).toBe(true)
      await page.goto('/settings')
      await signOut(page)
      pageMayBeSignedIn = false
    }

    await signIn(page, ownerB)
    pageMayBeSignedIn = true
    await page.goto('/settings')
    const ownerBDownloadPromise = page.waitForEvent('download')
    await page
      .getByRole('link', {
        name: 'Download archive backup (JSON)',
        exact: true,
      })
      .click()
    download = await ownerBDownloadPromise
    await assertBackupDownload(download, {
      entryCount: 1,
      requiredTitles: [titles.b],
      prohibitedText: [
        titles.aSafe,
        titles.aAdult,
        titles.source,
        ownerA.email,
        ownerA.username,
        ownerB.email,
        ownerB.username,
        password,
        'catalogueItemId',
        'userId',
        'source_key',
      ],
    })
    download = undefined
    await stabilizeActiveSettings(page)
    await signOut(page)
    pageMayBeSignedIn = false
    await signIn(page, ownerA)
    pageMayBeSignedIn = true
    await page.goto('/settings')
    const ownerASecondDownloadPromise = page.waitForEvent('download')
    await page
      .getByRole('link', {
        name: 'Download archive backup (JSON)',
        exact: true,
      })
      .click()
    download = await ownerASecondDownloadPromise
    await assertBackupDownload(download)
    download = undefined

    const crossSite = await browser.newContext()
    try {
      const crossSitePage = await crossSite.newPage()
      await crossSitePage.goto('http://localhost:3103/sign-in')
      await crossSitePage.setContent(
        '<a href="http://127.0.0.1:3103/api/account/archive-backup">Download</a>',
      )
      const before = await fixtureFingerprint()
      const rejected = crossSitePage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/account/archive-backup',
      )
      const unexpectedDownloadObservation = crossSitePage
        .waitForEvent('download', { timeout: 500 })
        .then((candidate) => candidate)
        .catch(() => undefined)
      await crossSitePage.getByRole('link', { name: 'Download' }).click()
      const crossSiteRejected = await rejected
      expect(crossSiteRejected.status()).toBe(403)
      expect(
        await excludesPrivateSentinels(crossSiteRejected, allPrivateSentinels),
      ).toBe(true)
      expect(await fixtureFingerprint()).toBe(before)
      const unexpectedDownload = await unexpectedDownloadObservation
      if (unexpectedDownload !== undefined) {
        try {
          await unexpectedDownload.delete()
        } catch {
          throw new TypeError('M42 cross-site backup download cleanup failed')
        }
        throw new TypeError('M42 cross-site backup unexpectedly downloaded')
      }
    } finally {
      await crossSite.close()
    }
    await stabilizeActiveSettings(page)
    await signOut(page)
    pageMayBeSignedIn = false
    await page.goto('/settings')
    await expect(
      page
        .getByRole('navigation', { name: 'Account', exact: true })
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    diagnostic.checkpoint('ownerIsolationConfirmed')
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      if (download !== undefined) {
        await download.delete()
        diagnostic.checkpoint('downloadDeleted')
      }
      if (pageMayBeSignedIn) {
        await signOut(page)
        pageMayBeSignedIn = false
      }
      diagnostic.cleanup('passed')
    } catch {
      diagnostic.cleanup('failed')
      if (primaryError === undefined) {
        diagnostic.stage('cleanup')
        throw new TypeError('M42 backup lifecycle cleanup failed')
      }
    }
  }
})
