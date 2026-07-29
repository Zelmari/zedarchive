import { expect, test } from '@playwright/test'
import {
  applyWcagTextSpacing,
  expectNoDocumentHorizontalOverflow,
  expectRepresentativeAccessibilityBasics,
  expectTargetAtLeast24Px,
  expectTextSpacingLayout,
} from './helpers/accessibility'

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
  await expectRepresentativeAccessibilityBasics(page)
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expectTargetAtLeast24Px(page.getByRole('textbox', { name: 'Email' }))
  await expectTargetAtLeast24Px(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  )
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
    await expectNoDocumentHorizontalOverflow(page)

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
    await expectNoDocumentHorizontalOverflow(page)

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
  await expectNoDocumentHorizontalOverflow(page)

  assertNoUnexpectedErrors()
})

test('keeps public authentication usable with enlarged text and WCAG text spacing', async ({
  page,
}) => {
  const assertNoUnexpectedErrors = monitorUnexpectedBrowserErrors(page)

  await page.setViewportSize({ width: 1280, height: 960 })
  await page.goto('/sign-in')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expectNoDocumentHorizontalOverflow(page)
  await expectTargetAtLeast24Px(page.getByRole('textbox', { name: 'Email' }))
  await expectTargetAtLeast24Px(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  )

  await applyWcagTextSpacing(page)
  await expectTextSpacingLayout(page, {
    content: [page.getByRole('heading', { name: 'Sign in' })],
    controls: [
      page.getByRole('textbox', { name: 'Email' }),
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ],
  })

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

test('keeps client-only account mutations disabled and explains the requirement without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3100',
    javaScriptEnabled: false,
  })

  try {
    const page = await context.newPage()
    const cases = [
      {
        path: '/sign-in',
        notice:
          'JavaScript is required to sign in. Enable JavaScript and try again.',
      },
      {
        path: '/register',
        notice:
          'JavaScript is required to create an account. Enable JavaScript and try again.',
      },
      {
        path: '/forgot-password',
        notice:
          'JavaScript is required to request a password reset. Enable JavaScript and try again.',
      },
      {
        path: '/reset-password',
        notice:
          'JavaScript is required to reset your password. Enable JavaScript and try again.',
      },
      {
        path: '/verify-email',
        notice:
          'JavaScript is required to verify your email. Enable JavaScript and try again.',
      },
    ]

    for (const current of cases) {
      const response = await page.goto(current.path)
      expect(response?.status()).toBe(200)
      await expect(
        page.getByText(current.notice, { exact: true }),
      ).toBeVisible()
      await expect
        .poll(() =>
          page
            .locator('form input:not([type="hidden"]), form button')
            .evaluateAll((controls) =>
              controls.every((control) => control.matches(':disabled')),
            ),
        )
        .toBe(true)
      await expect
        .poll(() =>
          page
            .locator('form')
            .evaluateAll((forms) =>
              forms.every(
                (form) =>
                  form instanceof HTMLFormElement &&
                  new FormData(form).entries().next().done,
              ),
            ),
        )
        .toBe(true)
    }
  } finally {
    await context.close()
  }
})
