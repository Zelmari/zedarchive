import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })

type ReleaseItem = {
  id: string
  titles: {
    alternatives: string[]
    english: string | null
    original: string | null
    romaji: string | null
  }
  episodeCount: number | null
  maturity: 'adult' | 'safe' | 'sensitive' | 'unknown'
  catalogueState: 'draft' | 'hidden' | 'published'
  releaseYear: number | null
}

const releaseCorpus = JSON.parse(
  readFileSync(
    new URL('../../data/releases/anime-catalogue.v1.json', import.meta.url),
    'utf8',
  ),
) as { items: ReleaseItem[] }

const publishedNonAdult = releaseCorpus.items.filter(
  (item) => item.catalogueState === 'published' && item.maturity !== 'adult',
)
const adultSentinel = releaseCorpus.items.find(
  (item) => item.catalogueState === 'published' && item.maturity === 'adult',
)
const draftSentinel = releaseCorpus.items.find(
  (item) => item.catalogueState === 'draft',
)
const hiddenSentinel = releaseCorpus.items.find(
  (item) => item.catalogueState === 'hidden',
)
const languageTarget = publishedNonAdult.find(
  (item) =>
    item.titles.english !== null &&
    item.titles.original !== null &&
    item.titles.english !== item.titles.original,
)
const alternativeTarget = publishedNonAdult.find(
  (item) => item.titles.english !== null && item.titles.alternatives.length > 0,
)
const sparseTitleTarget = publishedNonAdult.find(
  (item) => item.titles.english === null && item.titles.original !== null,
)
const sparseMetadataTarget = publishedNonAdult.find(
  (item) => item.releaseYear === null && item.episodeCount === null,
)

if (
  !adultSentinel ||
  !draftSentinel ||
  !hiddenSentinel ||
  !languageTarget ||
  !alternativeTarget ||
  !sparseTitleTarget ||
  !sparseMetadataTarget
) {
  throw new Error('Approved release corpus does not contain required sentinels')
}

