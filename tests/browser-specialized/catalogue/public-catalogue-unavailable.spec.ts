import net from 'node:net'
import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off', trace: 'off' })

const applicationOrigin = 'http://127.0.0.1:3101'

async function expectPortOneToRefuseConnections() {
  const refused = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 1 })
    const finish = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }

    socket.once('connect', () => finish(false))
    socket.once('error', (error) =>
      finish((error as NodeJS.ErrnoException).code === 'ECONNREFUSED'),
    )
    socket.setTimeout(1_000, () => finish(false))
  })

  expect(refused).toBe(true)
}

function monitorBoundedUnavailableEvidence(page: Page) {
  let externalRequestObserved = false
  let frameworkConsoleErrorCount = 0
  let pageErrorObserved = false

  page.on('request', (request) => {
    try {
      const url = new URL(request.url())
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.origin !== applicationOrigin
      ) {
        externalRequestObserved = true
      }
    } catch {
      externalRequestObserved = true
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') frameworkConsoleErrorCount += 1
  })
  page.on('pageerror', () => {
    pageErrorObserved = true
  })

  return () => {
    expect(externalRequestObserved).toBe(false)
    expect(frameworkConsoleErrorCount).toBeGreaterThanOrEqual(1)
    expect(frameworkConsoleErrorCount).toBeLessThanOrEqual(3)
    expect(pageErrorObserved).toBe(false)
  }
}

async function expectPrivacySafeUnavailableMarkup(page: Page) {
  await expect(
    page.getByRole('heading', {
      name: 'The anime catalogue is temporarily unavailable',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Try again in a moment.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeVisible()

  const visibleText = await page.locator('body').innerText()
  expect(visibleText).not.toMatch(
    /postgres|m38_unavailable|127\.0\.0\.1:1|digest/i,
  )
}

test.beforeAll(async () => {
  await expectPortOneToRefuseConnections()
})

test('returns complete privacy-safe 500 catalogue failures through the production error boundary', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const assertBoundedUnavailableEvidence =
    monitorBoundedUnavailableEvidence(page)
  const initialResponse = await page.goto('/')
  expect(initialResponse?.status()).toBe(500)
  await expectPrivacySafeUnavailableMarkup(page)

  await page.locator('#main-content').focus()
  await page.keyboard.press('Tab')
  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(retry).toBeFocused()
  expect(
    await retry.evaluate((element) => getComputedStyle(element).outlineWidth),
  ).toBe('3px')

  await page.keyboard.press('Enter')
  await expectPrivacySafeUnavailableMarkup(page)
  await retry.click()
  await expectPrivacySafeUnavailableMarkup(page)

  assertBoundedUnavailableEvidence()
})
