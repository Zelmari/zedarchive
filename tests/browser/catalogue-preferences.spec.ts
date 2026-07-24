import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })

const fixturePrefix = `m31-browser-${randomUUID()}`
const password = `M31-${randomUUID()}-password`
const ownerA = {
  email: `${fixturePrefix}-owner-a@example.test`,
  username: `M31A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}
const ownerB = {
  email: `${fixturePrefix}-owner-b@example.test`,
  username: `M31B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
}

const languageSearchSentinel = `${fixturePrefix}-language`
const languageTitles = {
  alpha: {
    english: `Zulu ${languageSearchSentinel}`,
    romaji: `Alpha ${languageSearchSentinel}`,
    original: `Gamma ${languageSearchSentinel}`,
  },
  omega: {
    english: `Beta ${languageSearchSentinel}`,
    romaji: `Omega ${languageSearchSentinel}`,
    original: `Delta ${languageSearchSentinel}`,
  },
}
const adultPublishedAddTitle = `Adult ${fixturePrefix} Add`
const adultPublishedOwnedTitle = `Adult ${fixturePrefix} Owned`
const adultHiddenOwnedTitle = `Adult ${fixturePrefix} Hidden`
const adultDraftRemovalTitle = `Adult ${fixturePrefix} Draft`
const ownerBTitle = `Owner B ${fixturePrefix} Private`

const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })
const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []

let ownerAId = ''
let ownerBId = ''
let adultPublishedAddCatalogueItemId = ''
let adultPublishedOwnedEntryId = ''
let adultHiddenOwnedEntryId = ''
let adultDraftRemovalEntryId = ''

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('Browser fixture database target is not allowed')
  }
}

function isKnownMissingFaviconError(
  message: import('@playwright/test').ConsoleMessage,
) {
  try {
    return (
      new URL(message.location().url).pathname === '/favicon.ico' &&
      message.text().includes('404')
    )
  } catch {
    return false
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

function monitorUnexpectedBrowserErrors(page: Page) {
  let hasConsoleError = false
  let hasPageError = false

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isKnownMissingFaviconError(message) &&
      !isExpectedSignInRateLimitError(message)
    ) {
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

async function insertUser(owner: typeof ownerA): Promise<string> {
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

async function insertCatalogueItem({
  englishTitle,
  romajiTitle = null,
  originalTitle = null,
  maturity = 'safe',
  catalogueState = 'published',
}: {
  englishTitle: string
  romajiTitle?: string | null
  originalTitle?: string | null
  maturity?: 'adult' | 'safe'
  catalogueState?: 'draft' | 'hidden' | 'published'
}): Promise<string> {
  const catalogueItemId = randomUUID()

  await pool.query(
    `
      insert into anime_catalogue_items (
        id,
        english_title,
        romaji_title,
        original_title,
        format,
        release_status,
        episode_count,
        maturity,
        catalogue_state
      )
      values ($1, $2, $3, $4, 'tv', 'finished', 24, $5, $6)
    `,
    [
      catalogueItemId,
      englishTitle,
      romajiTitle,
      originalTitle,
      maturity,
      catalogueState,
    ],
  )
  fixtureCatalogueItemIds.push(catalogueItemId)
  return catalogueItemId
}

async function insertEntry({
  userId,
  catalogueItemId,
}: {
  userId: string
  catalogueItemId: string
}): Promise<string> {
  const entryId = randomUUID()

  await pool.query(
    `
      insert into anime_entries (
        id,
        user_id,
        catalogue_item_id,
        status
      )
      values ($1, $2, $3, 'planned')
    `,
    [entryId, userId, catalogueItemId],
  )

  return entryId
}

async function signIn(page: Page, owner: typeof ownerA) {
  await page.goto('/sign-in')
  let status = 0

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(owner.email)
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password)
    const signInResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/auth/sign-in/email',
    )
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    status = (await signInResponse).status()

    if (status !== 429) break
    await page.waitForTimeout(60_000)
  }

  expect(status).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page) {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })

  if (!(await signOut.isVisible().catch(() => false))) return

  const signOutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/sign-out',
  )
  await signOut.click()
  expect((await signOutResponse).status()).toBe(200)
  await page.reload()
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible({ timeout: 15_000 })
}

