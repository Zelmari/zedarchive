import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
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

const { databaseUrl } = readDatabaseRuntimeEnvironment()
const expectedEmailFromAddress = process.env.AUTH_EMAIL_FROM
const expectedEmailReplyToAddress = process.env.AUTH_EMAIL_REPLY_TO
if (!expectedEmailFromAddress || !expectedEmailReplyToAddress) {
  throw new Error('Browser email sender environment is unavailable')
}
const pool = new Pool({ connectionString: databaseUrl })
const fixtureUserIds: string[] = []
let ownerAId = ''
let ownerBId = ''
let ownerCId = ''
let fakeResendServer: Server | undefined
const collectedEmails: Array<{
  body: Record<string, unknown>
  idempotencyKey: string | undefined
}> = []

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
  }
}

function monitorUnexpectedBrowserErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isExpectedSignInRateLimitError(message)
    ) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  return () => {
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
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

async function signIn(page: Page, owner: (typeof owners)[keyof typeof owners]) {
  await page.goto('/sign-in')
  let status = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(owner.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password)
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/auth/sign-in/email',
    )
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    status = (await response).status()
    if (status !== 429) break
    await page.waitForTimeout(60_000)
  }
  expect(status).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function authenticateContext(
  context: BrowserContext,
  owner: (typeof owners)[keyof typeof owners],
) {
  let status = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await context.request.post(
      `${applicationOrigin}/api/auth/sign-in/email`,
      {
        data: { email: owner.email, password },
        headers: { origin: applicationOrigin },
      },
    )
    status = response.status()
    if (status !== 429) break
    await new Promise((resolve) => setTimeout(resolve, 60_000))
  }
  expect(status).toBe(200)
}

async function signOutContext(context: BrowserContext) {
  const response = await context.request.post(
    `${applicationOrigin}/api/auth/sign-out`,
    {
      data: {},
      headers: { origin: applicationOrigin },
    },
  )
  expect(response.status()).toBe(200)
}

async function signOutIfSignedIn(page: Page) {
  const button = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await button.isVisible().catch(() => false))) return
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-out',
  )
  await button.click()
  expect((await response).status()).toBe(200)
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

async function readCollectedUsernameCode(
  expectedCount: number,
  expectedEmail: string,
  prohibitedValues: string[],
) {
  await expect.poll(() => collectedEmails.length).toBe(expectedCount)
  const message = collectedEmails[expectedCount - 1]
  if (message === undefined)
    throw new Error('Synthetic email was not collected')
  const serialized = JSON.stringify(message.body)
  expect(message.body).toMatchObject({
    from: `zedarchive <${expectedEmailFromAddress}>`,
    reply_to: expectedEmailReplyToAddress,
    subject: 'Your zedarchive username change code',
    tags: [{ name: 'category', value: 'username_change' }],
  })
  expect([expectedEmail, [expectedEmail]]).toContainEqual(message.body.to)
  expect(message.idempotencyKey).toMatch(
    /^auth-email\/username_change\/[a-f0-9]{64}$/u,
  )
  for (const prohibitedValue of prohibitedValues) {
    expect(serialized).not.toContain(prohibitedValue)
  }
  const text = message.body.text
  const html = message.body.html
  expect(typeof text).toBe('string')
  expect(typeof html).toBe('string')
  const code = /Verification code: (\d{8})/u.exec(String(text))?.[1]
  if (code === undefined) throw new Error('Synthetic code was not collected')
  expect(String(html)).toContain(code)
  return code
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
  } finally {
    try {
      await pool.end()
    } finally {
      await stopFakeResendCollector()
      collectedEmails.splice(0)
      expect(collectedEmails).toHaveLength(0)
    }
  }
})

