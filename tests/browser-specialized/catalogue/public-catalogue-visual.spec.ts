import { expect, test, type Locator, type Page } from '@playwright/test'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })

const applicationOrigin = 'http://127.0.0.1:3102'
const viewports = [
  { columns: 1, height: 568, name: '320', width: 320 },
  { columns: 1, height: 844, name: '390', width: 390 },
  { columns: 2, height: 1024, name: '768', width: 768 },
  { columns: 3, height: 960, name: '1280', width: 1280 },
] as const
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const configuredDatabaseName = decodeURIComponent(
  new URL(databaseUrl).pathname.slice(1),
)

if (configuredDatabaseName !== 'zedarchive_dev') {
  throw new Error('M38 public visual runner requires zedarchive_dev')
}

const pool = new Pool({ connectionString: databaseUrl })

function monitorBoundedPublicBrowserEvidence(page: Page) {
  let externalRequestObserved = false
  let unexpectedConsoleErrorObserved = false
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
    if (message.type() === 'error') unexpectedConsoleErrorObserved = true
  })
  page.on('pageerror', () => {
    pageErrorObserved = true
  })

  return () => {
    expect(externalRequestObserved).toBe(false)
    expect(unexpectedConsoleErrorObserved).toBe(false)
    expect(pageErrorObserved).toBe(false)
  }
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

async function expectReachable(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(-0.5)
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerWidth)) + 0.5,
  )
}

async function waitForProductionCss(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLLinkElement>(
            'link[rel="stylesheet"]',
          ),
        ].some((link) => {
          try {
            const url = new URL(link.href)
            return (
              url.origin === window.location.origin &&
              url.pathname.includes('/_next/static/') &&
              url.pathname.endsWith('.css') &&
              link.sheet !== null
            )
          } catch {
            return false
          }
        }),
      ),
    )
    .toBe(true)
}

async function resolvedTokenColour(page: Page, token: string) {
  return page.evaluate((tokenName) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = `var(${tokenName})`
    document.body.append(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  }, token)
}

function catalogueGrid(page: Page) {
  return page
    .locator('ul')
    .filter({ has: page.locator('article') })
    .first()
}

async function expectGridColumnCount(page: Page, expectedColumns: number) {
  const grid = catalogueGrid(page)
  await expect(grid).toBeVisible()
  const columnCount = await grid.evaluate(
    (element) =>
      getComputedStyle(element)
        .gridTemplateColumns.split(' ')
        .filter((value) => value !== '').length,
  )
  expect(columnCount).toBe(expectedColumns)
}

async function expectCatalogueCardPresentation(page: Page, card: Locator) {
  const tile = card.locator('.za-title-tile')
  const heading = card.getByRole('heading', { level: 2 })
  const tileBackground = await resolvedTokenColour(
    page,
    '--za-color-title-tile',
  )

  await expect(card).toHaveClass(/\bza-card\b/)
  await expect(tile).toHaveClass(/\bza-catalogue-card__tile\b/)
  await expect(heading).toBeVisible()
  expect(
    await tile.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(tileBackground)
  expect(
    await card.evaluate((element) => getComputedStyle(element).borderTopWidth),
  ).toBe('1px')

  const tileBox = await tile.boundingBox()
  expect(tileBox).not.toBeNull()
  expect(tileBox!.height / tileBox!.width).toBeCloseTo(1.5, 1)

  const titleStyle = await heading.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      lineClamp: style.getPropertyValue('-webkit-line-clamp'),
      overflow: style.overflow,
      textOverflow: style.textOverflow,
    }
  })
  expect(titleStyle.lineClamp).toBe('none')
  expect(titleStyle.overflow).not.toBe('hidden')
  expect(titleStyle.textOverflow).not.toBe('ellipsis')
}

async function expectContainedByCard(card: Locator, child: Locator) {
  const [cardBox, childBox] = await Promise.all([
    card.boundingBox(),
    child.boundingBox(),
  ])
  expect(cardBox).not.toBeNull()
  expect(childBox).not.toBeNull()
  expect(childBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 0.5)
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width + 0.5,
  )
}