function cardForTitle(page: Page, title: string) {
  return page.locator('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
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

async function expectLeadingTitles(page: Page, expectedTitles: string[]) {
  const headings = page.locator('article h2')

  for (const [index, expectedTitle] of expectedTitles.entries()) {
    await expect(headings.nth(index)).toHaveText(expectedTitle)
  }
}

async function captureArchiveFlightNavigation(
  page: Page,
  navigate: () => Promise<void>,
) {
  const responses: {
    body: string
    cacheControl: string
    contentType: string
  }[] = []

  const captureFlight = async (
    route: import('@playwright/test').Route,
  ): Promise<void> => {
    const request = route.request()

    if (request.method() !== 'GET' || request.headers().rsc !== '1') {
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
    await route.fulfill({ body, response })
  }

  await page.route('**/archive/anime**', captureFlight)

  try {
    await navigate()
    await page.waitForLoadState('networkidle')
    await expect.poll(() => responses.length).toBeGreaterThan(0)

    if (responses.length === 0) {
      throw new Error('Archive Flight response evidence was not captured')
    }

    return {
      body: responses.map(({ body }) => body).join('\n'),
      responses: responses.map(({ cacheControl, contentType }) => ({
        cacheControl,
        contentType,
      })),
    }
  } finally {
    await page.unroute('**/archive/anime**', captureFlight)
  }
}

async function preferenceRow(userId: string) {
  const result = await pool.query<{
    adultContentEnabled: boolean
    titleLanguage: string
    updatedAt: Date
  }>(
    `
      select
        adult_content_enabled as "adultContentEnabled",
        title_language as "titleLanguage",
        updated_at as "updatedAt"
      from user_catalogue_preferences
      where user_id = $1
    `,
    [userId],
  )
  return result.rows[0]
}

test.beforeAll(async () => {
  const databaseResult = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )
  assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

  ownerAId = await insertUser(ownerA)
  ownerBId = await insertUser(ownerB)

  for (const titles of Object.values(languageTitles)) {
    await insertCatalogueItem({
      englishTitle: titles.english,
      romajiTitle: titles.romaji,
      originalTitle: titles.original,
    })
  }

  adultPublishedAddCatalogueItemId = await insertCatalogueItem({
    englishTitle: adultPublishedAddTitle,
    maturity: 'adult',
  })
  const adultPublishedOwnedCatalogueItemId = await insertCatalogueItem({
    englishTitle: adultPublishedOwnedTitle,
    maturity: 'adult',
  })
  adultPublishedOwnedEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: adultPublishedOwnedCatalogueItemId,
  })

  const adultHiddenOwnedCatalogueItemId = await insertCatalogueItem({
    englishTitle: adultHiddenOwnedTitle,
    maturity: 'adult',
    catalogueState: 'hidden',
  })
  adultHiddenOwnedEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: adultHiddenOwnedCatalogueItemId,
  })

  const adultDraftRemovalCatalogueItemId = await insertCatalogueItem({
    englishTitle: adultDraftRemovalTitle,
    maturity: 'adult',
    catalogueState: 'draft',
  })
  adultDraftRemovalEntryId = await insertEntry({
    userId: ownerAId,
    catalogueItemId: adultDraftRemovalCatalogueItemId,
  })

  const ownerBCatalogueItemId = await insertCatalogueItem({
    englishTitle: ownerBTitle,
    catalogueState: 'hidden',
  })
  await insertEntry({
    userId: ownerBId,
    catalogueItemId: ownerBCatalogueItemId,
  })
})

test.afterEach(async ({ page }) => {
  await signOutIfSignedIn(page)
})

