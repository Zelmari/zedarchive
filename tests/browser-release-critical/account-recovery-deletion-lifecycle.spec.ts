import {
  expect,
  test,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Response,
} from '@playwright/test'
import { AccountLifecycleFixture } from './fixtures/account-lifecycle-fixture'
import {
  ReleaseCriticalDiagnostic,
  writeReleaseCriticalFailureDiagnostic,
} from './fixtures/diagnostic-manifest'
import { failReleaseCriticalIfRequested } from './fixtures/controlled-failure'
import { releaseCriticalApplicationOrigin } from './fixtures/release-critical-constants'
import {
  assertDynamicResponsePolicy,
  assertReleaseCriticalSecurityEvidence,
  installReleaseCriticalContextSecurityEvidence,
  installReleaseCriticalSecurityEvidence,
} from './fixtures/response-policy'

test.use({
  acceptDownloads: false,
  screenshot: 'off',
  trace: 'off',
  video: 'off',
})
test.describe.configure({ mode: 'serial' })

const diagnostic = new ReleaseCriticalDiagnostic(
  'account recovery and deletion lifecycle',
)

test.beforeEach(async ({ page }) => {
  await installReleaseCriticalContextSecurityEvidence(page.context())
})

test.afterEach(async ({ page }, testInfo) => {
  await assertReleaseCriticalSecurityEvidence(page.context())
  await writeReleaseCriticalFailureDiagnostic(testInfo, diagnostic)
})

function authResponse(page: Page, pathname: string, timeout?: number) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === pathname,
    timeout === undefined ? undefined : { timeout },
  )
}

async function expectPrivateNoStore(response: Response) {
  const cacheControl = await response.headerValue('cache-control')
  expect(cacheControl).toContain('private')
  expect(cacheControl).toContain('no-store')
}

async function boundedResponseConceals(
  response: Response,
  sentinels: readonly string[],
) {
  const body = await response.body()
  if (body.byteLength > 256 * 1024) {
    throw new TypeError('M42 bounded response exceeded its limit')
  }
  const text = body.toString('utf8')
  return sentinels.every((sentinel) => !text.includes(sentinel))
}

async function signIn(
  fixture: AccountLifecycleFixture,
  page: Page,
  identity: Readonly<{ email: string }>,
  password: string,
  expectedStatus = 200,
) {
  await page.goto('/sign-in')
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(identity.email)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password)
  await fixture.prepareRateLimitRequest('sign-in')
  const response = authResponse(page, '/api/auth/sign-in/email')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const status = (await response).status()
  await fixture.recordRateLimitRequest('sign-in')
  expect(status).toBe(expectedStatus)
  return status
}

async function signOutIfAvailable(
  fixture: AccountLifecycleFixture,
  page: Page,
  timeout = 30_000,
) {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await signOut.isVisible({ timeout }).catch(() => false))) return
  await fixture.prepareRateLimitRequest('sign-out')
  const response = authResponse(page, '/api/auth/sign-out', timeout)
  await signOut.click({ timeout })
  const status = (await response).status()
  await fixture.recordRateLimitRequest('sign-out')
  expect(status).toBe(200)
  await page.reload({ timeout })
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible({ timeout })
}

function deletionSection(page: Page) {
  return page.getByRole('region', { name: 'Delete account', exact: true })
}

function deletionPassword(page: Page) {
  return deletionSection(page).getByRole('textbox', {
    name: 'Current password',
    exact: true,
  })
}

async function sendDeletionCode(
  fixture: AccountLifecycleFixture,
  page: Page,
  password: string,
) {
  await deletionPassword(page).fill(password)
  await fixture.prepareRateLimitRequest('verify-password')
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/settings',
  )
  await page
    .getByRole('button', { name: 'Send deletion code', exact: true })
    .click()
  const status = (await response).status()
  await fixture.recordRateLimitRequest('verify-password')
  expect([200, 303]).toContain(status)
}

async function completeDeletionRequest(
  page: Page,
  fixture: AccountLifecycleFixture,
) {
  await fixture.collectors.fillDeletionCodeOnce(
    page.getByRole('textbox', { name: 'Deletion code', exact: true }),
  )
  await deletionSection(page).getByRole('checkbox').check()
  await page
    .getByRole('button', { name: 'Request account deletion', exact: true })
    .click()
  await page.waitForURL('/account/deletion')
  await expect(
    page.getByRole('heading', {
      name: 'Account deletion requested',
      exact: true,
    }),
  ).toBeVisible()
}

