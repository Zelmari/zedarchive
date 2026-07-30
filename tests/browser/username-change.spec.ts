import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'
import {
  applyWcagTextSpacing,
  expectNoDocumentHorizontalOverflow as expectNoDocumentHorizontalOverflowForAccessibility,
  expectRepresentativeAccessibilityBasics,
  expectTargetAtLeast24Px,
  expectTextSpacingLayout,
} from './helpers/accessibility'

test.use({ screenshot: 'off', trace: 'off' })
test.describe.configure({ mode: 'serial' })

const fixturePrefix = `m32-browser-${randomUUID()}`
const password = `M32-${randomUUID()}-password`
const owners = {
  a: {
    email: `${fixturePrefix}-owner-a@example.test`,
    username: `M32A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  b: {
    email: `${fixturePrefix}-owner-b@example.test`,
    username: `M32B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  c: {
    email: `${fixturePrefix}-owner-c@example.test`,
    username: `M32C${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
}
const changedUsername = `M32N${randomUUID().replaceAll('-', '').slice(0, 12)}`
const noJavaScriptTarget = `M32J${randomUUID().replaceAll('-', '').slice(0, 12)}`
const applicationOrigin = 'http://127.0.0.1:3100'
const fakeResendPort = 43_132
const expectedFakeResendBaseUrl = `http://127.0.0.1:${fakeResendPort}`
const authRateLimitWindowMilliseconds = 60_000
const exactAuthRateLimitKeys = [
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
] as const

const { databaseUrl } = readDatabaseRuntimeEnvironment()
const expectedEmailFromAddress = process.env.AUTH_EMAIL_FROM
const expectedEmailReplyToAddress = process.env.AUTH_EMAIL_REPLY_TO
if (!expectedEmailFromAddress || !expectedEmailReplyToAddress) {
  throw new Error('Browser email sender environment is unavailable')
}
const pool = new Pool({ connectionString: databaseUrl })
const fixtureUserIds: string[] = []
const rateLimitBefore = new Map<string, RateLimitRow | null>()
const rateLimitExpected = new Map<string, RateLimitRow | null>()
let ownerAId = ''
let ownerBId = ''
let ownerCId = ''
let fakeResendServer: Server | undefined
let collectedUsernameMessageCount = 0
let expectedUsernameMessage:
  Readonly<{ email: string; prohibitedValues: readonly string[] }> | undefined
let opaqueUsernameCode: string | undefined

type RateLimitRow = Readonly<{
  id: string
  key: string
  count: number
  lastRequest: string
}>

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
  }
}

function monitorUnexpectedBrowserErrors(page: Page) {
  let consoleErrorCount = 0
  let pageErrorCount = 0

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrorCount += 1
    }
  })
  page.on('pageerror', () => {
    pageErrorCount += 1
  })

  return () => {
    expect(consoleErrorCount).toBe(0)
    expect(pageErrorCount).toBe(0)
  }
}

async function expectPrivateNoStore(response: {
  headerValue(name: string): Promise<string | null>
}) {
  const cacheControl = await response.headerValue('cache-control')
  expect(cacheControl).toContain('private')
  expect(cacheControl).toContain('no-store')
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
}