test.afterAll(async () => {
  try {
    const databaseResult = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    assertAllowedFixtureDatabase(databaseResult.rows[0]?.databaseName)

    await pool.query('delete from users where id = any($1::uuid[])', [
      fixtureUserIds,
    ])
    await pool.query(
      'delete from anime_catalogue_items where id = any($1::uuid[])',
      [fixtureCatalogueItemIds],
    )

    const residue = await pool.query<{
      accounts: number
      catalogueItems: number
      entries: number
      preferences: number
      sessions: number
      users: number
    }>(
      `
        select
          (
            select count(*)::int
            from users
            where id = any($1::uuid[])
          ) as users,
          (
            select count(*)::int
            from accounts
            where user_id = any($1::uuid[])
          ) as accounts,
          (
            select count(*)::int
            from sessions
            where user_id = any($1::uuid[])
          ) as sessions,
          (
            select count(*)::int
            from user_catalogue_preferences
            where user_id = any($1::uuid[])
          ) as preferences,
          (
            select count(*)::int
            from anime_entries
            where user_id = any($1::uuid[])
               or catalogue_item_id = any($2::uuid[])
          ) as entries,
          (
            select count(*)::int
            from anime_catalogue_items
            where id = any($2::uuid[])
          ) as "catalogueItems"
      `,
      [fixtureUserIds, fixtureCatalogueItemIds],
    )

    expect(residue.rows[0]).toEqual({
      accounts: 0,
      catalogueItems: 0,
      entries: 0,
      preferences: 0,
      sessions: 0,
      users: 0,
    })
  } finally {
    await pool.end()
  }
})