async function submitForgotPassword(
  fixture: AccountLifecycleFixture,
  page: Page,
  email: string,
) {
  await page.goto('/forgot-password')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await fixture.prepareRateLimitRequest('request-password-reset')
  const response = authResponse(page, '/api/auth/request-password-reset')
  await page
    .getByRole('button', { name: 'Send reset link', exact: true })
    .click()
  const status = (await response).status()
  await fixture.recordRateLimitRequest('request-password-reset')
  expect(status).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Check your email', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'If this address can be used, we will send a password reset link.',
      { exact: true },
    ),
  ).toBeVisible()
  return true
}

async function withPageScopedExtraHeaders<T>(
  page: Page,
  headers: Readonly<Record<string, string>>,
  run: () => Promise<T>,
) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Network.enable')
    await session.send('Network.setExtraHTTPHeaders', {
      headers: { 'x-vercel-forwarded-for': '127.0.0.1', ...headers },
    })
    return await run()
  } finally {
    await session.send('Network.setExtraHTTPHeaders', {
      headers: { 'x-vercel-forwarded-for': '127.0.0.1' },
    })
    await session.send('Network.disable')
    await session.detach()
  }
}

async function authenticatedPage(
  fixture: AccountLifecycleFixture,
  context: BrowserContext,
  identity: Readonly<{ email: string }>,
  password: string,
) {
  const page = await context.newPage()
  await installReleaseCriticalSecurityEvidence(page)
  await signIn(fixture, page, identity, password)
  await expect(page.getByText('Signed in as', { exact: false })).toBeVisible()
  return page
}

