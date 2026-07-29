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
import { Pool } from 'pg'
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

const fixturePrefix = `m33-browser-${randomUUID()}`
const password = `M33-${randomUUID()}-password`
const owners = {
  a: {
    email: `${fixturePrefix}-owner-a@example.test`,
    username: `M33A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  b: {
    email: `${fixturePrefix}-owner-b@example.test`,
    username: `M33B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  c: {
    email: `${fixturePrefix}-owner-c@example.test`,
    username: `M33C${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
} as const
const applicationOrigin = 'http://127.0.0.1:3100'
const fakeResendPort = 43_132
const expectedFakeResendBaseUrl = `http://127.0.0.1:${fakeResendPort}`
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const expectedEmailFromAddress = process.env.AUTH_EMAIL_FROM
const expectedEmailReplyToAddress = process.env.AUTH_EMAIL_REPLY_TO
if (!expectedEmailFromAddress || !expectedEmailReplyToAddress) {
  throw new Error('Browser email sender environment is unavailable')
}
const pool = new Pool({ connectionString: databaseUrl })
const sharedVerifyPasswordRateLimitKey = 'no-trusted-ip|/verify-password'
type SharedVerifyPasswordRateLimit = {
  id: string
  count: number
  lastRequest: string
}

const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []
let ownerAId = ''
let ownerBId = ''
let ownerCId = ''
let ownerAEntryId = ''
let publicCatalogueItemId = ''
let collector: Server | undefined
let sharedVerifyPasswordRateLimitBefore:
  SharedVerifyPasswordRateLimit | null | undefined
let sharedVerifyPasswordRateLimitExpected:
  SharedVerifyPasswordRateLimit | null | undefined
const collectedEmails: Array<{
  body: Record<string, unknown>
  idempotencyKey: string | undefined
}> = []

function assertAllowedFixtureDatabase(name: string | undefined) {
  const expected =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'
  if (name !== expected) {
    throw new Error('Account-deletion browser fixture target is not allowed')
  }
}

const pagesExpectingRejection = new Set<Page>()

/**
 * A deliberately rejected cross-origin Server Action makes the browser report
 * the failed request, so that bounded window is excluded instead of weakening
 * the assertion for every other interaction.
 */
async function whileOriginRejectionExpected(
  page: Page,
  run: () => Promise<void>,
) {
  pagesExpectingRejection.add(page)
  try {
    await run()
    await page.waitForTimeout(500)
  } finally {
    pagesExpectingRejection.delete(page)
  }
}

function monitorUnexpectedBrowserErrors(page: Page) {
  let consoleErrorCount = 0
  let pageErrorCount = 0

  page.on('console', (message) => {
    if (pagesExpectingRejection.has(page)) return
    if (message.type() === 'error') {
      consoleErrorCount += 1
    }
  })
  page.on('pageerror', () => {
    if (pagesExpectingRejection.has(page)) return
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

async function expectRaisedPaper(locator: Locator) {
  await expect(locator).toHaveClass(/\bza-card--raised\b/)
  expect(
    await locator.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none')
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
  fixtureUserIds.push(userId)
  await pool.query(
    `insert into users
       (id, username, username_identity_key, email, email_verified)
     values ($1, $2, $3, $4, true)`,
    [userId, owner.username, owner.username.toLowerCase(), owner.email],
  )
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1, $2, $3, 'credential', $4)`,
    [randomUUID(), userId, userId, passwordHash],
  )
  return userId
}

async function insertOwnerAData() {
  publicCatalogueItemId = randomUUID()
  ownerAEntryId = randomUUID()
  fixtureCatalogueItemIds.push(publicCatalogueItemId)
  await pool.query(
    `insert into anime_catalogue_items
       (id, english_title, original_title, format, release_status,
        episode_count, maturity, catalogue_state)
     values ($1, 'M33 Public English', 'M33 Public Original', 'tv',
       'finished', 12, 'safe', 'published')`,
    [publicCatalogueItemId],
  )
  await pool.query(
    `insert into user_catalogue_preferences
       (user_id, title_language, adult_content_enabled)
     values ($1, 'original', false)`,
    [ownerAId],
  )
  await pool.query(
    `insert into anime_entries
       (id, user_id, catalogue_item_id, status, episode_progress)
     values ($1, $2, $3, 'in_progress', 3)`,
    [ownerAEntryId, ownerAId, publicCatalogueItemId],
  )
  await pool.query(
    `insert into username_change_records(user_id, changed_at)
     values ($1, clock_timestamp())`,
    [ownerAId],
  )
}

async function preservedOwnerAData() {
  const result = await pool.query(
    `select
       (select row_to_json(p) from (
          select title_language, adult_content_enabled, updated_at
          from user_catalogue_preferences where user_id=$1
       ) p) preference,
       (select row_to_json(e) from (
          select id, catalogue_item_id, status, episode_progress,
                 episode_total_override, rating, is_favourite,
                 start_date, finish_date, created_at, updated_at
          from anime_entries where id=$2 and user_id=$1
       ) e) entry,
       (select row_to_json(h) from (
          select changed_at, previous_username_identity_key,
                 previous_username_reserved_until
          from username_change_records where user_id=$1
       ) h) history`,
    [ownerAId, ownerAEntryId],
  )
  return result.rows[0]
}

async function lifecycleEffects(userId: string) {
  const result = await pool.query<{
    challenges: number
    requests: number
    sessions: number
  }>(
    `select
       (select count(*)::int from deletion_challenges where user_id=$1) challenges,
       (select count(*)::int from account_deletion_requests where user_id=$1) requests,
       (select count(*)::int from sessions where user_id=$1) sessions`,
    [userId],
  )
  return { ...result.rows[0], emails: collectedEmails.length }
}

/**
 * Settings also renders a username-change password field, so deletion controls
 * must be located inside their own labelled region.
 */
function deletionSection(page: Page) {
  return page.getByRole('region', { name: 'Delete account' })
}

function currentPasswordField(page: Page) {
  return deletionSection(page).getByRole('textbox', {
    name: 'Current password',
  })
}

function deletionConfirmation(page: Page) {
  return deletionSection(page).getByRole('checkbox')
}

async function expectVisibleFocusIndicator(control: Locator) {
  await expect(control).toBeFocused()
  await expect(control).toHaveCSS('outline-style', /^(auto|solid)$/)
  await expect(control).not.toHaveCSS('outline-width', '0px')
}

/**
 * The provider's short per-IP sign-in window is far narrower than this
 * journey's burst of synthetic sign-ins, so the run paces itself rather than
 * relaxing a real protection.
 */
const signInRateLimitWaitMilliseconds = 11_000
const signInRateLimitAttempts = 3

/**
 * Local browser runs share one verify-password bucket when no trusted client
 * IP is forwarded (`no-trusted-ip|/verify-password`, 5/60s). This journey needs
 * more successful proofs than that window allows. The bucket can contain real
 * local-development traffic, so every test-owned change is compare-and-set
 * guarded: a concurrent change fails the test without being overwritten.
 */
async function readSharedVerifyPasswordRateLimit() {
  return pool.query<SharedVerifyPasswordRateLimit>(
    `select id, count, last_request::text as "lastRequest"
     from rate_limits
     where key = $1`,
    [sharedVerifyPasswordRateLimitKey],
  )
}

function requireSharedVerifyPasswordRateLimitExpected() {
  if (sharedVerifyPasswordRateLimitExpected === undefined) {
    throw new Error('Shared verify-password rate limit was not snapshotted')
  }

  return sharedVerifyPasswordRateLimitExpected
}

async function clearSharedVerifyPasswordRateLimit() {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)
  const expected = requireSharedVerifyPasswordRateLimitExpected()

  if (expected === null) {
    const current = await readSharedVerifyPasswordRateLimit()
    expect(current.rows).toEqual([])
    return
  }

  const cleared = await pool.query<SharedVerifyPasswordRateLimit>(
    `update rate_limits
     set count = 0, last_request = last_request - 61_000
     where key = $1
       and id = $2
       and count = $3
       and last_request = $4
     returning id, count, last_request::text as "lastRequest"`,
    [
      sharedVerifyPasswordRateLimitKey,
      expected.id,
      expected.count,
      expected.lastRequest,
    ],
  )
  expect(cleared.rows).toHaveLength(1)
  const [current] = cleared.rows
  if (current === undefined) {
    throw new Error('Shared verify-password rate limit changed before clearing')
  }
  sharedVerifyPasswordRateLimitExpected = current
}

/**
 * The action response arrives only after Better Auth has completed its
 * verify-password call. Recording the resulting one-count row makes every
 * subsequent test mutation and final restoration compare-and-set guarded.
 */
async function recordVerifyPasswordRateLimitResponse() {
  const expected = requireSharedVerifyPasswordRateLimitExpected()
  const current = await readSharedVerifyPasswordRateLimit()
  expect(current.rows).toHaveLength(1)
  const [row] = current.rows
  if (row === undefined) {
    throw new Error('Verify-password did not create its expected rate limit')
  }
  expect(row.count).toBe(1)
  if (expected !== null) {
    expect(expected.count).toBe(0)
    expect(row.id).toBe(expected.id)
    expect(BigInt(row.lastRequest)).toBeGreaterThan(
      BigInt(expected.lastRequest),
    )
  }
  sharedVerifyPasswordRateLimitExpected = row
}

async function sendDeletionCode(page: Page) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/settings',
  )
  await page.getByRole('button', { name: 'Send deletion code' }).click()
  await response
  await recordVerifyPasswordRateLimitResponse()
}

async function restoreSharedVerifyPasswordRateLimit() {
  if (
    sharedVerifyPasswordRateLimitBefore === undefined ||
    sharedVerifyPasswordRateLimitExpected === undefined
  ) {
    return
  }

  const expected = sharedVerifyPasswordRateLimitExpected
  const before = sharedVerifyPasswordRateLimitBefore

  if (before === null) {
    if (expected === null) {
      const current = await readSharedVerifyPasswordRateLimit()
      expect(current.rows).toEqual([])
      return
    }

    const deleted = await pool.query<SharedVerifyPasswordRateLimit>(
      `delete from rate_limits
       where key = $1
         and id = $2
         and count = $3
         and last_request = $4
       returning id, count, last_request::text as "lastRequest"`,
      [
        sharedVerifyPasswordRateLimitKey,
        expected.id,
        expected.count,
        expected.lastRequest,
      ],
    )
    expect(deleted.rows).toEqual([expected])
  } else {
    if (expected === null) {
      throw new Error(
        'Shared verify-password rate limit disappeared during test',
      )
    }

    const restored = await pool.query<SharedVerifyPasswordRateLimit>(
      `update rate_limits
       set id = $2, count = $3, last_request = $4
       where key = $1
         and id = $5
         and count = $6
         and last_request = $7
       returning id, count, last_request::text as "lastRequest"`,
      [
        sharedVerifyPasswordRateLimitKey,
        before.id,
        before.count,
        before.lastRequest,
        expected.id,
        expected.count,
        expected.lastRequest,
      ],
    )
    expect(restored.rows).toEqual([before])
  }

  const restored = await readSharedVerifyPasswordRateLimit()
  expect(restored.rows).toEqual(before === null ? [] : [before])
}

async function signIn(page: Page, owner: (typeof owners)[keyof typeof owners]) {
  await page.goto('/sign-in')

  for (let attempt = 1; ; attempt += 1) {
    await page.getByRole('textbox', { name: 'Email' }).fill(owner.email)
    await page.getByRole('textbox', { name: 'Password' }).fill(password)
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/auth/sign-in/email',
    )
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const status = (await response).status()
    if (status === 200) return
    expect(status).toBe(429)
    expect(attempt).toBeLessThan(signInRateLimitAttempts)
    await page.waitForTimeout(signInRateLimitWaitMilliseconds)
  }
}

async function authenticateContext(
  context: BrowserContext,
  owner: (typeof owners)[keyof typeof owners],
) {
  const requestSignIn = () =>
    context.request.post(`${applicationOrigin}/api/auth/sign-in/email`, {
      data: { email: owner.email, password },
      headers: { origin: applicationOrigin },
    })

  let response = await requestSignIn()
  for (
    let attempt = 1;
    response.status() === 429 && attempt < signInRateLimitAttempts;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, signInRateLimitWaitMilliseconds),
    )
    response = await requestSignIn()
  }
  expect(response.status()).toBe(200)
}

async function signOutContext(context: BrowserContext) {
  const response = await context.request.post(
    `${applicationOrigin}/api/auth/sign-out`,
    { data: {}, headers: { origin: applicationOrigin } },
  )
  expect(response.status()).toBe(200)
}

function startCollector(): Promise<void> {
  collector = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/emails') {
      response.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) request.destroy()
      else chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          response.writeHead(400).end()
          return
        }
        collectedEmails.push({
          body: parsed as Record<string, unknown>,
          idempotencyKey: request.headers['idempotency-key'] as
            string | undefined,
        })
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ id: randomUUID() }))
      } catch {
        response.writeHead(400).end()
      }
    })
  })
  return new Promise((resolve, reject) => {
    collector!.once('error', reject)
    collector!.listen(fakeResendPort, '127.0.0.1', () => {
      collector!.off('error', reject)
      resolve()
    })
  })
}

async function stopCollector() {
  if (collector === undefined) return
  const server = collector
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  collector = undefined
}

function formatDeadlineUtc(deadline: Date) {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(deadline)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    formatted.find((part) => part.type === type)?.value ?? ''
  return `${value('day')} ${value('month')} ${value('year')} at ${value('hour')}:${value('minute')} UTC`
}

function assertMinimalEmail(
  message: (typeof collectedEmails)[number],
  input: {
    category:
      | 'account_deletion_code'
      | 'account_deletion_requested'
      | 'account_deletion_cancelled'
    recipient: string
    subject: string
    text: string
    html: string
    prohibitedValues: string[]
  },
) {
  expect(Object.keys(message.body).sort()).toEqual(
    ['from', 'html', 'reply_to', 'subject', 'tags', 'text', 'to'].sort(),
  )
  expect(message.body).toMatchObject({
    from: `zedarchive <${expectedEmailFromAddress}>`,
    reply_to: expectedEmailReplyToAddress,
    subject: input.subject,
    tags: [{ name: 'category', value: input.category }],
    text: input.text,
    html: input.html,
  })
  expect([input.recipient, [input.recipient]]).toContainEqual(message.body.to)
  expect(message.idempotencyKey).toMatch(
    new RegExp(`^auth-email/${input.category}/[a-f0-9]{64}$`, 'u'),
  )

  const renderedContent = JSON.stringify({
    from: message.body.from,
    html: message.body.html,
    replyTo: message.body.reply_to,
    subject: message.body.subject,
    tags: message.body.tags,
    text: message.body.text,
  })
  for (const prohibitedValue of input.prohibitedValues.filter(Boolean)) {
    expect(renderedContent).not.toContain(prohibitedValue)
  }
  expect(renderedContent).not.toMatch(
    /(?:127\.0\.0\.1|https?:|href=|bearer|token=)/iu,
  )
}

async function deletionCode(
  expectedCount: number,
  recipient: string,
  username: string,
  userId: string,
) {
  await expect
    .poll(() => collectedEmails.length, { timeout: 15_000 })
    .toBe(expectedCount)
  const message = collectedEmails.at(-1)
  if (message === undefined) throw new Error('Deletion email was not collected')
  const code = /Verification code: (\d{8})/u.exec(
    String(message.body.text),
  )?.[1]
  if (code === undefined) throw new Error('Deletion code was not collected')
  const privateIdentifiers = await pool.query<{
    challenge_id: string
    session_id: string | null
  }>(
    `select challenge_id, session_id
     from deletion_challenges where user_id=$1`,
    [userId],
  )
  const text = [
    'Confirm account deletion',
    '',
    'An account deletion request was started for your zedarchive account.',
    '',
    `Verification code: ${code}`,
    '',
    'This code expires in 10 minutes. If you requested another code, only the newest code works.',
    '',
    'Your account will not be restricted unless the code is entered and the request is confirmed.',
    '',
    'If you did not request this, reset your password.',
  ].join('\n')
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<body>',
    '<main>',
    '<h1>Confirm account deletion</h1>',
    '<p>An account deletion request was started for your zedarchive account.</p>',
    `<p>Verification code: <strong>${code}</strong></p>`,
    '<p>This code expires in 10 minutes. If you requested another code, only the newest code works.</p>',
    '<p>Your account will not be restricted unless the code is entered and the request is confirmed.</p>',
    '<p>If you did not request this, reset your password.</p>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  assertMinimalEmail(message, {
    category: 'account_deletion_code',
    recipient,
    subject: 'Your zedarchive account deletion code',
    text,
    html,
    prohibitedValues: [
      recipient,
      username,
      userId,
      privateIdentifiers.rows[0]?.challenge_id ?? '',
      privateIdentifiers.rows[0]?.session_id ?? '',
    ],
  })
  return code
}

function assertLifecycleEmail(
  expectedCount: number,
  input: {
    kind: 'requested' | 'cancelled'
    recipient: string
    username: string
    userId: string
    purgeAfter: Date
    prohibitedValues?: string[]
  },
) {
  const message = collectedEmails[expectedCount - 1]
  if (message === undefined)
    throw new Error('Lifecycle email was not collected')
  const deadline = formatDeadlineUtc(input.purgeAfter)
  const requested = input.kind === 'requested'
  const subject = requested
    ? 'Deletion requested for your zedarchive account'
    : 'Deletion cancelled for your zedarchive account'
  const paragraphs = requested
    ? [
        '<h1>Account deletion requested</h1>',
        '<p>Your zedarchive account is now restricted.</p>',
        `<p>Recovery ends on ${deadline}. You can cancel before this time by signing in and opening Account deletion.</p>`,
        '<p>After recovery ends, cancellation is unavailable and your live account and archive will be permanently deleted. Encrypted backups may retain copies until they expire.</p>',
        '<p>If you did not request this, sign in and cancel the request, then reset your password.</p>',
      ]
    : [
        '<h1>Account deletion cancelled</h1>',
        '<p>The deletion request for your zedarchive account was cancelled. Your account and archive are available again.</p>',
        '<p>If you did not cancel this request, reset your password.</p>',
      ]
  const text = requested
    ? [
        'Account deletion requested',
        '',
        'Your zedarchive account is now restricted.',
        '',
        `Recovery ends on ${deadline}. You can cancel before this time by signing in and opening Account deletion.`,
        '',
        'After recovery ends, cancellation is unavailable and your live account and archive will be permanently deleted. Encrypted backups may retain copies until they expire.',
        '',
        'If you did not request this, sign in and cancel the request, then reset your password.',
      ].join('\n')
    : [
        'Account deletion cancelled',
        '',
        'The deletion request for your zedarchive account was cancelled. Your account and archive are available again.',
        '',
        'If you did not cancel this request, reset your password.',
      ].join('\n')
  assertMinimalEmail(message, {
    category: requested
      ? 'account_deletion_requested'
      : 'account_deletion_cancelled',
    recipient: input.recipient,
    subject,
    text,
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      ...paragraphs,
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    prohibitedValues: [
      input.recipient,
      input.username,
      input.userId,
      ...(input.prohibitedValues ?? []),
    ],
  })
}

async function accountPrivateIdentifiers(userId: string) {
  const result = await pool.query<{ id: string }>(
    `select id from sessions where user_id=$1
     union all
     select challenge_id from deletion_challenges where user_id=$1`,
    [userId],
  )
  return result.rows.map(({ id }) => id)
}

async function boundedMarkup(page: Page) {
  const markup = await page.content()
  expect(Buffer.byteLength(markup)).toBeLessThanOrEqual(256 * 1024)
  return markup
}

async function captureFlightNavigation(
  page: Page,
  routePattern: string,
  navigate: () => Promise<void>,
) {
  let body = ''
  let cacheControl = ''
  let contentType = ''
  const capture = async (route: import('@playwright/test').Route) => {
    const request = route.request()
    if (request.method() !== 'GET' || request.headers().rsc !== '1') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const responseBody = await response.body()
    expect(responseBody.byteLength).toBeLessThanOrEqual(256 * 1024)
    body += responseBody.toString('utf8')
    cacheControl = response.headers()['cache-control'] ?? ''
    contentType = response.headers()['content-type'] ?? ''
    await route.fulfill({ body: responseBody, response })
  }
  await page.route(routePattern, capture)
  try {
    await navigate()
    await page.waitForLoadState('networkidle')
    await expect.poll(() => body.length).toBeGreaterThan(0)
    return { body, cacheControl, contentType }
  } finally {
    await page.unroute(routePattern, capture)
  }
}

test.beforeAll(async () => {
  if (process.env.RESEND_BASE_URL !== expectedFakeResendBaseUrl) {
    throw new Error(
      'Account-deletion browser email must use the loopback collector',
    )
  }
  await startCollector()
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)
  ownerAId = await insertUser(owners.a)
  ownerBId = await insertUser(owners.b)
  ownerCId = await insertUser(owners.c)
  await insertOwnerAData()
})

test.afterAll(async () => {
  try {
    const target = await pool.query<{ name: string }>(
      'select current_database() as name',
    )
    assertAllowedFixtureDatabase(target.rows[0]?.name)
    await restoreSharedVerifyPasswordRateLimit()
    await pool.query('delete from users where id = any($1::uuid[])', [
      fixtureUserIds,
    ])
    await pool.query(
      'delete from anime_catalogue_items where id = any($1::uuid[])',
      [fixtureCatalogueItemIds],
    )
    const residue = await pool.query<{
      accounts: number
      catalogue: number
      challenges: number
      entries: number
      preferences: number
      requests: number
      sessions: number
      usernameChallenges: number
      usernameRecords: number
      users: number
    }>(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) users,
        (select count(*)::int from accounts where user_id = any($1::uuid[])) accounts,
        (select count(*)::int from sessions where user_id = any($1::uuid[])) sessions,
        (select count(*)::int from account_deletion_requests where user_id = any($1::uuid[])) requests,
        (select count(*)::int from deletion_challenges where user_id = any($1::uuid[])) challenges,
        (select count(*)::int from user_catalogue_preferences where user_id = any($1::uuid[])) preferences,
        (select count(*)::int from anime_entries where user_id = any($1::uuid[])) entries,
        (select count(*)::int from username_change_challenges where user_id = any($1::uuid[])) "usernameChallenges",
        (select count(*)::int from username_change_records where user_id = any($1::uuid[])) "usernameRecords",
        (select count(*)::int from anime_catalogue_items where id = any($2::uuid[])) catalogue`,
      [fixtureUserIds, fixtureCatalogueItemIds],
    )
    expect(residue.rows[0]).toEqual({
      accounts: 0,
      catalogue: 0,
      challenges: 0,
      entries: 0,
      preferences: 0,
      requests: 0,
      sessions: 0,
      usernameChallenges: 0,
      usernameRecords: 0,
      users: 0,
    })
  } finally {
    await pool.end()
    await stopCollector()
    collectedEmails.splice(0)
    expect(collectedEmails).toHaveLength(0)
  }
})

test('requests, restricts, and cancels deletion without cross-owner disclosure', async ({
  browser,
  page,
}) => {
  test.setTimeout(600_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)

  const secondA = await browser.newContext({ baseURL: applicationOrigin })
  const thirdA = await browser.newContext({ baseURL: applicationOrigin })
  const ownerB = await browser.newContext({ baseURL: applicationOrigin })
  try {
    await authenticateContext(secondA, owners.a)
    await authenticateContext(ownerB, owners.b)
    await signIn(page, owners.a)
    const sharedRateLimit = await readSharedVerifyPasswordRateLimit()
    sharedVerifyPasswordRateLimitBefore = sharedRateLimit.rows[0] ?? null
    sharedVerifyPasswordRateLimitExpected = sharedRateLimit.rows[0] ?? null

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 960 },
    ]) {
      await page.setViewportSize(viewport)
      const response = await page.goto('/settings')
      expect(response?.status()).toBe(200)
      await expectPrivateNoStore(response!)
      await expect(
        page.getByRole('heading', { name: 'Delete account' }),
      ).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }

    const settingsSheets = page.locator('main#main-content .za-card--raised')
    await expect(settingsSheets).toHaveCount(4)
    await expectRepresentativeAccessibilityBasics(page)
    await expectTargetAtLeast24Px(
      page.getByRole('button', { name: 'Send deletion code', exact: true }),
    )
    const settingsDeletionSheet = page
      .getByRole('heading', { name: 'Delete account', exact: true })
      .locator('xpath=ancestor::section[1]')
    await expect(settingsDeletionSheet).toHaveClass(/\bborder-destructive\b/)

    await page.setViewportSize({ width: 320, height: 568 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expect
      .poll(() =>
        page
          .locator('main#main-content')
          .evaluate((main) => main.scrollWidth <= main.clientWidth),
      )
      .toBe(true)
    await expect(
      page.getByRole('button', { name: 'Send deletion code' }),
    ).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.style.fontSize = ''
    })

    await page.setViewportSize({ width: 1280, height: 960 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expectNoDocumentHorizontalOverflowForAccessibility(page)
    await applyWcagTextSpacing(page)
    await expectTextSpacingLayout(page, {
      content: [
        page.getByRole('heading', { name: 'Delete account', exact: true }),
        deletionSection(page).getByText('Current password', { exact: true }),
      ],
      controls: [
        currentPasswordField(page),
        page.getByRole('button', { name: 'Send deletion code', exact: true }),
      ],
    })
    await page.goto('/settings')

    const preservedBefore = await preservedOwnerAData()
    const staleSettingsPage = await page.context().newPage()
    const assertNoStaleSettingsErrors =
      monitorUnexpectedBrowserErrors(staleSettingsPage)
    const staleSettingsResponse = await staleSettingsPage.goto('/settings')
    expect(staleSettingsResponse?.status()).toBe(200)
    await expectPrivateNoStore(staleSettingsResponse!)

    await clearSharedVerifyPasswordRateLimit()
    await currentPasswordField(page).fill(`${password}-wrong`)
    await sendDeletionCode(page)
    await expect(
      page.getByRole('alert').filter({
        hasText: 'Your current password is incorrect.',
      }),
    ).toBeFocused()
    expect(
      (
        await pool.query(
          'select count(*)::int count from deletion_challenges where user_id=$1',
          [ownerAId],
        )
      ).rows[0]?.count,
    ).toBe(0)

    await clearSharedVerifyPasswordRateLimit()
    await currentPasswordField(page).fill(password)
    await sendDeletionCode(page)
    const firstCode = await deletionCode(
      1,
      owners.a.email,
      owners.a.username,
      ownerAId,
    )
    await expect(
      page.getByRole('button', { name: 'Send another code' }),
    ).toBeDisabled()
    await expect(
      page.getByText(
        'Wait a moment before sending another code. Refresh settings after the cooldown if JavaScript is unavailable.',
      ),
    ).toBeVisible()

    const cooldownPage = await page.context().newPage()
    await cooldownPage.clock.install()
    const cooldownResponse = await cooldownPage.goto('/settings')
    expect(cooldownResponse?.status()).toBe(200)
    await expectPrivateNoStore(cooldownResponse!)
    const cooldownForm = cooldownPage
      .getByRole('button', { name: 'Send another code', exact: true })
      .locator('..')
    const cooldownStatus = cooldownForm.locator('[role="status"]')
    await expect(cooldownStatus).toHaveAttribute('aria-live', 'polite')
    await expect(cooldownStatus).toHaveText('')
    const cooldownStatusElement = await cooldownStatus.elementHandle()
    if (cooldownStatusElement === null) {
      throw new Error('Deletion cooldown status region was not rendered')
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

    await pool.query(
      `update deletion_challenges
       set last_sent_at = last_sent_at - interval '61 seconds',
           send_window_started_at
             = send_window_started_at - interval '61 seconds'
       where user_id = $1`,
      [ownerAId],
    )
    await page.reload()
    await page.getByRole('button', { name: 'Send another code' }).click()
    const secondCode = await deletionCode(
      2,
      owners.a.email,
      owners.a.username,
      ownerAId,
    )
    expect(secondCode).not.toBe(firstCode)

    const codeInput = page.getByRole('textbox', { name: 'Deletion code' })
    const confirmation = deletionConfirmation(page)
    await expectRepresentativeAccessibilityBasics(page)
    await expectTargetAtLeast24Px(codeInput)
    await expectTargetAtLeast24Px(confirmation)
    await codeInput.fill(firstCode)
    await page.getByRole('button', { name: 'Request account deletion' }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Confirm that you understand' }),
    ).toBeFocused()
    await confirmation.check()
    await page.getByRole('button', { name: 'Request account deletion' }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Enter the correct eight-digit deletion code.' }),
    ).toBeFocused()
    expect(
      (
        await pool.query(
          'select failed_code_attempts from deletion_challenges where user_id=$1',
          [ownerAId],
        )
      ).rows[0]?.failed_code_attempts,
    ).toBe(1)

    await page.getByRole('button', { name: 'Cancel deletion setup' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Deletion setup cancelled.' }),
    ).toBeFocused()
    expect(
      (
        await pool.query(
          'select session_id, send_count from deletion_challenges where user_id=$1',
          [ownerAId],
        )
      ).rows[0],
    ).toEqual({ send_count: 2, session_id: null })

    await clearSharedVerifyPasswordRateLimit()
    await currentPasswordField(page).fill(password)
    await sendDeletionCode(page)
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Wait a moment before sending another code.' }),
    ).toBeFocused()
    expect(collectedEmails).toHaveLength(2)
    expect(
      (
        await pool.query(
          'select send_count from deletion_challenges where user_id=$1',
          [ownerAId],
        )
      ).rows[0]?.send_count,
    ).toBe(2)

    await pool.query(
      `update deletion_challenges
       set last_sent_at = last_sent_at - interval '61 seconds',
           send_window_started_at
             = send_window_started_at - interval '61 seconds'
       where user_id = $1`,
      [ownerAId],
    )
    // React resets the form after each action, so the proof must be re-entered.
    await clearSharedVerifyPasswordRateLimit()
    await currentPasswordField(page).fill(password)
    await sendDeletionCode(page)
    const newestCode = await deletionCode(
      3,
      owners.a.email,
      owners.a.username,
      ownerAId,
    )
    const ownerAPrivateValuesBeforeRequest =
      await accountPrivateIdentifiers(ownerAId)
    const newestCodeInput = page.getByRole('textbox', {
      name: 'Deletion code',
    })
    const newestConfirmation = deletionConfirmation(page)
    const requestDeletionButton = page.getByRole('button', {
      name: 'Request account deletion',
    })
    await newestCodeInput.fill(newestCode)
    await expectVisibleFocusIndicator(newestCodeInput)
    await page.keyboard.press('Tab')
    await expectVisibleFocusIndicator(newestConfirmation)
    await page.keyboard.press('Shift+Tab')
    await expectVisibleFocusIndicator(newestCodeInput)
    await page.keyboard.press('Tab')
    await expectVisibleFocusIndicator(newestConfirmation)
    await page.keyboard.press('Tab')
    await expectVisibleFocusIndicator(requestDeletionButton)
    await page.keyboard.press('Shift+Tab')
    await expectVisibleFocusIndicator(newestConfirmation)
    await page.keyboard.press('Space')
    await expect(newestConfirmation).toBeChecked()
    await page.keyboard.press('Tab')
    await expectVisibleFocusIndicator(requestDeletionButton)
    await page.keyboard.press('Enter')
    await page.waitForURL('/account/deletion')
    await expect.poll(() => collectedEmails.length).toBe(4)
    expect(collectedEmails[3]?.body).toMatchObject({
      subject: 'Deletion requested for your zedarchive account',
      tags: [{ name: 'category', value: 'account_deletion_requested' }],
    })
    await expect(
      page.getByRole('heading', { name: 'Account deletion requested' }),
    ).toBeVisible()
    await expectRaisedPaper(page.locator('main#main-content > section'))
    await expect(page.getByText('Recovery ends on')).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Account' }).getByRole('link', {
        name: 'Account deletion',
      }),
    ).toBeVisible()
    await expect(page.getByText(`@${owners.a.username}`)).toHaveCount(0)
    await expect(page.getByText('My anime')).toHaveCount(0)
    expect(page.url()).not.toContain('?')

    const request = await pool.query<{
      hours: number
      purge_after: Date
      requested_at: Date
    }>(
      `select requested_at, purge_after,
              extract(epoch from (purge_after-requested_at))/3600 hours
       from account_deletion_requests where user_id=$1`,
      [ownerAId],
    )
    expect(Number(request.rows[0]?.hours)).toBe(336)
    const ownerAPurgeAfter = request.rows[0]?.purge_after
    if (ownerAPurgeAfter === undefined) {
      throw new Error('Owner A deletion deadline was not persisted')
    }
    await expect.poll(() => collectedEmails.length).toBe(4)
    assertLifecycleEmail(4, {
      kind: 'requested',
      recipient: owners.a.email,
      username: owners.a.username,
      userId: ownerAId,
      purgeAfter: ownerAPurgeAfter,
      prohibitedValues: ownerAPrivateValuesBeforeRequest,
    })

    const settingsDenied = await page.goto('/settings')
    expect(settingsDenied?.status()).toBe(200)
    await page.waitForURL('/account/deletion')
    const archiveDenied = await page.goto('/archive/anime')
    expect(archiveDenied?.status()).toBe(200)
    await page.waitForURL('/account/deletion')

    await staleSettingsPage
      .getByRole('radio', { name: 'English (default)' })
      .check()
    await staleSettingsPage
      .getByRole('button', { name: 'Save title language' })
      .click()
    await expect(
      staleSettingsPage.getByRole('alert').filter({
        hasText: 'We couldn’t save your title language right now. Try again.',
      }),
    ).toBeFocused()
    expect((await preservedOwnerAData()).preference).toEqual(
      preservedBefore.preference,
    )

    const pendingHome = await page.goto('/?q=M33%20Public')
    expect(pendingHome?.status()).toBe(200)
    await expectPrivateNoStore(pendingHome!)
    await expect(
      page.getByRole('heading', { name: 'M33 Public English' }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'M33 Public Original' }),
    ).toHaveCount(0)

    const pendingAFlight = await captureFlightNavigation(
      page,
      '**/account/deletion**',
      () =>
        page
          .getByRole('link', { name: 'Account deletion', exact: true })
          .click(),
    )
    expect(pendingAFlight.contentType).toContain('text/x-component')
    expect(pendingAFlight.cacheControl).toContain('private')
    expect(pendingAFlight.cacheControl).toContain('no-store')
    const pendingAMarkup = await boundedMarkup(page)
    for (const prohibited of [
      owners.a.username,
      owners.b.username,
      owners.a.email,
      owners.b.email,
      ownerAId,
      ownerBId,
      ownerAEntryId,
      newestCode,
    ]) {
      expect(pendingAMarkup).not.toContain(prohibited)
      expect(pendingAFlight.body).not.toContain(prohibited)
    }

    const secondAPage = await secondA.newPage()
    const assertNoSecondAErrors = monitorUnexpectedBrowserErrors(secondAPage)
    await secondAPage.goto('/settings')
    await expect(
      secondAPage.getByRole('heading', { name: 'Account deletion' }),
    ).toHaveCount(0)
    await expect(
      secondAPage.getByRole('main').getByRole('link', { name: 'Sign in' }),
    ).toBeVisible()

    const ownerBPage = await ownerB.newPage()
    const assertNoOwnerBErrors = monitorUnexpectedBrowserErrors(ownerBPage)
    const ownerBSettings = await ownerBPage.goto('/settings')
    expect(ownerBSettings?.status()).toBe(200)
    await expectPrivateNoStore(ownerBSettings!)
    await expect(
      ownerBPage.getByRole('heading', { name: 'Delete account' }),
    ).toBeVisible()
    const ownerBMarkup = await boundedMarkup(ownerBPage)
    expect(ownerBMarkup).not.toContain(owners.a.username)
    expect(ownerBMarkup).not.toContain(ownerAId)
    expect(ownerBMarkup).not.toContain(ownerBId)

    const originStartBefore = await lifecycleEffects(ownerBId)
    let modifiedStartOrigin = false
    const mutateStartOrigin = async (
      route: import('@playwright/test').Route,
    ) => {
      const request = route.request()
      if (!modifiedStartOrigin && request.method() === 'POST') {
        modifiedStartOrigin = true
        await route.continue({
          headers: {
            ...request.headers(),
            'x-forwarded-host': 'm33-host-mismatch.invalid',
            origin: 'http://m33-origin-mismatch.invalid',
          },
        })
        return
      }
      await route.continue()
    }
    await whileOriginRejectionExpected(ownerBPage, async () => {
      await ownerBPage.route('**/settings**', mutateStartOrigin)
      await currentPasswordField(ownerBPage).fill(password)
      const rejectedStart = ownerBPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/settings',
      )
      await ownerBPage
        .getByRole('button', { name: 'Send deletion code' })
        .click()
      expect((await rejectedStart).status()).toBeGreaterThanOrEqual(400)
      expect(modifiedStartOrigin).toBe(true)
      expect(await lifecycleEffects(ownerBId)).toEqual(originStartBefore)
      await ownerBPage.unroute('**/settings**', mutateStartOrigin)
    })
    await ownerBPage.goto('/')
    const ownerBFlight = await captureFlightNavigation(
      ownerBPage,
      '**/settings**',
      () => ownerBPage.getByRole('link', { name: 'Settings' }).click(),
    )
    expect(ownerBFlight.contentType).toContain('text/x-component')
    expect(ownerBFlight.cacheControl).toContain('private')
    expect(ownerBFlight.cacheControl).toContain('no-store')
    // Owner B's own public username belongs in their own settings payload;
    // every other owner, address, identifier, and secret must not appear.
    for (const prohibited of [
      owners.a.username,
      owners.a.email,
      owners.b.email,
      ownerAId,
      ownerBId,
      ownerAEntryId,
      newestCode,
    ]) {
      expect(ownerBFlight.body).not.toContain(prohibited)
    }
    await signOutContext(ownerB)
    assertNoOwnerBErrors()
    await ownerBPage.close()

    await authenticateContext(thirdA, owners.a)
    const ownerAPrivateValuesAtCancellation =
      await accountPrivateIdentifiers(ownerAId)
    const thirdAPage = await thirdA.newPage()
    const assertNoThirdAErrors = monitorUnexpectedBrowserErrors(thirdAPage)
    await thirdAPage.goto('/')
    const laterAFlight = await captureFlightNavigation(
      thirdAPage,
      '**/account/deletion**',
      () =>
        thirdAPage
          .getByRole('link', { name: 'Account deletion', exact: true })
          .click(),
    )
    expect(laterAFlight.contentType).toContain('text/x-component')
    expect(laterAFlight.cacheControl).toContain('private')
    expect(laterAFlight.cacheControl).toContain('no-store')
    for (const prohibited of [
      owners.a.username,
      owners.b.username,
      owners.a.email,
      owners.b.email,
      ownerAId,
      ownerBId,
      ownerAEntryId,
      newestCode,
    ]) {
      expect(laterAFlight.body).not.toContain(prohibited)
    }
    await thirdAPage
      .getByRole('button', { name: 'Cancel account deletion' })
      .click()
    await expect(
      thirdAPage.getByRole('status').filter({
        hasText:
          'Account deletion cancelled. Your account and archive are available again.',
      }),
    ).toBeFocused()
    await expect.poll(() => collectedEmails.length).toBe(5)
    expect(collectedEmails[4]?.body).toMatchObject({
      subject: 'Deletion cancelled for your zedarchive account',
      tags: [{ name: 'category', value: 'account_deletion_cancelled' }],
    })
    expect(
      (
        await pool.query(
          'select count(*)::int count from account_deletion_requests where user_id=$1',
          [ownerAId],
        )
      ).rows[0]?.count,
    ).toBe(0)
    assertLifecycleEmail(5, {
      kind: 'cancelled',
      recipient: owners.a.email,
      username: owners.a.username,
      userId: ownerAId,
      purgeAfter: ownerAPurgeAfter,
      prohibitedValues: ownerAPrivateValuesAtCancellation,
    })
    expect(await preservedOwnerAData()).toEqual(preservedBefore)
    const restoredA1 = await page.goto('/settings')
    expect(restoredA1?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: 'Delete account' }),
    ).toBeVisible()
    await thirdAPage.getByRole('link', { name: 'Return to settings' }).click()
    await expect(
      thirdAPage.getByRole('heading', { name: 'Delete account' }),
    ).toBeVisible()
    await secondAPage.reload()
    await expect(
      secondAPage.getByRole('main').getByRole('link', { name: 'Sign in' }),
    ).toBeVisible()

    const noJavaScriptB = await browser.newContext({
      baseURL: applicationOrigin,
      javaScriptEnabled: false,
    })
    const originCancelB = await browser.newContext({
      baseURL: applicationOrigin,
    })
    try {
      await authenticateContext(noJavaScriptB, owners.b)
      const noJavaScriptPage = await noJavaScriptB.newPage()
      const assertNoNoJavaScriptErrors =
        monitorUnexpectedBrowserErrors(noJavaScriptPage)
      const noJavaScriptSettings = await noJavaScriptPage.goto('/settings')
      expect(noJavaScriptSettings?.status()).toBe(200)
      await expectPrivateNoStore(noJavaScriptSettings!)
      await clearSharedVerifyPasswordRateLimit()
      await currentPasswordField(noJavaScriptPage).fill(password)
      await sendDeletionCode(noJavaScriptPage)
      await expect(
        noJavaScriptPage.getByRole('textbox', { name: 'Deletion code' }),
      ).toBeVisible()
      const ownerBCode = await deletionCode(
        6,
        owners.b.email,
        owners.b.username,
        ownerBId,
      )
      const ownerBPrivateValuesBeforeRequest =
        await accountPrivateIdentifiers(ownerBId)
      await expect(
        noJavaScriptPage.getByRole('button', { name: 'Send another code' }),
      ).toBeDisabled()
      await expect(
        noJavaScriptPage.getByText(
          'Refresh settings after the cooldown if JavaScript is unavailable.',
          { exact: false },
        ),
      ).toBeVisible()
      await noJavaScriptPage
        .getByRole('textbox', { name: 'Deletion code' })
        .fill(ownerBCode)
      await deletionConfirmation(noJavaScriptPage).check()
      await noJavaScriptPage
        .getByRole('button', { name: 'Request account deletion' })
        .click()
      await noJavaScriptPage.waitForURL('/account/deletion')
      await expect(
        noJavaScriptPage.getByRole('heading', {
          name: 'Account deletion requested',
        }),
      ).toBeVisible()
      await expect.poll(() => collectedEmails.length).toBe(7)
      const ownerBRequest = await pool.query<{ purge_after: Date }>(
        `select purge_after from account_deletion_requests where user_id=$1`,
        [ownerBId],
      )
      const ownerBPurgeAfter = ownerBRequest.rows[0]?.purge_after
      if (ownerBPurgeAfter === undefined) {
        throw new Error('Owner B deletion deadline was not persisted')
      }
      assertLifecycleEmail(7, {
        kind: 'requested',
        recipient: owners.b.email,
        username: owners.b.username,
        userId: ownerBId,
        purgeAfter: ownerBPurgeAfter,
        prohibitedValues: ownerBPrivateValuesBeforeRequest,
      })

      await authenticateContext(originCancelB, owners.b)
      const ownerBPrivateValuesAtCancellation =
        await accountPrivateIdentifiers(ownerBId)
      const originCancelPage = await originCancelB.newPage()
      const assertNoOriginCancelErrors =
        monitorUnexpectedBrowserErrors(originCancelPage)
      await originCancelPage.goto('/account/deletion')
      const cancelBefore = await lifecycleEffects(ownerBId)
      let modifiedCancelOrigin = false
      const mutateCancelOrigin = async (
        route: import('@playwright/test').Route,
      ) => {
        const request = route.request()
        if (!modifiedCancelOrigin && request.method() === 'POST') {
          modifiedCancelOrigin = true
          await route.continue({
            headers: {
              ...request.headers(),
              'x-forwarded-host': 'm33-host-mismatch.invalid',
              origin: 'http://m33-origin-mismatch.invalid',
            },
          })
          return
        }
        await route.continue()
      }
      await whileOriginRejectionExpected(originCancelPage, async () => {
        await originCancelPage.route(
          '**/account/deletion**',
          mutateCancelOrigin,
        )
        const rejectedCancel = originCancelPage.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/account/deletion',
        )
        await originCancelPage
          .getByRole('button', { name: 'Cancel account deletion' })
          .click()
        expect((await rejectedCancel).status()).toBeGreaterThanOrEqual(400)
        expect(modifiedCancelOrigin).toBe(true)
        expect(await lifecycleEffects(ownerBId)).toEqual(cancelBefore)
        await originCancelPage.unroute(
          '**/account/deletion**',
          mutateCancelOrigin,
        )
      })

      // The focused confirmation is a hydrated behaviour. Without JavaScript
      // the recovery route re-renders on the server, and the restored active
      // account is redirected to its settings exactly like an active refresh.
      await noJavaScriptPage
        .getByRole('button', { name: 'Cancel account deletion' })
        .click()
      await noJavaScriptPage.waitForURL('/settings')
      await expect(
        noJavaScriptPage.getByRole('heading', { name: 'Delete account' }),
      ).toBeVisible()
      await expect.poll(() => collectedEmails.length).toBe(8)
      assertLifecycleEmail(8, {
        kind: 'cancelled',
        recipient: owners.b.email,
        username: owners.b.username,
        userId: ownerBId,
        purgeAfter: ownerBPurgeAfter,
        prohibitedValues: ownerBPrivateValuesAtCancellation,
      })
      expect(
        (
          await pool.query(
            `select count(*)::int count
             from account_deletion_requests where user_id=$1`,
            [ownerBId],
          )
        ).rows[0]?.count,
      ).toBe(0)
      await signOutContext(noJavaScriptB)
      await signOutContext(originCancelB)
      assertNoNoJavaScriptErrors()
      assertNoOriginCancelErrors()
    } finally {
      await noJavaScriptB.close()
      await originCancelB.close()
    }

    const initialCRequestedAt = new Date()
    await pool.query(
      `insert into account_deletion_requests(user_id,requested_at,purge_after)
       values($1,$2,$2::timestamptz + interval '336 hours')`,
      [ownerCId, initialCRequestedAt],
    )
    const due = await browser.newContext({ baseURL: applicationOrigin })
    try {
      await authenticateContext(due, owners.c)
      const duePage = await due.newPage()
      const assertNoDueErrors = monitorUnexpectedBrowserErrors(duePage)
      await duePage.goto('/account/deletion')
      await expect(
        duePage.getByRole('button', { name: 'Cancel account deletion' }),
      ).toBeVisible()
      await expectRaisedPaper(duePage.locator('main#main-content > section'))
      const dueRequestedAt = new Date(
        initialCRequestedAt.getTime() - 15 * 24 * 60 * 60 * 1000,
      )
      await pool.query(
        `update account_deletion_requests
         set requested_at=$2, purge_after=$2::timestamptz + interval '336 hours'
         where user_id=$1`,
        [ownerCId, dueRequestedAt],
      )
      await duePage
        .getByRole('button', { name: 'Cancel account deletion' })
        .click()
      await expect(
        duePage.getByRole('alert').filter({
          hasText:
            'The recovery period for this account has ended. Account recovery and cancellation are no longer available.',
        }),
      ).toBeFocused()
      await expect(
        duePage.getByRole('heading', {
          level: 1,
          name: 'Recovery period ended',
        }),
      ).toBeVisible()
      await expect(duePage.getByRole('heading', { level: 1 })).toHaveCount(1)
      expect(
        (
          await pool.query(
            'select count(*)::int count from account_deletion_requests where user_id=$1',
            [ownerCId],
          )
        ).rows[0]?.count,
      ).toBe(1)
      await expect(
        duePage.getByText('awaiting permanent deletion', { exact: false }),
      ).toBeVisible()
      await expect(
        duePage.getByRole('button', { name: 'Cancel account deletion' }),
      ).toHaveCount(0)
      await expectRaisedPaper(duePage.locator('main#main-content > section'))
      assertNoDueErrors()
    } finally {
      await signOutContext(due)
      await due.close()
    }

    await staleSettingsPage.close()
    assertNoStaleSettingsErrors()
    assertNoSecondAErrors()
    assertNoThirdAErrors()
    await signOutContext(page.context())
    await signOutContext(thirdA)
    assertNoUnexpectedBrowserErrors()
  } finally {
    await secondA.close()
    await thirdA.close()
    await ownerB.close()
  }
})