test('protects and completes the one-time username-change journey', async ({
  browser,
  page,
}) => {
  test.setTimeout(600_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  let secondOwnerAContext: BrowserContext | undefined
  let expiredOwnerBContext: BrowserContext | undefined
  let noJavaScriptContext: BrowserContext | undefined

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
    const ownerACode = await readCollectedUsernameCode(1, owners.a.email, [
      changedUsername,
      owners.a.username,
      ownerAId,
      ownerBId,
    ])

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

    const privateHtml = await page.content()
    for (const privateValue of [
      owners.a.email,
      owners.b.email,
      ownerAId,
      ownerBId,
      ownerACode,
    ]) {
      expect(privateHtml).not.toContain(privateValue)
    }
    expect(
      await page.evaluate(() => ({
        localStorage: Object.values(window.localStorage),
        sessionStorage: Object.values(window.sessionStorage),
        url: window.location.href,
      })),
    ).toEqual({
      localStorage: [],
      sessionStorage: [],
      url: `${applicationOrigin}/settings`,
    })

    secondOwnerAContext = await browser.newContext({
      baseURL: applicationOrigin,
      javaScriptEnabled: false,
    })
    await authenticateContext(secondOwnerAContext, owners.a)
    const secondOwnerAPage = await secondOwnerAContext.newPage()
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
    await getUsernameSection(page)
      .getByRole('textbox', { name: 'Verification code' })
      .fill(ownerACode)
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

    const incorrectCode = ownerACode === '00000042' ? '00000041' : '00000042'
    await codeInput.fill(incorrectCode)
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
    await codeInput.fill(ownerACode)
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
    await authenticateContext(expiredOwnerBContext, owners.b)
    const staleOwnerBPage = await expiredOwnerBContext.newPage()
    await staleOwnerBPage.goto('/settings')
    await expect(
      getUsernameSection(staleOwnerBPage).getByRole('button', {
        name: 'Send verification code',
        exact: true,
      }),
    ).toBeVisible()
    expect(await staleOwnerBPage.content()).not.toContain(changedUsername)
    let modifiedOriginRequest = false
    await staleOwnerBPage.route('**/settings**', async (route) => {
      const request = route.request()
      if (!modifiedOriginRequest && request.method() === 'POST') {
        modifiedOriginRequest = true
        await route.continue({
          headers: {
            ...request.headers(),
            'x-forwarded-host': 'm32-host-mismatch.invalid',
            origin: 'http://m32-origin-mismatch.invalid',
          },
        })
        return
      }
      await route.continue()
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
    expect((await rejectedOriginResponse).status()).toBeGreaterThanOrEqual(400)
    expect(modifiedOriginRequest).toBe(true)
    expect(await challengeFor(ownerBId)).toBeUndefined()
    expect(await recordFor(ownerBId)).toBeUndefined()
    await staleOwnerBPage.unroute('**/settings**')
    await staleOwnerBPage.reload()

    await signOutContext(expiredOwnerBContext)
    await submitStart(
      staleOwnerBPage,
      `M32E${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password,
    )
    await expect(
      staleOwnerBPage.getByRole('alert').filter({
        hasText: 'Your session has expired. Sign in and try again.',
      }),
    ).toBeFocused()
    expect(await challengeFor(ownerBId)).toBeUndefined()
    expect(await recordFor(ownerBId)).toBeUndefined()

    noJavaScriptContext = await browser.newContext({
      baseURL: applicationOrigin,
      javaScriptEnabled: false,
    })
    await authenticateContext(noJavaScriptContext, owners.c)
    const noJavaScriptPage = await noJavaScriptContext.newPage()
    const noJavaScriptSettings = await noJavaScriptPage.goto('/settings')
    expect(noJavaScriptSettings?.status()).toBe(200)
    await expectPrivateNoStore(noJavaScriptSettings!)
    await submitStart(noJavaScriptPage, noJavaScriptTarget, password)
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toBeVisible()
    await readCollectedUsernameCode(2, owners.c.email, [
      noJavaScriptTarget,
      owners.c.username,
      ownerCId,
    ])
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
    await submitStart(noJavaScriptPage, capitalizationOnlyTarget, password)
    await expect(
      getUsernameSection(noJavaScriptPage).getByRole('textbox', {
        name: 'Verification code',
      }),
    ).toBeVisible()
    const capitalizationCode = await readCollectedUsernameCode(
      3,
      owners.c.email,
      [capitalizationOnlyTarget, owners.c.username, ownerCId],
    )
    await getUsernameSection(noJavaScriptPage)
      .getByRole('textbox', { name: 'Verification code' })
      .fill(capitalizationCode)
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

    await signOutIfSignedIn(page)
    await signOutContext(secondOwnerAContext)
    await signOutContext(noJavaScriptContext)
    assertNoUnexpectedBrowserErrors()
  } finally {
    await secondOwnerAContext?.close()
    await expiredOwnerBContext?.close()
    await noJavaScriptContext?.close()
  }
})