test.beforeAll(async () => {
  await pool.query('BEGIN READ ONLY')
  try {
    const result = await pool.query<{
      databaseName: string
      hasCowboyBebop: boolean
      publicItemCount: number
    }>(`
      select
        current_database() as "databaseName",
        exists (
          select 1
          from anime_catalogue_items
          where english_title = 'Cowboy Bebop'
            and catalogue_state = 'published'
            and maturity <> 'adult'
        ) as "hasCowboyBebop",
        (
          select count(*)::int
          from anime_catalogue_items
          where catalogue_state = 'published' and maturity <> 'adult'
        ) as "publicItemCount"
    `)
    const preflight = result.rows[0]
    if (preflight?.databaseName !== 'zedarchive_dev') {
      throw new Error('M38 public visual runner requires zedarchive_dev')
    }
    if (!preflight.hasCowboyBebop || preflight.publicItemCount < 1) {
      throw new Error(
        'M38 public visual runner requires the deterministic published development seed',
      )
    }
  } finally {
    await pool.query('ROLLBACK')
  }
})

test.afterAll(async () => {
  await pool.end()
})

test('renders the guarded public catalogue matrix from production CSS', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const assertBoundedBrowserEvidence = monitorBoundedPublicBrowserEvidence(page)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await waitForProductionCss(page)
    await expect(
      page.getByRole('heading', { name: 'Anime catalogue' }),
    ).toBeVisible()
    await expect(
      page.getByRole('searchbox', { name: 'Search anime' }),
    ).toBeVisible()
    await expectGridColumnCount(page, viewport.columns)
    const card = page.locator('article').first()
    await expectCatalogueCardPresentation(page, card)
    await expectNoHorizontalOverflow(page)
    await expectReachable(
      page,
      page.getByRole('searchbox', { name: 'Search anime' }),
    )
  }

  const cowboyResponse = await page.goto('/?q=Cowboy%20Bebop')
  expect(cowboyResponse?.status()).toBe(200)
  await expect(
    page.getByText('1 result for "Cowboy Bebop"', { exact: true }),
  ).toBeVisible()
  const browseAllLink = page.getByRole('link', { name: 'Browse all anime' })
  await expect(browseAllLink).toBeVisible()
  await expectCatalogueCardPresentation(page, page.locator('article').first())

  await page.getByRole('searchbox', { name: 'Search anime' }).focus()
  await page.keyboard.press('Tab')
  const searchButton = page.getByRole('button', {
    name: 'Search',
    exact: true,
  })
  await expect(searchButton).toBeFocused()
  expect(
    await searchButton.evaluate(
      (element) => getComputedStyle(element).outlineWidth,
    ),
  ).toBe('3px')
  const cowboySearchbox = page.getByRole('searchbox', { name: 'Search anime' })
  await cowboySearchbox.focus()
  await cowboySearchbox.press('Enter')
  await expect(page).toHaveURL(/\/?q=Cowboy\+Bebop$/)
  await browseAllLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)

  const emptyResponse = await page.goto('/?q=m38-no-match-sentinel')
  expect(emptyResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'No anime found' }),
  ).toBeVisible()

  const invalidResponse = await page.goto('/?q=one&q=two')
  expect(invalidResponse?.status()).toBe(200)
  await expect(
    page.getByRole('searchbox', { name: 'Search anime' }),
  ).toHaveAttribute('aria-invalid', 'true')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Search must be provided only once' }),
  ).toBeVisible()
  await expect(page.locator('article')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)

  const beyondFinalResponse = await page.goto('/?page=10000')
  expect(beyondFinalResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'This page has no results' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Return to the first page' }),
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)

  assertBoundedBrowserEvidence()
})