test('account recovery and deletion lifecycle', async ({ browser, page }) => {
  test.setTimeout(600_000)
  const fixture = new AccountLifecycleFixture()
  const ownerASecondContext = await browser.newContext({
    baseURL: releaseCriticalApplicationOrigin,
    extraHTTPHeaders: { 'x-vercel-forwarded-for': '127.0.0.1' },
  })
  const ownerBContext = await browser.newContext({
    baseURL: releaseCriticalApplicationOrigin,
    extraHTTPHeaders: { 'x-vercel-forwarded-for': '127.0.0.1' },
  })
  await installReleaseCriticalContextSecurityEvidence(ownerASecondContext)
  await installReleaseCriticalContextSecurityEvidence(ownerBContext)
  let ownerASecondPage: Page | undefined
  let ownerBPage: Page | undefined
  let staleSettingsPage: Page | undefined
  let staleArchivePage: Page | undefined
  let noJavaScriptPage: Page | undefined
  let noJavaScriptSession: CDPSession | undefined
  let primaryError: unknown

  try {
    diagnostic.stage('setup')
    await fixture.setup()
    diagnostic.checkpoint('databaseGuarded')
    await fixture.captureArchiveFingerprint()
    await fixture.collectors.start()

    const signedOutSettings = await page.goto('/settings')
    if (signedOutSettings === null) {
      throw new TypeError('M42 signed-out settings response is unavailable')
    }
    expect(signedOutSettings.status()).toBe(200)
    await expectPrivateNoStore(signedOutSettings)
    await assertDynamicResponsePolicy(signedOutSettings, {
      cache: 'private-no-store',
      contentType: 'html',
      status: 200,
    })
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Delete account', exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('input, button[type="submit"]')).toHaveCount(0)

    await signIn(fixture, page, fixture.owners.a, fixture.originalPassword)
    diagnostic.checkpoint('signedIn')
    await expect(page.getByText('Signed in as', { exact: false })).toBeVisible()
    ownerASecondPage = await authenticatedPage(
      fixture,
      ownerASecondContext,
      fixture.owners.a,
      fixture.originalPassword,
    )
    ownerBPage = await authenticatedPage(
      fixture,
      ownerBContext,
      fixture.owners.b,
      fixture.originalPassword,
    )
    await ownerBPage.goto('/settings')
    await expect(
      ownerBPage.getByText(`@${fixture.owners.a.username}`, { exact: true }),
    ).toHaveCount(0)
    await expect(
      ownerBPage.getByText(`@${fixture.owners.b.username}`, { exact: true }),
    ).toBeVisible()
    expect(await fixture.lifecycleCounts('b')).toEqual({
      challenges: 0,
      requests: 0,
      sessions: 1,
    })

    const originBefore = await fixture.lifecycleCounts('b')
    await deletionPassword(ownerBPage).fill(fixture.originalPassword)
    const rejectedOriginStatus = await withPageScopedExtraHeaders(
      ownerBPage,
      {
        Origin: 'http://m42-origin-mismatch.invalid',
        'X-Forwarded-Host': 'm42-host-mismatch.invalid',
      },
      async () => {
        const rejectedOrigin = ownerBPage!.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/settings',
        )
        await ownerBPage!
          .getByRole('button', { name: 'Send deletion code', exact: true })
          .click()
        return (await rejectedOrigin).status()
      },
    )
    expect(rejectedOriginStatus).toBeGreaterThanOrEqual(400)
    expect(await fixture.lifecycleCounts('b')).toEqual(originBefore)
    expect(fixture.collectors.lifecycleEvidence().deletionCodeCount).toBe(0)

    staleSettingsPage = await page.context().newPage()
    await installReleaseCriticalSecurityEvidence(staleSettingsPage)
    const staleSettingsResponse = await staleSettingsPage.goto('/settings')
    if (staleSettingsResponse === null) {
      throw new TypeError('M42 stale settings response is unavailable')
    }
    await expectPrivateNoStore(staleSettingsResponse)
    staleArchivePage = await page.context().newPage()
    await installReleaseCriticalSecurityEvidence(staleArchivePage)
    const staleArchiveResponse = await staleArchivePage.goto('/archive/anime')
    if (staleArchiveResponse === null) {
      throw new TypeError('M42 stale archive response is unavailable')
    }
    await expectPrivateNoStore(staleArchiveResponse)
    await expect(
      staleArchivePage.getByRole('heading', {
        name: fixture.catalogueOriginalTitle,
        exact: true,
      }),
    ).toBeVisible()

    diagnostic.stage('account-deletion', '/settings')
    await page.goto('/settings')
    await sendDeletionCode(fixture, page, fixture.originalPassword)
    await fixture.collectors.waitForLifecycleMessage('account_deletion_code', 1)
    noJavaScriptPage = await page.context().newPage()
    await installReleaseCriticalSecurityEvidence(noJavaScriptPage)
    noJavaScriptSession = await page.context().newCDPSession(noJavaScriptPage)
    await noJavaScriptSession.send('Emulation.setScriptExecutionDisabled', {
      value: true,
    })
    const noJavaScriptSettingsResponse =
      await noJavaScriptPage.goto('/settings')
    expect(noJavaScriptSettingsResponse?.status()).toBe(200)
    await completeDeletionRequest(noJavaScriptPage, fixture)
    await fixture.collectors.waitForLifecycleMessage(
      'account_deletion_requested',
      1,
    )
    expect(await fixture.deletionRequestEvidence('a')).toEqual({
      count: 1,
      exactHours: true,
    })
    expect(await fixture.lifecycleCounts('a')).toEqual({
      challenges: 0,
      requests: 1,
      sessions: 1,
    })
    expect(await fixture.archiveFingerprintUnchanged()).toBe(true)
    diagnostic.checkpoint('deletionConfirmed')

    const pendingResponse = await page.goto('/account/deletion')
    if (pendingResponse === null) {
      throw new TypeError('M42 pending response is unavailable')
    }
    await expectPrivateNoStore(pendingResponse)
    expect(
      await boundedResponseConceals(pendingResponse, [
        fixture.owners.a.username,
        fixture.owners.b.username,
        fixture.owners.a.email,
        fixture.owners.b.email,
        fixture.ownerId('a'),
        fixture.ownerId('b'),
        fixture.catalogueTitle,
        fixture.catalogueOriginalTitle,
      ]),
    ).toBe(true)

    await staleSettingsPage
      .getByRole('radio', { name: 'English (default)', exact: true })
      .check()
    await staleSettingsPage
      .getByRole('button', { name: 'Save title language', exact: true })
      .click()
    await expect(
      staleSettingsPage.getByRole('alert').filter({
        hasText: 'We couldn’t save your title language right now. Try again.',
      }),
    ).toBeFocused()
    expect(await fixture.archiveFingerprintUnchanged()).toBe(true)

    const staleArchiveCard = staleArchivePage.locator('article').filter({
      has: staleArchivePage.getByRole('heading', {
        name: fixture.catalogueOriginalTitle,
        exact: true,
      }),
    })
    await staleArchiveCard
      .getByRole('button', {
        name: `Edit status — ${fixture.catalogueOriginalTitle}`,
        exact: true,
      })
      .click()
    await staleArchiveCard
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('completed')
    await staleArchiveCard
      .getByRole('button', {
        name: `Save status — ${fixture.catalogueOriginalTitle}`,
        exact: true,
      })
      .click()
    await expect(
      staleArchiveCard.getByRole('alert').filter({
        hasText: 'We couldn’t update this status right now. Try again.',
      }),
    ).toBeFocused()
    expect(await fixture.archiveFingerprintUnchanged()).toBe(true)

    const pendingCatalogueResponse = await page.goto(
      `/?q=${encodeURIComponent(fixture.catalogueTitle)}`,
    )
    if (pendingCatalogueResponse === null) {
      throw new TypeError('M42 pending catalogue response is unavailable')
    }
    expect(pendingCatalogueResponse.status()).toBe(200)
    await expectPrivateNoStore(pendingCatalogueResponse)
    await expect(
      page.getByRole('heading', {
        name: fixture.catalogueTitle,
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: fixture.catalogueOriginalTitle,
        exact: true,
      }),
    ).toHaveCount(0)

    await ownerASecondPage.goto('/settings')
    await expect(
      ownerASecondPage
        .getByRole('main')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await page.goto('/account/deletion')
    await expect(
      page.getByText(
        'Your account is restricted. Normal account features are unavailable.',
        { exact: true },
      ),
    ).toBeVisible()
    await ownerBPage.goto('/settings')
    await expect(
      ownerBPage.getByRole('heading', { name: 'Delete account', exact: true }),
    ).toBeVisible()
    diagnostic.stage('account-restriction', '/account/deletion')
    diagnostic.checkpoint('restrictionConfirmed')
    failReleaseCriticalIfRequested('account-restriction')

    diagnostic.stage('account-recovery', '/forgot-password')
    await signOutIfAvailable(fixture, page)
    expect(await fixture.lifecycleCounts('a')).toEqual({
      challenges: 0,
      requests: 1,
      sessions: 0,
    })

    const unknownAcknowledged = await submitForgotPassword(
      fixture,
      page,
      fixture.unknownRecoveryEmail,
    )
    expect(unknownAcknowledged).toBe(true)
    expect(fixture.collectors.lifecycleEvidence().passwordResetCount).toBe(0)
    const knownAcknowledged = await submitForgotPassword(
      fixture,
      page,
      fixture.owners.a.email,
    )
    expect(knownAcknowledged).toBe(unknownAcknowledged)
    await fixture.collectors.waitForLifecycleMessage('password_reset', 1)
    expect(fixture.collectors.lifecycleEvidence().passwordResetCount).toBe(1)

    const resetInboxResponse = await page.goto(fixture.collectors.inboxUrl)
    expect(resetInboxResponse?.status()).toBe(200)
    await page
      .getByRole('link', { name: 'Reset password', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Reset password', exact: true }),
    ).toBeVisible()
    expect((await fixture.lifecycleCounts('a')).sessions).toBe(0)
    await page
      .getByRole('textbox', { name: 'New password', exact: true })
      .fill(fixture.replacementPassword)
    await fixture.prepareRateLimitRequest('reset-password')
    const resetResponse = authResponse(page, '/api/auth/reset-password')
    await page
      .getByRole('button', { name: 'Change password', exact: true })
      .click()
    const resetStatus = (await resetResponse).status()
    await fixture.recordRateLimitRequest('reset-password')
    expect(resetStatus).toBe(200)
    await expect(
      page.getByText(
        'Your password was changed and existing sessions were signed out. Sign in with your new password.',
        { exact: true },
      ),
    ).toBeFocused()
    expect(fixture.collectors.evidence().hibpRequestCount).toBe(1)
    expect((await fixture.lifecycleCounts('a')).sessions).toBe(0)
    diagnostic.checkpoint('recoveryConfirmed')

    await fixture.ageTestOwnedSignInRateLimit()
    await signIn(fixture, page, fixture.owners.a, fixture.originalPassword, 401)
    await expect(
      page.getByText('Email or password is incorrect.', { exact: true }),
    ).toBeFocused()
    await signIn(fixture, page, fixture.owners.a, fixture.replacementPassword)
    await page.waitForURL('/account/deletion')
    await expect(
      page.getByRole('heading', {
        name: 'Account deletion requested',
        exact: true,
      }),
    ).toBeVisible()

    if (noJavaScriptPage === undefined || noJavaScriptSession === undefined) {
      throw new TypeError('M42 no-JavaScript deletion page is unavailable')
    }
    const noJavaScriptPendingResponse =
      await noJavaScriptPage.goto('/account/deletion')
    if (noJavaScriptPendingResponse === null) {
      throw new TypeError('M42 no-JavaScript pending response is unavailable')
    }
    expect(noJavaScriptPendingResponse.status()).toBe(200)
    await expectPrivateNoStore(noJavaScriptPendingResponse)
    await expect(
      noJavaScriptPage.getByRole('heading', {
        name: 'Account deletion requested',
        exact: true,
      }),
    ).toBeVisible()
    await noJavaScriptPage
      .getByRole('button', {
        name: 'Cancel account deletion',
        exact: true,
      })
      .click()
    await noJavaScriptPage.waitForURL('/settings')
    await expect(
      noJavaScriptPage.getByRole('heading', {
        name: 'Delete account',
        exact: true,
      }),
    ).toBeVisible()
    await fixture.collectors.waitForLifecycleMessage(
      'account_deletion_cancelled',
      1,
    )
    expect(await fixture.deletionRequestEvidence('a')).toEqual({
      count: 0,
      exactHours: false,
    })
    expect(await fixture.archiveFingerprintUnchanged()).toBe(true)
    await noJavaScriptSession.send('Emulation.setScriptExecutionDisabled', {
      value: false,
    })
    await noJavaScriptSession.detach()
    noJavaScriptSession = undefined
    await noJavaScriptPage.close()
    noJavaScriptPage = undefined
    await page.goto('/settings')
    await expect(
      page.getByRole('heading', { name: 'Delete account', exact: true }),
    ).toBeVisible()

    expect(fixture.collectors.lifecycleEvidence()).toEqual({
      deletionCancellationCount: 1,
      deletionCodeCount: 1,
      deletionRequestCount: 1,
      passwordResetCount: 1,
      resetInboxReady: false,
      deletionCodeReady: false,
    })

    await signOutIfAvailable(fixture, page)
    await ownerBPage.reload()
    await signOutIfAvailable(fixture, ownerBPage)
    expect(await fixture.archiveFingerprintUnchanged()).toBe(true)
  } catch (error) {
    primaryError = error
  } finally {
    let cleanupError: unknown
    const captureCleanupFailure = async (run: () => Promise<void>) => {
      try {
        await run()
      } catch (error) {
        cleanupError ??= error
      }
    }

    diagnostic.stage('cleanup')
    await captureCleanupFailure(() => signOutIfAvailable(fixture, page, 10_000))
    if (ownerASecondPage !== undefined) {
      const activeOwnerASecondPage = ownerASecondPage
      await captureCleanupFailure(() =>
        signOutIfAvailable(fixture, activeOwnerASecondPage, 10_000),
      )
    }
    if (ownerBPage !== undefined) {
      const activeOwnerBPage = ownerBPage
      await captureCleanupFailure(() =>
        signOutIfAvailable(fixture, activeOwnerBPage, 10_000),
      )
    }
    if (noJavaScriptSession !== undefined) {
      const activeNoJavaScriptSession = noJavaScriptSession
      await captureCleanupFailure(async () => {
        await activeNoJavaScriptSession.send(
          'Emulation.setScriptExecutionDisabled',
          { value: false },
        )
        await activeNoJavaScriptSession.detach()
      })
    }
    if (noJavaScriptPage !== undefined) {
      const activeNoJavaScriptPage = noJavaScriptPage
      await captureCleanupFailure(() => activeNoJavaScriptPage.close())
    }
    await captureCleanupFailure(
      () => ownerASecondPage?.close() ?? Promise.resolve(),
    )
    await captureCleanupFailure(() => ownerBPage?.close() ?? Promise.resolve())
    await captureCleanupFailure(
      () => staleSettingsPage?.close() ?? Promise.resolve(),
    )
    await captureCleanupFailure(
      () => staleArchivePage?.close() ?? Promise.resolve(),
    )
    await captureCleanupFailure(() =>
      assertReleaseCriticalSecurityEvidence(page.context()),
    )
    await captureCleanupFailure(() => page.close())
    await captureCleanupFailure(() =>
      assertReleaseCriticalSecurityEvidence(ownerASecondContext),
    )
    await captureCleanupFailure(() =>
      assertReleaseCriticalSecurityEvidence(ownerBContext),
    )
    await captureCleanupFailure(() => ownerASecondContext.close())
    await captureCleanupFailure(() => ownerBContext.close())
    await captureCleanupFailure(async () => {
      await fixture.cleanup()
      diagnostic.checkpoint('rateLimitsRestored')
    })
    if (cleanupError === undefined) {
      diagnostic.cleanup('passed')
    } else {
      diagnostic.cleanup('failed')
    }
    if (primaryError !== undefined) throw primaryError
    if (cleanupError !== undefined) throw cleanupError
  }
})