const fixturePrefix = `m36-browser-${randomUUID()}`
const password = `M36-${randomUUID()}-password`
const owner = {
  email: `${fixturePrefix}@example.test`,
  username: `M36${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })
const expectedAuthRateLimitKeys = new Set([
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
])
const fixtureRateLimits = new Map<string, string>()
let ownerId = ''

function displayTitle(item: ReleaseItem) {
  const title =
    item.titles.english ?? item.titles.romaji ?? item.titles.original
  if (title === null) throw new Error('Release item has no display title')
  return title
}

function monitorBoundedBrowserEvidence(page: Page) {
  const applicationOrigin = 'http://127.0.0.1:3100'
  let externalRequestObserved = false
  let unexpectedConsoleErrorObserved = false
  let pageErrorObserved = false
  let serverErrorResponseObserved = false

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
    if (message.type() === 'error') {
      unexpectedConsoleErrorObserved = true
    }
  })
  page.on('pageerror', () => {
    pageErrorObserved = true
  })
  page.on('response', (response) => {
    if (
      response.status() >= 500 &&
      new URL(response.url()).origin === applicationOrigin
    ) {
      serverErrorResponseObserved = true
    }
  })

  return () => {
    expect(externalRequestObserved).toBe(false)
    expect(unexpectedConsoleErrorObserved).toBe(false)
    expect(pageErrorObserved).toBe(false)
    expect(serverErrorResponseObserved).toBe(false)
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

function cardForTitle(page: Page, title: string) {
  return page.locator('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

async function articleHeadings(page: Page) {
  return page.locator('article h2').allTextContents()
}

async function captureFixtureAuthRateLimits(expectedKeys: string[]) {
  const result = await pool.query<{ id: string; key: string }>(
    'select id, key from rate_limits order by key',
  )
  expect(result.rows.map(({ key }) => key)).toEqual([...expectedKeys].sort())
  for (const row of result.rows) {
    expect(expectedAuthRateLimitKeys.has(row.key)).toBe(true)
    const priorId = fixtureRateLimits.get(row.key)
    if (priorId !== undefined) expect(row.id).toBe(priorId)
    fixtureRateLimits.set(row.key, row.id)
  }
}

async function expectedEnglishPage(pageNumber: number) {
  const result = await pool.query<{ id: string; title: string }>(
    `
      select
        id,
        coalesce(english_title, romaji_title, original_title) as title
      from anime_catalogue_items
      where catalogue_state = 'published' and maturity <> 'adult'
      order by
        lower(coalesce(english_title, romaji_title, original_title)),
        coalesce(english_title, romaji_title, original_title),
        id
      limit 24 offset $1
    `,
    [(pageNumber - 1) * 24],
  )
  return result.rows
}

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(owner.email)
  await page
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill(password)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-in/email',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await responsePromise).status()).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
  await captureFixtureAuthRateLimits(['127.0.0.1|/sign-in/email'])
}

async function signOutIfSignedIn(page: Page) {
  const button = page.getByRole('button', {
    name: 'Sign out',
    exact: true,
  })
  if (!(await button.isVisible().catch(() => false))) return

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-out',
  )
  await button.click()
  expect((await responsePromise).status()).toBe(200)
  await captureFixtureAuthRateLimits([
    '127.0.0.1|/sign-in/email',
    '127.0.0.1|/sign-out',
  ])
  await page.reload()
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
}

async function saveTitleLanguage(
  page: Page,
  name: 'English (default)' | 'Original' | 'Romaji',
) {
  await page.goto('/settings')
  const radio = page.getByRole('radio', { name, exact: true })
  await radio.check()
  await page
    .getByRole('button', { name: 'Save title language', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({
      hasText: /^Title language saved\.$/,
    }),
  ).toBeFocused()
  await expect(radio).toBeChecked()
}

async function navigationFirstByteMs(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status()).toBe(200)
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming
    return navigation.responseStart
  })
}

async function captureCatalogueFlight(
  page: Page,
  navigate: () => Promise<void>,
) {
  const responses: {
    body: string
    cacheControl: string
    contentType: string
  }[] = []
  const capture = async (route: import('@playwright/test').Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      request.method() !== 'GET' ||
      request.headers().rsc !== '1' ||
      url.pathname !== '/'
    ) {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const body = await response.body()
    responses.push({
      body: body.toString('utf8'),
      cacheControl: response.headers()['cache-control'] ?? '',
      contentType: response.headers()['content-type'] ?? '',
    })
    await route.fulfill({ response, body })
  }

  await page.route('**/*', capture)
  try {
    await navigate()
    await page.waitForLoadState('networkidle')
    await expect.poll(() => responses.length).toBeGreaterThan(0)
    for (const response of responses) {
      expect(response.contentType).toContain('text/x-component')
      expect(response.cacheControl).toContain('private')
      expect(response.cacheControl).toContain('no-store')
    }
    return {
      body: responses.map(({ body }) => body).join('\n'),
      responses: responses.map(({ cacheControl, contentType }) => ({
        cacheControl,
        contentType,
      })),
    }
  } finally {
    await page.unroute('**/*', capture)
  }
}

test.beforeAll(async () => {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  if (target.rows[0]?.name !== 'zedarchive_release_rehearsal') {
    throw new Error('M36 browser fixture database target is not allowed')
  }

  const baseline = await pool.query<{
    accounts: number
    catalogueItems: number
    entries: number
    preferences: number
    rateLimits: number
    sessions: number
    users: number
  }>(`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from accounts) as accounts,
      (select count(*)::int from sessions) as sessions,
      (select count(*)::int from rate_limits) as "rateLimits",
      (select count(*)::int from user_catalogue_preferences) as preferences,
      (select count(*)::int from anime_entries) as entries,
      (select count(*)::int from anime_catalogue_items) as "catalogueItems"
  `)
  expect(baseline.rows[0]).toEqual({
    accounts: 0,
    catalogueItems: 500,
    entries: 0,
    preferences: 0,
    rateLimits: 0,
    sessions: 0,
    users: 0,
  })

  ownerId = randomUUID()
  await pool.query(
    `insert into users (
       id, username, username_identity_key, email, email_verified
     ) values ($1, $2, $3, $4, true)`,
    [ownerId, owner.username, owner.username.toLowerCase(), owner.email],
  )
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1, $2, $3, 'credential', $4)`,
    [randomUUID(), ownerId, ownerId, await hashPassword(password)],
  )
})

test.afterEach(async ({ page }) => {
  await signOutIfSignedIn(page)
})

test.afterAll(async () => {
  try {
    const target = await pool.query<{ name: string }>(
      'select current_database() as name',
    )
    if (target.rows[0]?.name !== 'zedarchive_release_rehearsal') {
      throw new Error('M36 browser cleanup database target is not allowed')
    }

    if (ownerId !== '') {
      await pool.query('delete from users where id = $1::uuid', [ownerId])
    }
    for (const [key, id] of fixtureRateLimits) {
      const deletedRateLimit = await pool.query(
        'delete from rate_limits where id = $1::uuid and key = $2 returning id',
        [id, key],
      )
      expect(deletedRateLimit.rowCount).toBe(1)
    }

    const residue = await pool.query<{
      accounts: number
      catalogueItems: number
      catalogueSources: number
      entries: number
      preferences: number
      rateLimits: number
      sessions: number
      users: number
    }>(`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from accounts) as accounts,
        (select count(*)::int from sessions) as sessions,
        (select count(*)::int from rate_limits) as "rateLimits",
        (select count(*)::int from user_catalogue_preferences) as preferences,
        (select count(*)::int from anime_entries) as entries,
        (select count(*)::int from anime_catalogue_items) as "catalogueItems",
        (select count(*)::int from anime_catalogue_sources) as "catalogueSources"
    `)
    expect(residue.rows[0]).toEqual({
      accounts: 0,
      catalogueItems: 500,
      catalogueSources: 500,
      entries: 0,
      preferences: 0,
      rateLimits: 0,
      sessions: 0,
      users: 0,
    })
  } finally {
    await pool.end()
  }
})