test('keeps public catalogue content reachable at 200% root text size', async ({
  page,
}) => {
  const assertBoundedBrowserEvidence = monitorBoundedPublicBrowserEvidence(page)
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await waitForProductionCss(page)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })

  const card = page.locator('article').first()
  const tile = card.locator('.za-title-tile')
  const details = card.locator('.za-catalogue-card__details')
  await expectCatalogueCardPresentation(page, card)
  await expectContainedByCard(card, tile)
  await expectContainedByCard(card, details)
  const [tileBox, detailsBox] = await Promise.all([
    tile.boundingBox(),
    details.boundingBox(),
  ])
  expect(tileBox).not.toBeNull()
  expect(detailsBox).not.toBeNull()
  expect(detailsBox!.y).toBeGreaterThanOrEqual(
    tileBox!.y + tileBox!.height - 0.5,
  )
  await expectNoHorizontalOverflow(page)
  await expectReachable(
    page,
    page.getByRole('searchbox', { name: 'Search anime' }),
  )

  await page.goto('/?q=Cowboy%20Bebop')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expectCatalogueCardPresentation(page, page.locator('article').first())
  await expectNoHorizontalOverflow(page)

  await page.goto('/?page=10000')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expect(
    page.getByRole('link', { name: 'Return to the first page' }),
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)

  assertBoundedBrowserEvidence()
})

test('preserves the public GET shell and streamed response without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const assertBoundedBrowserEvidence = monitorBoundedPublicBrowserEvidence(page)

  try {
    const browseResponse = await page.goto('/')
    expect(browseResponse?.status()).toBe(200)
    await expect(
      page.getByRole('searchbox', { name: 'Search anime' }),
    ).toBeVisible()
    await expect(
      page.getByText('Loading anime catalogue…', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('input[name="catalogueItemId"], select[name="status"]'),
    ).toHaveCount(0)

    const searchbox = page.getByRole('searchbox', { name: 'Search anime' })
    await searchbox.fill('Cowboy Bebop')
    const [searchResponse] = await Promise.all([
      page.waitForNavigation(),
      searchbox.press('Enter'),
    ])
    await expect(page).toHaveURL(/\/?q=Cowboy\+Bebop$/)
    const searchHtml = await searchResponse?.text()
    expect(searchHtml).toContain('1 result for')
    expect(searchHtml).toContain('Cowboy Bebop')
    await expect(
      page.getByText('Loading anime catalogue…', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Browse all anime' }),
    ).toHaveAttribute('href', '/')

    const invalidResponse = await page.goto('/?q=one&q=two')
    expect(invalidResponse?.status()).toBe(200)
    expect(await invalidResponse!.text()).toContain(
      'Search must be provided only once',
    )
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Search must be provided only once' }),
    ).toHaveText('Search must be provided only once')

    const beyondFinalResponse = await page.goto('/?page=10000')
    expect(beyondFinalResponse?.status()).toBe(200)
    expect(await beyondFinalResponse!.text()).toContain(
      'This page has no results',
    )
    expect(await beyondFinalResponse!.text()).toContain(
      'Return to the first page to continue browsing.',
    )
    await expect(
      page.getByText('Loading anime catalogue…', { exact: true }),
    ).toBeVisible()
  } finally {
    assertBoundedBrowserEvidence()
    await context.close()
  }
})

test('keeps public catalogue controls visible in forced colours and quiet under reduced motion', async ({
  page,
}) => {
  const assertBoundedBrowserEvidence = monitorBoundedPublicBrowserEvidence(page)
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await expect(
    page.getByRole('searchbox', { name: 'Search anime' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(page.locator('article').first()).toBeVisible()
  expect(
    await page
      .getByRole('button', { name: 'Search' })
      .evaluate((element) => getComputedStyle(element).forcedColorAdjust),
  ).not.toBe('none')

  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' })
  await expect
    .poll(async () =>
      Number.parseFloat(
        await page
          .getByRole('button', { name: 'Search' })
          .evaluate((element) => getComputedStyle(element).transitionDuration),
      ),
    )
    .toBeLessThanOrEqual(0.00001)

  assertBoundedBrowserEvidence()
})
