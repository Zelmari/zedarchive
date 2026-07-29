import { expect, test } from '@playwright/test'

function monitorUnexpectedBrowserErrors(page: import('@playwright/test').Page) {
  let hasConsoleError = false
  let hasPageError = false

  page.on('console', (message) => {
    if (message.type() === 'error') {
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

async function expectNarrowRaisedAuthSheet(
  page: import('@playwright/test').Page,
) {
  const sheet = page.locator('main#main-content > section').first()

  await expect(sheet).toHaveClass(/\bza-card--raised\b/)
  expect(
    await sheet.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none')
  expect(
    await sheet.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(448)
}

test('renders the public sign-in page from the production server', async ({
  page,
}) => {
  const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

  await page.goto('/sign-in')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expectNarrowRaisedAuthSheet(page)

  assertNoUnexpectedErrors()
})

for (const viewport of [
  { name: 'narrow', width: 390, height: 844 },
  { name: 'medium', width: 768, height: 1024 },
  { name: 'wide', width: 1280, height: 960 },
]) {
  test(`keeps public sign-in controls reachable without horizontal overflow at ${viewport.name} width`, async ({
    page,
  }) => {
    const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

    await page.setViewportSize(viewport)
    await page.goto('/sign-in')

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)

    assertNoUnexpectedErrors()
  })
}

for (const route of [
  { path: '/sign-in', heading: 'Sign in' },
  { path: '/register', heading: 'Register' },
  { path: '/register/check-email', heading: 'Check your email' },
  { path: '/verify-email', heading: 'Verify email' },
  { path: '/forgot-password', heading: 'Forgot password' },
  { path: '/forgot-password/sent', heading: 'Check your email' },
  { path: '/reset-password', heading: 'Reset password' },
]) {
  test(`renders ${route.path} as a narrow raised authentication sheet`, async ({
    page,
  }) => {
    const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(route.path)

    await expect(
      page.getByRole('heading', { name: route.heading }),
    ).toBeVisible()
    await expectNarrowRaisedAuthSheet(page)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)

    assertNoUnexpectedErrors()
  })
}

test('keeps the sign-in sheet reachable at 320px with 200% root text', async ({
  page,
}) => {
  const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/sign-in')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })

  await expectNarrowRaisedAuthSheet(page)
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)

  assertNoUnexpectedErrors()
})

test('activates the skip link and moves keyboard focus to the main content', async ({
  page,
}) => {
  const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

  await page.goto('/sign-in')
  await page.keyboard.press('Tab')

  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main-content')).toBeFocused()

  assertNoUnexpectedErrors()
})