test('persists catalogue preferences, gates adult data and controls, and isolates owners', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)

  const signedOutSettingsResponse = await page.goto('/settings')
  expect(signedOutSettingsResponse?.status()).toBe(200)
  await expectPrivateNoStore(signedOutSettingsResponse!)
  await expect(
    page
      .locator('#main-content')
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('input, button[type="submit"]')).toHaveCount(0)

  const signedOutCatalogueResponse = await page.goto(
    `/?q=${encodeURIComponent(adultPublishedAddTitle)}`,
  )
  expect(signedOutCatalogueResponse?.status()).toBe(200)
  await expectPrivateNoStore(signedOutCatalogueResponse!)
  const signedOutCatalogueHtml = await signedOutCatalogueResponse!.text()
  expect(signedOutCatalogueHtml).not.toContain(adultPublishedAddCatalogueItemId)
  await expect(cardForTitle(page, adultPublishedAddTitle)).toHaveCount(0)
  await expect(page.getByText('0 results for', { exact: false })).toBeVisible()

  const noJavaScriptContext = await browser.newContext({
    javaScriptEnabled: false,
  })
  try {
    const noJavaScriptPage = await noJavaScriptContext.newPage()
    const response = await noJavaScriptPage.goto('/settings')
    expect(response?.status()).toBe(200)
    await expectPrivateNoStore(response!)
    await expect(
      noJavaScriptPage
        .locator('#main-content')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      noJavaScriptPage.locator('input, button[type="submit"]'),
    ).toHaveCount(0)
  } finally {
    await noJavaScriptContext.close()
  }

  await signIn(page, ownerA)
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Settings', exact: true }),
  ).toBeVisible()

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 960 },
  ]) {
    await page.setViewportSize(viewport)

    for (const path of [
      '/settings',
      `/?q=${encodeURIComponent(languageSearchSentinel)}`,
      '/archive/anime?sort=alphabetical',
    ]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expectPrivateNoStore(response!)
      await expectNoHorizontalOverflow(page)
    }
  }

  await page.goto('/settings')
  await expect(
    page.getByRole('radio', { name: 'English (default)' }),
  ).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Romaji' })).not.toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Show adult content' }),
  ).toBeVisible()
  expect(await preferenceRow(ownerAId)).toBeUndefined()

  await page.goto(`/?q=${encodeURIComponent(languageSearchSentinel)}`)
  await expectLeadingTitles(page, [
    languageTitles.omega.english,
    languageTitles.alpha.english,
  ])
  await expect(
    cardForTitle(page, languageTitles.omega.english).locator(
      '[aria-hidden="true"]',
    ),
  ).toHaveText('BM')

  await page.goto('/settings')
  const romajiRadio = page.getByRole('radio', { name: 'Romaji' })
  await romajiRadio.check()
  await expect(romajiRadio).toBeChecked()
  expect(
    await romajiRadio.locator('xpath=ancestor::form').evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) return []
      return Array.from(new FormData(form).entries()).filter(
        ([fieldName]) => !fieldName.startsWith('$ACTION_'),
      )
    }),
  ).toEqual([['titleLanguage', 'romaji']])
  await page.getByRole('button', { name: 'Save title language' }).click()
  const titleFeedback = page.getByRole('status').filter({
    hasText: /^Title language saved\.$/,
  })
  await expect(titleFeedback).toBeFocused()
  expect(await preferenceRow(ownerAId)).toMatchObject({
    adultContentEnabled: false,
    titleLanguage: 'romaji',
  })

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Romaji' })).toBeChecked()
  await page.goto(`/?q=${encodeURIComponent(languageSearchSentinel)}`)
  await expectLeadingTitles(page, [
    languageTitles.alpha.romaji,
    languageTitles.omega.romaji,
  ])
  await expect(
    cardForTitle(page, languageTitles.alpha.romaji).locator(
      '[aria-hidden="true"]',
    ),
  ).toHaveText('AM')

  const authenticatedNoJavaScriptContext = await browser.newContext({
    javaScriptEnabled: false,
  })
  try {
    const noJavaScriptPage = await authenticatedNoJavaScriptContext.newPage()
    await noJavaScriptPage.goto('/sign-in')
    const applicationOrigin = new URL(noJavaScriptPage.url()).origin
    const noJavaScriptSignIn =
      await authenticatedNoJavaScriptContext.request.post(
        `${applicationOrigin}/api/auth/sign-in/email`,
        {
          data: {
            email: ownerA.email,
            password,
          },
          headers: {
            origin: applicationOrigin,
          },
        },
      )
    expect(noJavaScriptSignIn.status()).toBe(200)

    const authenticatedSettingsResponse =
      await noJavaScriptPage.goto('/settings')
    expect(authenticatedSettingsResponse?.status()).toBe(200)
    await expectPrivateNoStore(authenticatedSettingsResponse!)
    await expect(
      noJavaScriptPage.getByRole('radio', { name: 'Romaji' }),
    ).toBeChecked()

    await noJavaScriptPage.getByRole('radio', { name: 'Original' }).check()
    await noJavaScriptPage
      .getByRole('button', { name: 'Save title language', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByRole('radio', { name: 'Original' }),
    ).toBeChecked()
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: false,
      titleLanguage: 'original',
    })

    await noJavaScriptPage.getByRole('checkbox').check()
    await noJavaScriptPage
      .getByRole('button', { name: 'Show adult content', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByRole('button', {
        name: 'Hide adult content',
        exact: true,
      }),
    ).toBeVisible()
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: true,
      titleLanguage: 'original',
    })

    await noJavaScriptPage
      .getByRole('button', { name: 'Hide adult content', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByRole('button', {
        name: 'Show adult content',
        exact: true,
      }),
    ).toBeVisible()
    await expect(noJavaScriptPage.getByRole('checkbox')).not.toBeChecked()
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: false,
      titleLanguage: 'original',
    })

    await noJavaScriptPage
      .getByRole('button', { name: 'Show adult content', exact: true })
      .click()
    const noJavaScriptConfirmation = noJavaScriptPage.getByRole('checkbox')
    await expect(noJavaScriptConfirmation).not.toBeChecked()
    await expect(noJavaScriptConfirmation).toBeFocused()
    expect(
      await noJavaScriptConfirmation.evaluate((checkbox) =>
        (checkbox as HTMLInputElement).checkValidity(),
      ),
    ).toBe(false)
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: false,
      titleLanguage: 'original',
    })

    await noJavaScriptPage.getByRole('checkbox').check()
    await noJavaScriptPage
      .getByRole('button', { name: 'Show adult content', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByRole('button', {
        name: 'Hide adult content',
        exact: true,
      }),
    ).toBeVisible()
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: true,
      titleLanguage: 'original',
    })

    await noJavaScriptPage
      .getByRole('button', { name: 'Hide adult content', exact: true })
      .click()
    await noJavaScriptPage.getByRole('radio', { name: 'Romaji' }).check()
    await noJavaScriptPage
      .getByRole('button', { name: 'Save title language', exact: true })
      .click()
    await expect(
      noJavaScriptPage.getByRole('radio', { name: 'Romaji' }),
    ).toBeChecked()
    expect(await preferenceRow(ownerAId)).toMatchObject({
      adultContentEnabled: false,
      titleLanguage: 'romaji',
    })

    const noJavaScriptSignOut =
      await authenticatedNoJavaScriptContext.request.post(
        `${applicationOrigin}/api/auth/sign-out`,
        {
          data: {},
          headers: {
            origin: applicationOrigin,
          },
        },
      )
    expect(noJavaScriptSignOut.status()).toBe(200)
    await noJavaScriptPage.goto('/settings')
    await expect(
      noJavaScriptPage
        .locator('#main-content')
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
  } finally {
    await authenticatedNoJavaScriptContext.close()
  }

  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: 'Romaji' })).toBeChecked()
  expect(await preferenceRow(ownerAId)).toMatchObject({
    adultContentEnabled: false,
    titleLanguage: 'romaji',
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Show adult content' }).click()
  const confirmationAlert = page.getByRole('alert').filter({
    hasText:
      /^Confirm that you are at least 18 before showing adult content\.$/,
  })
  await expect(confirmationAlert).toBeFocused()
  await expect(page.getByRole('checkbox')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(await preferenceRow(ownerAId)).toMatchObject({
    adultContentEnabled: false,
    titleLanguage: 'romaji',
  })

  await page.getByRole('checkbox').check()
  await expect(confirmationAlert).toHaveCount(0)
  await page.getByRole('button', { name: 'Show adult content' }).click()
  const adultEnabledFeedback = page.getByRole('status').filter({
    hasText: /^Adult content is now shown for your account\.$/,
  })
  await expect(adultEnabledFeedback).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Hide adult content' }),
  ).toBeVisible()
  expect(await preferenceRow(ownerAId)).toMatchObject({
    adultContentEnabled: true,
    titleLanguage: 'romaji',
  })

  const adultCatalogueResponse = await page.goto(
    `/?q=${encodeURIComponent(adultPublishedAddTitle)}`,
  )
  await expectPrivateNoStore(adultCatalogueResponse!)
  const adultAddCard = cardForTitle(page, adultPublishedAddTitle)
  await expect(adultAddCard).toContainText('Adult content')
  await adultAddCard
    .getByRole('combobox', { name: 'Status' })
    .selectOption('planned')
  await adultAddCard
    .getByRole('button', { name: 'Add to archive', exact: true })
    .click()
  await expect(
    adultAddCard.getByRole('status').filter({
      hasText: /^Added to your archive as Plan to watch\.$/,
    }),
  ).toBeFocused()
  const addedEntry = await pool.query<{ count: number }>(
    `
      select count(*)::int as count
      from anime_entries
      where user_id = $1 and catalogue_item_id = $2 and status = 'planned'
    `,
    [ownerAId, adultPublishedAddCatalogueItemId],
  )
  expect(addedEntry.rows[0]?.count).toBe(1)

  const archiveResponse = await page.goto('/archive/anime?sort=alphabetical')
  await expectPrivateNoStore(archiveResponse!)
  const archiveHtml = await archiveResponse!.text()
  expect(archiveHtml).toContain(adultPublishedOwnedTitle)
  expect(archiveHtml).not.toContain(ownerBTitle)

  for (const title of [
    adultPublishedAddTitle,
    adultPublishedOwnedTitle,
    adultHiddenOwnedTitle,
    adultDraftRemovalTitle,
  ]) {
    const card = cardForTitle(page, title)
    await expect(card).toContainText('Adult content')
    await expect(
      card.getByRole('button', { name: 'Edit status', exact: true }),
    ).toBeVisible()
    await expect(
      card.getByRole('button', { name: 'Remove from archive', exact: true }),
    ).toBeVisible()
  }
  for (const title of [adultHiddenOwnedTitle, adultDraftRemovalTitle]) {
    await expect(cardForTitle(page, title)).toContainText(
      'Not currently available in the catalogue',
    )
  }

  const publishedOwnedCard = cardForTitle(page, adultPublishedOwnedTitle)
  await publishedOwnedCard
    .getByRole('button', { name: 'Edit status', exact: true })
    .click()
  await publishedOwnedCard
    .getByRole('combobox', { name: 'Status' })
    .selectOption('in_progress')
  await publishedOwnedCard
    .getByRole('button', { name: 'Save status', exact: true })
    .click()
  await expect(
    publishedOwnedCard.getByRole('status').filter({
      hasText: /^Status updated to In progress\.$/,
    }),
  ).toBeFocused()
  const updatedStatus = await pool.query<{ status: string }>(
    'select status from anime_entries where id = $1 and user_id = $2',
    [adultPublishedOwnedEntryId, ownerAId],
  )
  expect(updatedStatus.rows[0]?.status).toBe('in_progress')

  const draftRemovalCard = cardForTitle(page, adultDraftRemovalTitle)
  await draftRemovalCard
    .getByRole('button', { name: 'Remove from archive', exact: true })
    .click()
  const removalDialog = page.getByRole('dialog', {
    name: `Remove ${adultDraftRemovalTitle} from your archive?`,
    exact: true,
  })
  await expect(removalDialog).toBeVisible()
  await removalDialog
    .getByRole('button', { name: 'Remove from archive', exact: true })
    .click()
  await expect(cardForTitle(page, adultDraftRemovalTitle)).toHaveCount(0)
  const removedEntry = await pool.query<{ count: number }>(
    'select count(*)::int as count from anime_entries where id = $1',
    [adultDraftRemovalEntryId],
  )
  expect(removedEntry.rows[0]?.count).toBe(0)

  const hiddenCardWithStaleAction = cardForTitle(page, adultHiddenOwnedTitle)
  await hiddenCardWithStaleAction
    .getByRole('button', { name: 'Edit status', exact: true })
    .click()
  await hiddenCardWithStaleAction
    .getByRole('combobox', { name: 'Status' })
    .selectOption('completed')

  const settingsPage = await page.context().newPage()
  try {
    const assertNoUnexpectedSettingsPageErrors =
      monitorUnexpectedBrowserErrors(settingsPage)
    await settingsPage.goto('/settings')
    await settingsPage
      .getByRole('button', { name: 'Hide adult content', exact: true })
      .click()
    await expect(
      settingsPage.getByRole('status').filter({
        hasText: /^Adult content is now hidden\.$/,
      }),
    ).toBeFocused()
    assertNoUnexpectedSettingsPageErrors()
  } finally {
    await settingsPage.close()
  }

  await hiddenCardWithStaleAction
    .getByRole('button', { name: 'Save status', exact: true })
    .click()
  await expect(
    hiddenCardWithStaleAction.getByRole('alert').filter({
      hasText:
        /^This archive entry is no longer available\. Refresh your archive\.$/,
    }),
  ).toBeFocused()
  const staleEntry = await pool.query<{ status: string }>(
    'select status from anime_entries where id = $1 and user_id = $2',
    [adultHiddenOwnedEntryId, ownerAId],
  )
  expect(staleEntry.rows[0]?.status).toBe('planned')

  const restrictedResponse = await page.goto('/archive/anime?sort=alphabetical')
  await expectPrivateNoStore(restrictedResponse!)
  const restrictedHtml = await restrictedResponse!.text()
  for (const concealedValue of [
    adultPublishedAddTitle,
    adultPublishedOwnedTitle,
    adultHiddenOwnedTitle,
    adultPublishedAddCatalogueItemId,
    adultPublishedOwnedEntryId,
    adultHiddenOwnedEntryId,
  ]) {
    expect(restrictedHtml).not.toContain(concealedValue)
    await expect(page.locator('body')).not.toContainText(concealedValue)
  }
  await expect(
    page.getByRole('heading', { name: 'Restricted anime', exact: true }),
  ).toHaveCount(3)
  await expect(page.locator('input[name="entryId"], dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Remove from archive', exact: true }),
  ).toHaveCount(0)

  await signOutIfSignedIn(page)
  await signIn(page, ownerB)
  const ownerBSettingsResponse = await page.goto('/settings')
  await expectPrivateNoStore(ownerBSettingsResponse!)
  await expect(
    page.getByRole('radio', { name: 'English (default)' }),
  ).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Show adult content' }),
  ).toBeVisible()
  expect(await preferenceRow(ownerBId)).toBeUndefined()

  const ownerBFlight = await captureArchiveFlightNavigation(page, () =>
    page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .getByRole('link', { name: 'My anime', exact: true })
      .click(),
  )
  for (const response of ownerBFlight.responses) {
    expect(response.contentType).toContain('text/x-component')
    expect(response.cacheControl).toContain('private')
    expect(response.cacheControl).toContain('no-store')
  }
  expect(ownerBFlight.body).toContain(ownerBTitle)
  expect(ownerBFlight.body).not.toContain(adultPublishedOwnedTitle)
  expect(ownerBFlight.body).not.toContain(adultPublishedOwnedEntryId)
  await expect(page.locator('body')).toContainText(ownerBTitle)
  await expect(page.locator('body')).not.toContainText(adultPublishedOwnedTitle)

  await signOutIfSignedIn(page)
  await signIn(page, ownerA)
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: 'Romaji' })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Show adult content' }),
  ).toBeVisible()

  const ownerAFlight = await captureArchiveFlightNavigation(page, () =>
    page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .getByRole('link', { name: 'My anime', exact: true })
      .click(),
  )
  for (const response of ownerAFlight.responses) {
    expect(response.contentType).toContain('text/x-component')
    expect(response.cacheControl).toContain('private')
    expect(response.cacheControl).toContain('no-store')
  }
  expect(ownerAFlight.body).not.toContain(ownerBTitle)
  expect(ownerAFlight.body).not.toContain(adultPublishedOwnedTitle)
  await expect(page.locator('body')).not.toContainText(ownerBTitle)
  await expect(
    page.getByRole('heading', { name: 'Restricted anime', exact: true }),
  ).toHaveCount(3)

  const originPage = await page.context().newPage()
  try {
    await originPage.goto('/settings')
    const preferenceBeforeOriginRequest = await preferenceRow(ownerAId)
    expect(preferenceBeforeOriginRequest).toBeDefined()

    let modifiedRequest = false
    await originPage.route('**/settings**', async (route) => {
      const request = route.request()

      if (!modifiedRequest && request.method() === 'POST') {
        modifiedRequest = true
        await route.continue({
          headers: {
            ...request.headers(),
            'x-forwarded-host': 'm31-host-mismatch.invalid',
            origin: 'http://m31-origin-mismatch.invalid',
          },
        })
        return
      }

      await route.continue()
    })

    await originPage.getByRole('radio', { name: 'Original' }).check()
    const rejectionResponse = originPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/settings',
    )
    await originPage
      .getByRole('button', { name: 'Save title language', exact: true })
      .click()
    await expect.poll(() => modifiedRequest).toBe(true)
    expect((await rejectionResponse).status()).toBeGreaterThanOrEqual(400)

    const preferenceAfterOriginRequest = await preferenceRow(ownerAId)
    expect(preferenceAfterOriginRequest).toEqual(preferenceBeforeOriginRequest)
  } finally {
    await originPage.unroute('**/settings**').catch(() => undefined)
    await originPage.close()
  }

  assertNoUnexpectedBrowserErrors()
})