test('proves the approved release catalogue in production browser flows', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const assertBoundedBrowserEvidence = monitorBoundedBrowserEvidence(page)

  const initialResponse = await page.goto('/')
  expect(initialResponse?.status()).toBe(200)
  await expectPrivateNoStore(initialResponse!)
  await expect(page.getByText('446 anime', { exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('navigation', {
        name: 'Anime catalogue pagination',
        exact: true,
      })
      .getByText('Page 1 of 19', { exact: true }),
  ).toBeVisible()
  const initialHtml = await initialResponse!.text()
  for (const sentinel of [adultSentinel, draftSentinel, hiddenSentinel]) {
    expect(initialHtml).not.toContain(sentinel.id)
    expect(initialHtml).not.toContain(displayTitle(sentinel))
  }

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main-content')).toBeFocused()

  const allPublishedIds = new Set<string>()
  for (let pageNumber = 1; pageNumber <= 19; pageNumber += 1) {
    const response = await page.goto(`/?page=${pageNumber}`)
    expect(response?.status()).toBe(200)
    const headings = await articleHeadings(page)
    const expectedPage = await expectedEnglishPage(pageNumber)
    expect(headings).toEqual(expectedPage.map(({ title }) => title))
    for (const { id } of expectedPage) {
      expect(allPublishedIds.has(id)).toBe(false)
      allPublishedIds.add(id)
    }
    if ([1, 10, 19].includes(pageNumber)) {
      await expect(
        page
          .getByRole('navigation', {
            name: 'Anime catalogue pagination',
            exact: true,
          })
          .getByText(`Page ${pageNumber} of 19`, { exact: true }),
      ).toBeVisible()
    }
  }
  expect(allPublishedIds.size).toBe(446)

  const emptyResponse = await page.goto('/?page=20')
  expect(emptyResponse?.status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      name: 'This page has no results',
      exact: true,
    }),
  ).toBeVisible()

  await page.goto('/')
  const flight = await captureCatalogueFlight(page, () =>
    page
      .getByRole('navigation', {
        name: 'Anime catalogue pagination',
        exact: true,
      })
      .getByRole('link', { name: 'Next', exact: true })
      .click(),
  )
  for (const sentinel of [adultSentinel, draftSentinel, hiddenSentinel]) {
    expect(flight.body).not.toContain(sentinel.id)
    expect(flight.body).not.toContain(displayTitle(sentinel))
  }

  const alternativeQuery = alternativeTarget.titles.alternatives[0]!
  await page.goto('/')
  const search = page.getByRole('search')
  await search
    .getByRole('searchbox', { name: 'Search anime' })
    .fill(alternativeQuery)
  await search.getByRole('searchbox', { name: 'Search anime' }).press('Enter')
  await expect(page).toHaveURL(
    `/?q=${encodeURIComponent(alternativeQuery).replaceAll('%20', '+')}`,
  )
  await expect(
    page.getByRole('heading', {
      name: displayTitle(alternativeTarget),
      exact: true,
    }),
  ).toBeVisible()

  for (const sentinel of [adultSentinel, draftSentinel, hiddenSentinel]) {
    await page.goto('/')
    const sentinelFlight = await captureCatalogueFlight(page, async () => {
      const searchForm = page.getByRole('search')
      await searchForm
        .getByRole('searchbox', { name: 'Search anime' })
        .fill(displayTitle(sentinel))
      await searchForm
        .getByRole('button', { name: 'Search', exact: true })
        .click()
    })
    expect(sentinelFlight.body).not.toContain(sentinel.id)
    await expect(
      page.getByText(`0 results for "${displayTitle(sentinel)}"`, {
        exact: true,
      }),
    ).toBeVisible()

    const response = await page.goto(
      `/?q=${encodeURIComponent(displayTitle(sentinel))}`,
    )
    expect(response?.status()).toBe(200)
    expect(await response!.text()).not.toContain(sentinel.id)
    await expect(
      page.getByText(`0 results for "${displayTitle(sentinel)}"`, {
        exact: true,
      }),
    ).toBeVisible()
  }

  await page.goto(`/?q=${encodeURIComponent(displayTitle(sparseTitleTarget))}`)
  await expect(
    page.getByRole('heading', {
      name: displayTitle(sparseTitleTarget),
      exact: true,
    }),
  ).toBeVisible()

  await page.goto(
    `/?q=${encodeURIComponent(displayTitle(sparseMetadataTarget))}`,
  )
  const sparseCard = cardForTitle(page, displayTitle(sparseMetadataTarget))
  await expect(sparseCard).toContainText('Year unknown')
  await expect(sparseCard).not.toContainText(/\d+ episodes?/)

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 960 },
  ]) {
    await page.setViewportSize(viewport)
    for (const path of ['/', '/?page=10', `/?q=${alternativeQuery}`]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expectNoHorizontalOverflow(page)
      await expect(page.getByRole('search')).toBeVisible()
    }
  }

  const signedOutFirstByteSamples: number[] = []
  await navigationFirstByteMs(page, '/')
  for (const path of [
    '/',
    '/?page=10',
    '/?page=19',
    `/?q=${encodeURIComponent(alternativeQuery)}`,
    '/',
  ]) {
    signedOutFirstByteSamples.push(await navigationFirstByteMs(page, path))
  }
  signedOutFirstByteSamples.sort((left, right) => left - right)
  expect(signedOutFirstByteSamples[4]).toBeLessThanOrEqual(500)

  await signIn(page)
  await page.goto('/')
  await expect(page.getByText('446 anime', { exact: true })).toBeVisible()
  const adultOffResponse = await page.goto('/')
  expect(adultOffResponse?.status()).toBe(200)
  await expectPrivateNoStore(adultOffResponse!)
  const adultOffHtml = await adultOffResponse!.text()
  expect(adultOffHtml).not.toContain(adultSentinel.id)
  expect(adultOffHtml).not.toContain(displayTitle(adultSentinel))
  const adultOffSearchQuery = displayTitle(adultSentinel).split(':')[0]!
  const adultOffFlight = await captureCatalogueFlight(page, async () => {
    const searchForm = page.getByRole('search')
    await searchForm
      .getByRole('searchbox', { name: 'Search anime' })
      .fill(adultOffSearchQuery)
    await searchForm
      .getByRole('button', { name: 'Search', exact: true })
      .click()
  })
  expect(adultOffFlight.body).not.toContain(adultSentinel.id)
  expect(adultOffFlight.body).not.toContain(displayTitle(adultSentinel))
  await expect(
    page.getByText(`0 results for "${adultOffSearchQuery}"`, {
      exact: true,
    }),
  ).toBeVisible()

  for (const [language, expectedTitle] of [
    ['English (default)', languageTarget.titles.english!],
    ['Romaji', languageTarget.titles.english!],
    ['Original', languageTarget.titles.original!],
  ] as const) {
    await saveTitleLanguage(page, language)
    await page.goto(`/?q=${encodeURIComponent(languageTarget.titles.english!)}`)
    await expect(
      page.getByRole('heading', { name: expectedTitle, exact: true }),
    ).toBeVisible()
  }

  await saveTitleLanguage(page, 'English (default)')
  await page.goto('/settings')
  await page.getByRole('checkbox').check()
  await page
    .getByRole('button', { name: 'Show adult content', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({
      hasText: /^Adult content is now shown for your account\.$/,
    }),
  ).toBeFocused()

  await page.goto('/')
  await expect(page.getByText('460 anime', { exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('navigation', {
        name: 'Anime catalogue pagination',
        exact: true,
      })
      .getByText('Page 1 of 20', { exact: true }),
  ).toBeVisible()
  await page.goto(`/?q=${encodeURIComponent(displayTitle(adultSentinel))}`)
  await expect(cardForTitle(page, displayTitle(adultSentinel))).toContainText(
    'Adult content',
  )

  const authenticatedFirstByteSamples: number[] = []
  await navigationFirstByteMs(page, '/')
  for (const path of ['/', '/?page=10', '/?page=20', '/', '/']) {
    authenticatedFirstByteSamples.push(await navigationFirstByteMs(page, path))
  }
  authenticatedFirstByteSamples.sort((left, right) => left - right)
  expect(authenticatedFirstByteSamples[4]).toBeLessThanOrEqual(500)

  await page.goto('/settings')
  await page
    .getByRole('button', { name: 'Hide adult content', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({
      hasText: /^Adult content is now hidden\.$/,
    }),
  ).toBeFocused()
  await page.goto('/')
  await expect(page.getByText('446 anime', { exact: true })).toBeVisible()
  const hiddenAgainResponse = await page.goto('/')
  expect(await hiddenAgainResponse!.text()).not.toContain(adultSentinel.id)

  assertBoundedBrowserEvidence()
})
