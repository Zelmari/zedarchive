import { expect, test, type Page } from '@playwright/test'
import {
  ReleaseCriticalDiagnostic,
  writeReleaseCriticalFailureDiagnostic,
} from './fixtures/diagnostic-manifest'
import { failReleaseCriticalIfRequested } from './fixtures/controlled-failure'
import { ReleaseCriticalFixture } from './fixtures/release-critical-fixture'
import {
  assertDynamicResponsePolicy,
  assertReleaseCriticalSecurityEvidence,
  installReleaseCriticalContextSecurityEvidence,
} from './fixtures/response-policy'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })
test.describe.configure({ mode: 'serial' })

const diagnostic = new ReleaseCriticalDiagnostic('account and add core')

function cardForTitle(page: Page, title: string) {
  return page.locator('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

function authResponse(page: Page, pathname: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname &&
      response.request().method() !== 'OPTIONS',
  )
}

test.beforeEach(async ({ page }) => {
  await installReleaseCriticalContextSecurityEvidence(page.context())
})

test.afterEach(async ({ page }, testInfo) => {
  await assertReleaseCriticalSecurityEvidence(page.context())
  await writeReleaseCriticalFailureDiagnostic(testInfo, diagnostic)
})

test('account and add core', async ({ page }) => {
  const fixture = new ReleaseCriticalFixture()
  let cleanupPassed = false

  try {
    diagnostic.stage('setup')
    await fixture.setupCatalogue()
    await fixture.snapshotRateLimits()
    await fixture.collectors.start()
    diagnostic.checkpoint('databaseGuarded')

    diagnostic.stage('registration', '/register')
    const registerPage = await page.goto('/register')
    if (registerPage === null) {
      throw new TypeError('M44 registration page response is unavailable')
    }
    await assertDynamicResponsePolicy(registerPage, {
      cache: 'private-no-store',
      contentType: 'html',
      status: 200,
    })
    await expect(
      page.getByRole('heading', {
        name: 'Make the shelves yours.',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByRole('textbox', { name: 'Username', exact: true })
      .fill(fixture.identity.username)
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(fixture.identity.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(fixture.identity.password)
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: 'is available.' }),
    ).toBeVisible()

    const registrationResponse = authResponse(page, '/api/auth/sign-up/email')
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click()
    const registered = await registrationResponse
    diagnostic.responseStatus(registered.status())
    expect(registered.status()).toBe(200)
    await assertDynamicResponsePolicy(registered, {
      cache: 'no-store',
      contentType: 'json',
      status: 200,
    })
    await expect(
      page.getByRole('heading', { name: 'Check your email.', exact: true }),
    ).toBeVisible()
    await fixture.collectors.waitForVerificationMessage()
    const collectorEvidence = fixture.collectors.evidence()
    expect(collectorEvidence.hibpRequestCount).toBe(1)
    expect(collectorEvidence.emailAccepted).toBe(true)
    expect(collectorEvidence.inboxReady).toBe(true)
    diagnostic.checkpoint('hibpExercised')
    diagnostic.checkpoint('emailAccepted')

    const userId = await fixture.discoverRegisteredUser()
    expect(await fixture.corroborateEntry(userId)).toEqual({
      count: 0,
      status: null,
    })

    diagnostic.stage('unverified-sign-in', '/sign-in')
    await page
      .getByRole('link', { name: 'Back to sign in', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(fixture.identity.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(fixture.identity.password)
    const rejectedSignInResponse = authResponse(page, '/api/auth/sign-in/email')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const rejectedSignIn = await rejectedSignInResponse
    diagnostic.responseStatus(rejectedSignIn.status())
    expect(rejectedSignIn.status()).toBe(403)
    await assertDynamicResponsePolicy(rejectedSignIn, {
      cache: 'no-store',
      contentType: 'json',
      status: 403,
    })
    await expect(
      page.getByText('Verify your email before signing in.', { exact: true }),
    ).toBeFocused()
    await expect(page.getByText('Signed in as')).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'My anime', exact: true }),
    ).toHaveCount(0)
    diagnostic.checkpoint('unverifiedRejected')

    diagnostic.stage('verification', '/verify-email')
    const inboxResponse = await page.goto(fixture.collectors.inboxUrl)
    expect(inboxResponse?.status()).toBe(200)
    await page.getByRole('link', { name: 'Verify email', exact: true }).click()
    expect(
      await page.evaluate(() => ({
        hasFragment: window.location.hash.length > 0,
        isVerificationPath: window.location.pathname === '/verify-email',
      })),
    ).toEqual({
      hasFragment: true,
      isVerificationPath: true,
    })
    const verificationResponse = authResponse(page, '/api/auth/verify-email')
    await page
      .getByRole('button', { name: 'Verify email', exact: true })
      .click()
    const verified = await verificationResponse
    diagnostic.responseStatus(verified.status())
    expect(verified.status()).toBe(200)
    await assertDynamicResponsePolicy(verified, {
      cache: 'no-store',
      contentType: 'json',
      status: 200,
    })
    await expect(
      page.getByText('Your email is verified. You can sign in now.', {
        exact: true,
      }),
    ).toBeFocused()
    expect(await page.evaluate(() => window.location.hash === '')).toBe(true)
    diagnostic.checkpoint('fragmentCleared')

    diagnostic.stage('verified-sign-in', '/sign-in')
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Sign in', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(fixture.identity.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(fixture.identity.password)
    const signInResponse = authResponse(page, '/api/auth/sign-in/email')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const signedIn = await signInResponse
    diagnostic.responseStatus(signedIn.status())
    expect(signedIn.status()).toBe(200)
    await assertDynamicResponsePolicy(signedIn, {
      cache: 'no-store',
      contentType: 'json',
      status: 200,
    })
    await expect(page.getByText('Signed in as')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'My anime', exact: true }),
    ).toBeVisible()
    diagnostic.checkpoint('signedIn')
    failReleaseCriticalIfRequested('account')

    diagnostic.stage('add')
    await page.goto(`/?q=${encodeURIComponent(fixture.catalogueTitle)}`)
    const catalogueCard = cardForTitle(page, fixture.catalogueTitle)
    await expect(catalogueCard).toBeVisible()
    const status = catalogueCard.getByRole('combobox', { name: 'Status' })
    await status.selectOption('planned')
    const addResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/',
    )
    await catalogueCard
      .getByRole('button', {
        name: `Add to archive — ${fixture.catalogueTitle}`,
        exact: true,
      })
      .click()
    const added = await addResponse
    expect(added.status()).toBe(200)
    await assertDynamicResponsePolicy(added, {
      cache: 'no-store',
      contentType: 'flight',
      status: 200,
    })
    await expect(
      catalogueCard.getByRole('status').filter({
        hasText: 'Added to your archive as Plan to watch.',
      }),
    ).toBeFocused()
    diagnostic.checkpoint('entrySaved')

    await page.reload()
    await expect(
      cardForTitle(page, fixture.catalogueTitle).getByText(
        'In your archive — Plan to watch',
        { exact: true },
      ),
    ).toBeVisible()

    diagnostic.stage('persistence')
    expect(await fixture.corroborateEntry(userId)).toEqual({
      count: 1,
      status: 'planned',
    })
    diagnostic.checkpoint('persistenceConfirmed')

    diagnostic.stage('sign-out')
    const signOutResponse = authResponse(page, '/api/auth/sign-out')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    const signedOut = await signOutResponse
    diagnostic.responseStatus(signedOut.status())
    expect(signedOut.status()).toBe(200)
    await assertDynamicResponsePolicy(signedOut, {
      cache: 'no-store',
      contentType: 'json',
      status: 200,
    })
    await page.reload()
    await expect(
      page
        .getByRole('navigation', { name: 'Account', exact: true })
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Signed in as')).toHaveCount(0)
    diagnostic.checkpoint('signedOut')
  } finally {
    try {
      await fixture.cleanup()
      diagnostic.cleanup('passed')
      cleanupPassed = true
    } finally {
      if (!cleanupPassed) {
        diagnostic.stage('cleanup')
        diagnostic.cleanup('failed')
      }
    }
  }
})
