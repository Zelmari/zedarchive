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