async function insertUser(owner: (typeof owners)[keyof typeof owners]) {
  const userId = randomUUID()
  const passwordHash = await hashPassword(password)

  await pool.query(
    `
      insert into users (
        id,
        username,
        username_identity_key,
        email,
        email_verified
      )
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

async function readRateLimits(): Promise<RateLimitRow[]> {
  const result = await pool.query<RateLimitRow>(
    `select id, key, count, last_request::text as "lastRequest"
     from rate_limits
     where key = any($1::text[])
     order by key`,
    [[...exactAuthRateLimitKeys]],
  )
  return result.rows
}

function rateLimitFor(
  rows: readonly RateLimitRow[],
  key: (typeof exactAuthRateLimitKeys)[number],
): RateLimitRow | null {
  return rows.find((row) => row.key === key) ?? null
}

async function snapshotRateLimits(): Promise<void> {
  const snapshot = await readRateLimits()
  for (const key of exactAuthRateLimitKeys) {
    const row = rateLimitFor(snapshot, key)
    rateLimitBefore.set(key, row)
    rateLimitExpected.set(key, row)
  }
}

async function prepareRateLimitedRequest(
  key: (typeof exactAuthRateLimitKeys)[number],
): Promise<bigint> {
  const expected = rateLimitExpected.get(key)
  if (expected === undefined) throw new Error('Rate limit was not snapshotted')
  const minimumLastRequest = BigInt(Date.now())
  const current = rateLimitFor(await readRateLimits(), key)
  if (
    current === null &&
    expected !== null &&
    minimumLastRequest >=
      BigInt(expected.lastRequest) + BigInt(authRateLimitWindowMilliseconds)
  ) {
    rateLimitExpected.set(key, null)
    return minimumLastRequest
  }
  expect(current).toEqual(expected)
  if (expected === null) return minimumLastRequest

  const result = await pool.query<RateLimitRow>(
    `update rate_limits
     set count = 0, last_request = last_request - 61000
     where key = $1
       and id = $2::uuid
       and count = $3
       and last_request = $4::bigint
     returning id, key, count, last_request::text as "lastRequest"`,
    [key, expected.id, expected.count, expected.lastRequest],
  )
  const cleared = result.rows[0]
  if (result.rows.length !== 1 || cleared === undefined) {
    throw new Error('Rate limit changed before username lifecycle request')
  }
  rateLimitExpected.set(key, cleared)
  return minimumLastRequest
}

async function recordRateLimitedRequest(
  key: (typeof exactAuthRateLimitKeys)[number],
  minimumLastRequest: bigint,
): Promise<void> {
  const expected = rateLimitExpected.get(key)
  if (expected === undefined) throw new Error('Rate limit was not prepared')
  const current = rateLimitFor(await readRateLimits(), key)
  if (current === null || current.count !== 1) {
    throw new Error('Username lifecycle request did not create a rate limit')
  }
  expect(BigInt(current.lastRequest)).toBeGreaterThanOrEqual(minimumLastRequest)
  if (expected !== null) {
    expect(current.id).toBe(expected.id)
    expect(BigInt(current.lastRequest)).toBeGreaterThan(
      BigInt(expected.lastRequest),
    )
  }
  rateLimitExpected.set(key, current)
}

async function restoreRateLimits(client: PoolClient): Promise<void> {
  for (const key of exactAuthRateLimitKeys) {
    const before = rateLimitBefore.get(key)
    const expected = rateLimitExpected.get(key)
    if (before === undefined || expected === undefined) continue
    const currentResult = await client.query<RateLimitRow>(
      `select id, key, count, last_request::text as "lastRequest"
       from rate_limits
       where key = $1`,
      [key],
    )
    const current = rateLimitFor(currentResult.rows, key)
    if (before === null) {
      if (current === null) continue
      if (
        expected === null ||
        JSON.stringify(current) !== JSON.stringify(expected)
      ) {
        throw new Error('Rate limit changed during username lifecycle cleanup')
      }
      const result = await client.query<RateLimitRow>(
        `delete from rate_limits
         where key = $1
           and id = $2::uuid
           and count = $3
           and last_request = $4::bigint
         returning id, key, count, last_request::text as "lastRequest"`,
        [key, expected.id, expected.count, expected.lastRequest],
      )
      if (result.rows.length !== 1) {
        throw new Error('Rate limit changed during username lifecycle cleanup')
      }
      continue
    }
    if (current === null) {
      const result = await client.query<RateLimitRow>(
        `insert into rate_limits (id, key, count, last_request)
         values ($1::uuid, $2, $3, $4::bigint)
         on conflict (key) do nothing
         returning id, key, count, last_request::text as "lastRequest"`,
        [before.id, key, before.count, before.lastRequest],
      )
      if (JSON.stringify(result.rows) !== JSON.stringify([before])) {
        throw new Error(
          'Rate limit cleanup could not restore the exact snapshot',
        )
      }
      continue
    }
    if (
      expected === null ||
      JSON.stringify(current) !== JSON.stringify(expected)
    ) {
      throw new Error('Rate limit changed during username lifecycle cleanup')
    }
    const result = await client.query<RateLimitRow>(
      `update rate_limits
       set id = $2::uuid, count = $3, last_request = $4::bigint
       where key = $1
         and id = $5::uuid
         and count = $6
         and last_request = $7::bigint
       returning id, key, count, last_request::text as "lastRequest"`,
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
    if (JSON.stringify(result.rows) !== JSON.stringify([before])) {
      throw new Error('Rate limit cleanup could not restore the exact snapshot')
    }
  }
}

async function signIn(page: Page, owner: (typeof owners)[keyof typeof owners]) {
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
    { timeout: 5_000 },
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(200)
  await recordRateLimitedRequest('127.0.0.1|/sign-in/email', minimumLastRequest)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page) {
  if (page.isClosed()) {
    throw new TypeError('M32 username sign-out page is unavailable')
  }
  const button = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await button.isVisible().catch(() => false))) return
  const minimumLastRequest = await prepareRateLimitedRequest(
    '127.0.0.1|/sign-out',
  )
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-out',
    { timeout: 5_000 },
  )
  await button.click({ timeout: 5_000 })
  expect((await response).status()).toBe(200)
  await recordRateLimitedRequest('127.0.0.1|/sign-out', minimumLastRequest)
}

async function signOutContextThroughUi(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  try {
    await page.goto('/settings')
    await signOutIfSignedIn(page)
  } finally {
    await page.close()
  }
}

async function disableScriptExecution(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setScriptExecutionDisabled', { value: true })
}

async function challengeFor(userId: string) {
  const result = await pool.query<{
    failed_code_attempts: number
    last_sent_at: Date
    proposed_username: string
    send_count: number
  }>(
    `
      select
        failed_code_attempts,
        last_sent_at,
        proposed_username,
        send_count
      from username_change_challenges
      where user_id = $1
    `,
    [userId],
  )
  return result.rows[0]
}

async function recordFor(userId: string) {
  const result = await pool.query<{
    changed_at: Date
    previous_username_identity_key: string | null
    previous_username_reserved_until: Date | null
  }>(
    `
      select
        changed_at,
        previous_username_identity_key,
        previous_username_reserved_until
      from username_change_records
      where user_id = $1
    `,
    [userId],
  )
  return result.rows[0]
}

function startFakeResendCollector(): Promise<void> {
  fakeResendServer = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/emails') {
      response.writeHead(404).end()
      return
    }

    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as
          Record<string, unknown> | unknown
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          response.writeHead(400).end()
          return
        }
        if (
          !acceptExpectedUsernameMessage(
            parsed as Record<string, unknown>,
            request.headers['idempotency-key'] as string | undefined,
          )
        ) {
          response.writeHead(400).end()
          return
        }
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ id: randomUUID() }))
      } catch {
        response.writeHead(400).end()
      }
    })
  })

  return new Promise((resolve, reject) => {
    fakeResendServer!.once('error', reject)
    fakeResendServer!.listen(fakeResendPort, '127.0.0.1', () => {
      fakeResendServer!.off('error', reject)
      resolve()
    })
  })
}

async function stopFakeResendCollector() {
  const server = fakeResendServer
  if (server === undefined) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error)
      else resolve()
    })
  })
  expect(server.listening).toBe(false)
  fakeResendServer = undefined
}

async function closeContextForCleanup(
  context: BrowserContext | undefined,
): Promise<boolean> {
  if (context === undefined) return true
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      context.close().then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 5_000)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function prepareExpectedUsernameMessage(
  email: string,
  prohibitedValues: readonly string[],
): void {
  if (expectedUsernameMessage !== undefined) {
    throw new Error('Synthetic username email expectation is already active')
  }
  expectedUsernameMessage = { email, prohibitedValues }
}

function acceptExpectedUsernameMessage(
  body: Record<string, unknown>,
  idempotencyKey: string | undefined,
): boolean {
  const expected = expectedUsernameMessage
  if (expected === undefined) return false
  const serialized = JSON.stringify(body)
  const text = body.text
  const html = body.html
  const code =
    typeof text === 'string'
      ? /Verification code: (\d{8})/u.exec(text)?.[1]
      : undefined
  const accepted =
    body.from === `zedarchive <${expectedEmailFromAddress}>` &&
    body.reply_to === expectedEmailReplyToAddress &&
    body.subject === 'Your zedarchive username change code' &&
    JSON.stringify(body.tags) ===
      JSON.stringify([{ name: 'category', value: 'username_change' }]) &&
    [expected.email, [expected.email]].some(
      (recipient) => JSON.stringify(body.to) === JSON.stringify(recipient),
    ) &&
    /^auth-email\/username_change\/[a-f0-9]{64}$/u.test(idempotencyKey ?? '') &&
    expected.prohibitedValues.every((value) => !serialized.includes(value)) &&
    code !== undefined &&
    typeof html === 'string' &&
    html.includes(code)

  if (!accepted) return false
  opaqueUsernameCode = code
  expectedUsernameMessage = undefined
  collectedUsernameMessageCount += 1
  return true
}

async function waitForOpaqueUsernameCode(expectedCount: number): Promise<void> {
  await expect.poll(() => collectedUsernameMessageCount).toBe(expectedCount)
  if (opaqueUsernameCode === undefined) {
    throw new Error('Synthetic username code was not collected')
  }
}

async function fillOpaqueUsernameCode(input: Locator): Promise<void> {
  if (opaqueUsernameCode === undefined) {
    throw new Error('Synthetic username code is unavailable')
  }
  await input.fill(opaqueUsernameCode)
}

async function fillIncorrectOpaqueUsernameCode(input: Locator): Promise<void> {
  if (opaqueUsernameCode === undefined) {
    throw new Error('Synthetic username code is unavailable')
  }
  await input.fill(opaqueUsernameCode === '00000042' ? '00000041' : '00000042')
}

function clearOpaqueUsernameCode(): void {
  opaqueUsernameCode = undefined
}

async function submitStart(
  page: Page,
  username: string,
  currentPassword: string,
) {
  const usernameSection = getUsernameSection(page)
  await usernameSection
    .getByRole('textbox', { name: 'New username' })
    .fill(username)
  await usernameSection
    .getByRole('textbox', { name: 'Current password' })
    .fill(currentPassword)
  await usernameSection
    .getByRole('button', { name: 'Send verification code', exact: true })
    .click()
}

function getUsernameSection(page: Page) {
  return page.getByRole('region', { name: 'Username', exact: true })
}

test.beforeAll(async () => {
  if (process.env.RESEND_BASE_URL !== expectedFakeResendBaseUrl) {
    throw new Error(
      'Username-change browser email delivery must use the loopback collector',
    )
  }
  await startFakeResendCollector()
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)
  await snapshotRateLimits()
  ownerAId = await insertUser(owners.a)
  ownerBId = await insertUser(owners.b)
  ownerCId = await insertUser(owners.c)
})

test.afterAll(async () => {
  try {
    const target = await pool.query<{ name: string }>(
      'select current_database() as name',
    )
    assertAllowedFixtureDatabase(target.rows[0]?.name)
    if (fixtureUserIds.length > 0) {
      await pool.query('delete from users where id = any($1::uuid[])', [
        fixtureUserIds,
      ])
      const residue = await pool.query<{
        accounts: number
        challenges: number
        records: number
        sessions: number
        users: number
      }>(
        `
          select
            (select count(*)::int from users where id = any($1::uuid[])) users,
            (select count(*)::int from accounts where user_id = any($1::uuid[])) accounts,
            (select count(*)::int from sessions where user_id = any($1::uuid[])) sessions,
            (select count(*)::int from username_change_challenges where user_id = any($1::uuid[])) challenges,
            (select count(*)::int from username_change_records where user_id = any($1::uuid[])) records
        `,
        [fixtureUserIds],
      )
      expect(residue.rows[0]).toEqual({
        accounts: 0,
        challenges: 0,
        records: 0,
        sessions: 0,
        users: 0,
      })
    }
    const client = await pool.connect()
    try {
      await client.query('begin')
      const currentDatabase = await client.query<{ name: string }>(
        'select current_database() as name',
      )
      assertAllowedFixtureDatabase(currentDatabase.rows[0]?.name)
      await restoreRateLimits(client)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  } finally {
    try {
      await pool.end()
    } finally {
      await stopFakeResendCollector()
      clearOpaqueUsernameCode()
      expectedUsernameMessage = undefined
      collectedUsernameMessageCount = 0
      expect(opaqueUsernameCode).toBeUndefined()
      expect(expectedUsernameMessage).toBeUndefined()
      expect(collectedUsernameMessageCount).toBe(0)
    }
  }
})

test('protects and completes the one-time username-change journey', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  let secondOwnerAContext: BrowserContext | undefined
  let expiredOwnerBContext: BrowserContext | undefined
  let noJavaScriptContext: BrowserContext | undefined
  let primaryError: unknown

  try {
    const signedOutResponse = await page.goto('/settings')
    expect(signedOutResponse?.status()).toBe(200)
    await expectPrivateNoStore(signedOutResponse!)
    await expect(
      page.locator('#main-content').getByRole('link', { name: 'Sign in' }),
    ).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'New username' }),
    ).toHaveCount(0)

    await signIn(page, owners.a)
    await page.goto('/settings')
    await expectRepresentativeAccessibilityBasics(page)
    await expectTargetAtLeast24Px(
      getUsernameSection(page).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    )
    await page.setViewportSize({ width: 1280, height: 960 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expectNoDocumentHorizontalOverflowForAccessibility(page)
    await applyWcagTextSpacing(page)
    await expectTextSpacingLayout(page, {
      content: [
        page.getByRole('heading', { name: 'Username', exact: true }),
        getUsernameSection(page).getByText(
          'Your username is public and can only be changed once.',
          { exact: true },
        ),
      ],
      controls: [
        getUsernameSection(page).getByRole('textbox', {
          name: 'New username',
        }),
        getUsernameSection(page).getByRole('button', {
          name: 'Send verification code',
          exact: true,
        }),
      ],
    })
    await page.goto('/settings')
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 960 },
    ]) {
      await page.setViewportSize(viewport)
      const response = await page.goto('/settings')
      expect(response?.status()).toBe(200)
      await expectPrivateNoStore(response!)
      await expectNoHorizontalOverflow(page)
      await expect(
        page.getByRole('heading', { name: 'Username', exact: true }),
      ).toBeVisible()
      await expect(
        getUsernameSection(page).getByRole('button', {
          name: 'Send verification code',
          exact: true,
        }),
      ).toBeVisible()
    }

    await submitStart(page, owners.a.username, password)
    const noChangeFeedback = page.getByRole('alert').filter({
      hasText: 'Choose a different username.',
    })
    await expect(noChangeFeedback).toBeFocused()
    await expect(
      getUsernameSection(page).getByRole('textbox', { name: 'New username' }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(
      getUsernameSection(page).getByRole('textbox', {
        name: 'Current password',
      }),
    ).not.toHaveAttribute('aria-invalid')
    expect(await challengeFor(ownerAId)).toBeUndefined()

    await submitStart(page, owners.b.username, password)
    const unavailableFeedback = page.getByRole('alert').filter({
      hasText: 'That username is unavailable.',
    })
    await expect(unavailableFeedback).toBeFocused()
    expect(await challengeFor(ownerAId)).toBeUndefined()

    await submitStart(page, changedUsername, `${password}-wrong`)
    const passwordFeedback = page.getByRole('alert').filter({
      hasText: 'Your current password is incorrect.',
    })
    await expect(passwordFeedback).toBeFocused()
    await expect(
      getUsernameSection(page).getByRole('textbox', {
        name: 'Current password',
      }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(
      getUsernameSection(page).getByRole('textbox', { name: 'New username' }),
    ).not.toHaveAttribute('aria-invalid')
    expect(await challengeFor(ownerAId)).toBeUndefined()

    prepareExpectedUsernameMessage(owners.a.email, [
      changedUsername,
      owners.a.username,
      ownerAId,
      ownerBId,
    ])
    await submitStart(page, changedUsername, password)
    await expect(
      page.getByRole('status').filter({
        hasText: 'Check your verified email for a verification code.',
      }),
    ).toBeFocused()
    await expect(
      page.getByText('Check your verified email for an eight-digit code.'),
    ).toBeVisible()
    await expectRepresentativeAccessibilityBasics(page)
    await expectTargetAtLeast24Px(
      getUsernameSection(page).getByRole('textbox', {
        name: 'Verification code',
      }),
    )
    expect(await challengeFor(ownerAId)).toMatchObject({
      failed_code_attempts: 0,
      proposed_username: changedUsername,
      send_count: 1,
    })
    await waitForOpaqueUsernameCode(1)

    const cooldownPage = await page.context().newPage()
    await cooldownPage.clock.install()
    const cooldownResponse = await cooldownPage.goto('/settings')
    expect(cooldownResponse?.status()).toBe(200)
    await expectPrivateNoStore(cooldownResponse!)
    const cooldownForm = getUsernameSection(cooldownPage)
      .getByRole('button', { name: 'Send another code', exact: true })
      .locator('..')
    const cooldownStatus = cooldownForm.locator('[role="status"]')
    await expect(cooldownStatus).toHaveAttribute('aria-live', 'polite')
    await expect(cooldownStatus).toHaveText('')
    const cooldownStatusElement = await cooldownStatus.elementHandle()
    if (cooldownStatusElement === null) {
      throw new Error('Username cooldown status region was not rendered')
    }
    await cooldownPage.clock.fastForward(60_000)
    await expect(cooldownStatus).toHaveText('You can request another code now.')
    expect(
      await cooldownStatusElement.evaluate((element) => ({
        connected: element.isConnected,
        text: element.textContent,
      })),
    ).toEqual({
      connected: true,
      text: 'You can request another code now.',
    })
    await expect(
      cooldownForm.getByRole('button', {
        name: 'Send another code',
        exact: true,
      }),
    ).toBeEnabled()
    await cooldownPage.close()

    for (const privateValue of [
      owners.a.email,
      owners.b.email,
      ownerAId,
      ownerBId,
    ]) {
      await expect(page.getByText(privateValue, { exact: false })).toHaveCount(
        0,
      )
    }
    await expect(page).toHaveURL('/settings')

    secondOwnerAContext = await browser.newContext({
      baseURL: applicationOrigin,
    })
    const secondOwnerAAuthPage = await secondOwnerAContext.newPage()
    await signIn(secondOwnerAAuthPage, owners.a)
    await secondOwnerAAuthPage.close()
    const secondOwnerAPage = await secondOwnerAContext.newPage()
    await disableScriptExecution(secondOwnerAPage)
    const secondSessionResponse = await secondOwnerAPage.goto('/settings')
    expect(secondSessionResponse?.status()).toBe(200)
    await expectPrivateNoStore(secondSessionResponse!)
    await expect(
      getUsernameSection(secondOwnerAPage).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      getUsernameSection(secondOwnerAPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toHaveCount(0)

    const confirmation = getUsernameSection(page).getByRole('checkbox', {
      name: 'I understand that I can only change my username once.',
    })
    await fillOpaqueUsernameCode(
      getUsernameSection(page).getByRole('textbox', {
        name: 'Verification code',
      }),
    )
    await getUsernameSection(page)
      .getByRole('button', { name: 'Change username', exact: true })
      .click()
    const confirmationFeedback = page.getByRole('alert').filter({
      hasText:
        'Confirm that you understand this username change cannot be undone.',
    })
    await expect(confirmationFeedback).toBeFocused()
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect((await challengeFor(ownerAId))?.failed_code_attempts).toBe(0)

    const codeInput = getUsernameSection(page).getByRole('textbox', {
      name: 'Verification code',
    })
    await codeInput.focus()
    await page.keyboard.press('Tab')
    await expect(confirmation).toBeFocused()
    await page.keyboard.press('Space')
    await expect(confirmation).toBeChecked()

    await fillIncorrectOpaqueUsernameCode(codeInput)
    await getUsernameSection(page)
      .getByRole('button', { name: 'Change username', exact: true })
      .click()
    const invalidCodeFeedback = page.getByRole('alert').filter({
      hasText: 'Enter the correct eight-digit verification code.',
    })
    await expect(invalidCodeFeedback).toBeFocused()
    await expect(codeInput).toHaveAttribute('aria-invalid', 'true')
    await expect(confirmation).not.toHaveAttribute('aria-invalid')
    expect((await challengeFor(ownerAId))?.failed_code_attempts).toBe(1)

    await confirmation.check()
    await fillOpaqueUsernameCode(codeInput)
    await page
      .getByRole('button', { name: 'Change username', exact: true })
      .click()
    const changedFeedback = page.getByRole('status').filter({
      hasText: `Your username has been changed to @${changedUsername}.`,
    })
    await expect(changedFeedback).toBeFocused()
    await expect(
      page
        .getByRole('navigation', { name: 'Account', exact: true })
        .getByText(`@${changedUsername}`, { exact: true }),
    ).toBeVisible()
    await expect(
      getUsernameSection(page).getByRole('button', {
        name: 'Send verification code',
      }),
    ).toHaveCount(0)
    clearOpaqueUsernameCode()
    expect(await challengeFor(ownerAId)).toBeUndefined()

    const record = await recordFor(ownerAId)
    expect(record?.previous_username_identity_key).toBe(
      owners.a.username.toLowerCase(),
    )
    expect(record?.previous_username_reserved_until?.getTime()).toBe(
      record?.changed_at.getTime() + 14 * 24 * 60 * 60 * 1000,
    )
    const persistedUser = await pool.query<{
      username: string
      username_identity_key: string
    }>(
      `
        select username, username_identity_key
        from users
        where id = $1
      `,
      [ownerAId],
    )
    expect(persistedUser.rows[0]).toEqual({
      username: changedUsername,
      username_identity_key: changedUsername.toLowerCase(),
    })
    const retainedSessions = await pool.query<{ count: number }>(
      'select count(*)::int as count from sessions where user_id = $1',
      [ownerAId],
    )
    expect(retainedSessions.rows[0]?.count).toBeGreaterThanOrEqual(2)
    await secondOwnerAPage.reload()
    await expect(
      secondOwnerAPage
        .getByRole('navigation', { name: 'Account', exact: true })
        .getByText(`@${changedUsername}`, { exact: true }),
    ).toBeVisible()

    expiredOwnerBContext = await browser.newContext({
      baseURL: applicationOrigin,
    })
    const staleOwnerBPage = await expiredOwnerBContext.newPage()
    await signIn(staleOwnerBPage, owners.b)
    await staleOwnerBPage.goto('/settings')
    await expect(
      getUsernameSection(staleOwnerBPage).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      staleOwnerBPage.getByText(changedUsername, { exact: false }),
    ).toHaveCount(0)
    const originSession =
      await expiredOwnerBContext.newCDPSession(staleOwnerBPage)
    try {
      await originSession.send('Network.enable')
      await originSession.send('Network.setExtraHTTPHeaders', {
        headers: {
          'x-forwarded-host': 'm32-host-mismatch.invalid',
          origin: 'http://m32-origin-mismatch.invalid',
        },
      })
      const rejectedOriginResponse = staleOwnerBPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/settings',
      )
      await submitStart(
        staleOwnerBPage,
        `M32O${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        password,
      )
      expect((await rejectedOriginResponse).status()).toBeGreaterThanOrEqual(
        400,
      )
    } finally {
      await originSession.send('Network.setExtraHTTPHeaders', { headers: {} })
      await originSession.send('Network.disable')
      await originSession.detach()
    }
    expect(await challengeFor(ownerBId)).toBeUndefined()
    expect(await recordFor(ownerBId)).toBeUndefined()
    const staleSubmissionPage = await expiredOwnerBContext.newPage()
    await staleSubmissionPage.goto('/settings')
    await expect(
      getUsernameSection(staleSubmissionPage).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    ).toBeVisible()
    const signOutPage = await expiredOwnerBContext.newPage()
    await signOutPage.goto('/settings')
    await signOutIfSignedIn(signOutPage)
    await signOutPage.close()
    await submitStart(
      staleSubmissionPage,
      `M32E${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password,
    )
    await expect(
      staleSubmissionPage.getByRole('alert').filter({
        hasText: 'Your session has expired. Sign in and try again.',
      }),
    ).toBeFocused()
    expect(await challengeFor(ownerBId)).toBeUndefined()
    expect(await recordFor(ownerBId)).toBeUndefined()

    noJavaScriptContext = await browser.newContext({
      baseURL: applicationOrigin,
    })
    const noJavaScriptAuthPage = await noJavaScriptContext.newPage()
    await signIn(noJavaScriptAuthPage, owners.c)
    await noJavaScriptAuthPage.close()
    const noJavaScriptPage = await noJavaScriptContext.newPage()
    await disableScriptExecution(noJavaScriptPage)
    const noJavaScriptSettings = await noJavaScriptPage.goto('/settings')
    expect(noJavaScriptSettings?.status()).toBe(200)
    await expectPrivateNoStore(noJavaScriptSettings!)
    prepareExpectedUsernameMessage(owners.c.email, [
      noJavaScriptTarget,
      owners.c.username,
      ownerCId,
    ])
    await submitStart(noJavaScriptPage, noJavaScriptTarget, password)
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toBeVisible()
    await waitForOpaqueUsernameCode(2)
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('checkbox', {
        name: 'I understand that I can only change my username once.',
      }),
    ).toBeVisible()
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('button', {
        name: 'Send another code',
      }),
    ).toBeDisabled()
    await expect(
      noJavaScriptPage.getByText(
        'Refresh settings if JavaScript is unavailable.',
        { exact: false },
      ),
    ).toBeVisible()
    await getUsernameSection(noJavaScriptPage)
      .getByRole('button', { name: 'Cancel username change', exact: true })
      .click()
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    ).toBeVisible()
    const cancelledChallenge = await challengeFor(ownerCId)
    expect(cancelledChallenge).toMatchObject({
      proposed_username: noJavaScriptTarget,
      send_count: 1,
    })
    expect(await recordFor(ownerCId)).toBeUndefined()
    clearOpaqueUsernameCode()

    const capitalizationOnlyTarget = owners.c.username.toLowerCase()
    await submitStart(noJavaScriptPage, capitalizationOnlyTarget, password)
    await expect(
      noJavaScriptPage.getByRole('alert').filter({
        hasText: 'Wait a moment before sending another code.',
      }),
    ).toBeVisible()
    expect(await challengeFor(ownerCId)).toMatchObject({
      proposed_username: noJavaScriptTarget,
      send_count: 1,
    })
    expect(await recordFor(ownerCId)).toBeUndefined()

    const cooldownWaitMilliseconds = Math.max(
      0,
      (cancelledChallenge?.last_sent_at.getTime() ?? Date.now()) +
        60_000 -
        Date.now() +
        1_000,
    )
    await noJavaScriptPage.waitForTimeout(cooldownWaitMilliseconds)
    prepareExpectedUsernameMessage(owners.c.email, [
      capitalizationOnlyTarget,
      owners.c.username,
      ownerCId,
    ])
    await submitStart(noJavaScriptPage, capitalizationOnlyTarget, password)
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toBeVisible()
    await waitForOpaqueUsernameCode(3)
    await fillOpaqueUsernameCode(
      getUsernameSection(noJavaScriptPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    )
    await getUsernameSection(noJavaScriptPage)
      .getByRole('checkbox', {
        name: 'I understand that I can only change my username once.',
      })
      .check()
    await getUsernameSection(noJavaScriptPage)
      .getByRole('button', { name: 'Change username', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByText(
        'Your username has already been changed and cannot be changed again.',
      ),
    ).toBeVisible()
    const capitalizationRecord = await recordFor(ownerCId)
    expect(capitalizationRecord).toMatchObject({
      previous_username_identity_key: null,
      previous_username_reserved_until: null,
    })
    const capitalizationUser = await pool.query<{ username: string }>(
      'select username from users where id = $1',
      [ownerCId],
    )
    expect(capitalizationUser.rows[0]?.username).toBe(capitalizationOnlyTarget)
    clearOpaqueUsernameCode()

    await signOutIfSignedIn(page)
    await signOutContextThroughUi(secondOwnerAContext)
    await signOutContextThroughUi(noJavaScriptContext)
    assertNoUnexpectedBrowserErrors()
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupCompleted = await Promise.all([
      closeContextForCleanup(secondOwnerAContext),
      closeContextForCleanup(expiredOwnerBContext),
      closeContextForCleanup(noJavaScriptContext),
    ])
    if (primaryError === undefined && cleanupCompleted.includes(false)) {
      throw new TypeError('M32 username browser cleanup timed out')
    }
  }
})
