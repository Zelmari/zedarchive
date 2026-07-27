import { randomUUID } from 'node:crypto'
import { expect, test, type Download, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })
test.describe.configure({ mode: 'serial' })

const fixturePrefix = `m35-browser-${randomUUID()}`
const password = `M35-${randomUUID()}-password`
const owners = {
  a: {
    email: `${fixturePrefix}-owner-a@example.test`,
    username: `M35A${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  b: {
    email: `${fixturePrefix}-owner-b@example.test`,
    username: `M35B${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
  pending: {
    email: `${fixturePrefix}-pending@example.test`,
    username: `M35P${randomUUID().replaceAll('-', '').slice(0, 12)}`,
  },
} as const

const ownerASafeTitle = `${fixturePrefix} owner-a safe`
const ownerAAdultTitle = `${fixturePrefix} owner-a adult`
const ownerBTitle = `${fixturePrefix} owner-b private`
const sourceSentinel = `${fixturePrefix}-source-sentinel`
const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })

const fixtureUserIds: string[] = []
const fixtureCatalogueItemIds: string[] = []
let ownerAId = ''
let ownerBId = ''
let pendingOwnerId = ''
let ownerASafeItemId = ''
let ownerAAdultItemId = ''
let ownerBItemId = ''

test.skip(
  process.env.CI !== 'true',
  'Archive backup browser verification requires the isolated CI test database',
)

function assertAllowedFixtureDatabase(name: string | undefined): void {
  if (name !== 'zedarchive_test') {
    throw new Error('Archive-backup browser fixtures require zedarchive_test')
  }
}

function isKnownMissingFaviconError(
  message: import('@playwright/test').ConsoleMessage,
): boolean {
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
): boolean {
  try {
    return (
      new URL(message.location().url).pathname === '/api/auth/sign-in/email' &&
      message.text().includes('429')
    )
  } catch {
    return false
  }
}

function monitorUnexpectedBrowserErrors(page: Page): () => void {
  let consoleErrorCount = 0
  let pageErrorCount = 0

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isKnownMissingFaviconError(message) &&
      !isExpectedSignInRateLimitError(message)
    ) {
      consoleErrorCount += 1
    }
  })
  page.on('pageerror', () => {
    pageErrorCount += 1
  })

  return () => {
    expect(consoleErrorCount).toBe(0)
    expect(pageErrorCount).toBe(0)
  }
}

async function insertUser(
  owner: (typeof owners)[keyof typeof owners],
): Promise<string> {
  const userId = randomUUID()
  const passwordHash = await hashPassword(password)
  fixtureUserIds.push(userId)
  await pool.query(
    `insert into users
       (id, username, username_identity_key, email, email_verified)
     values ($1, $2, $3, $4, true)`,
    [userId, owner.username, owner.username.toLowerCase(), owner.email],
  )
  await pool.query(
    `insert into accounts (id, user_id, account_id, provider_id, password)
     values ($1, $2, $3, 'credential', $4)`,
    [randomUUID(), userId, userId, passwordHash],
  )
  return userId
}

async function insertCatalogueItem(input: {
  englishTitle: string
  maturity: 'adult' | 'safe'
  catalogueState: 'hidden' | 'published'
}): Promise<string> {
  const id = randomUUID()
  fixtureCatalogueItemIds.push(id)
  await pool.query(
    `insert into anime_catalogue_items
       (id, english_title, romaji_title, original_title, format, release_status,
        release_year, episode_count, maturity, catalogue_state)
     values ($1, $2, $3, $4, 'tv', 'finished', 2024, 24, $5, $6)`,
    [
      id,
      input.englishTitle,
      `${input.englishTitle} romaji`,
      `${input.englishTitle} original`,
      input.maturity,
      input.catalogueState,
    ],
  )
  return id
}

async function insertEntry(input: {
  userId: string
  catalogueItemId: string
  status: 'completed' | 'in_progress' | 'planned'
  isFavourite: boolean
}): Promise<void> {
  await pool.query(
    `insert into anime_entries
       (id, user_id, catalogue_item_id, status, episode_progress,
        episode_total_override, rating, is_favourite, start_date, finish_date)
     values ($1, $2, $3, $4, 3, 24, 8.5, $5, '2024-01-02', '2024-02-03')`,
    [
      randomUUID(),
      input.userId,
      input.catalogueItemId,
      input.status,
      input.isFavourite,
    ],
  )
}

async function signIn(
  page: Page,
  owner: (typeof owners)[keyof typeof owners],
): Promise<void> {
  await page.goto('/sign-in')
  let status = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    await page.waitForTimeout(11_000)
  }
  expect(status).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page): Promise<void> {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await signOut.isVisible().catch(() => false))) return
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-out',
  )
  await signOut.click()
  expect((await response).status()).toBe(200)
}

async function expectPrivateNoStore(response: {
  headerValue(name: string): Promise<string | null>
}): Promise<void> {
  const cacheControl = await response.headerValue('cache-control')
  expect(cacheControl).toContain('private')
  expect(cacheControl).toContain('no-store')
}

function archiveNavigationHeaders() {
  return {
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
}

async function readSettingsFlight(page: Page): Promise<{
  body: Buffer
  cacheControl: string | undefined
  contentType: string | undefined
}> {
  const response = await page
    .context()
    .request.get('http://127.0.0.1:3100/settings', { headers: { rsc: '1' } })
  expect(response.status()).toBe(200)
  return {
    body: await response.body(),
    cacheControl: response.headers()['cache-control'],
    contentType: response.headers()['content-type'],
  }
}

async function fixtureFingerprint() {
  const result = await pool.query<{ fingerprint: string }>(
    `select md5(concat_ws('|',
       (select coalesce(string_agg(to_jsonb(u)::text, ',' order by u.id), '')
          from users u where u.id = any($1::uuid[])),
       (select coalesce(string_agg(to_jsonb(p)::text, ',' order by p.user_id), '')
          from user_catalogue_preferences p where p.user_id = any($1::uuid[])),
       (select coalesce(string_agg(to_jsonb(e)::text, ',' order by e.id), '')
          from anime_entries e where e.user_id = any($1::uuid[])),
       (select coalesce(string_agg(to_jsonb(d)::text, ',' order by d.user_id), '')
          from account_deletion_requests d where d.user_id = any($1::uuid[])),
       (select coalesce(string_agg(to_jsonb(c)::text, ',' order by c.id), '')
          from anime_catalogue_items c where c.id = any($2::uuid[])),
       (select coalesce(string_agg(to_jsonb(a)::text, ',' order by a.catalogue_item_id, a.position), '')
          from anime_alternative_titles a where a.catalogue_item_id = any($2::uuid[])),
       (select coalesce(string_agg(to_jsonb(s)::text, ',' order by s.source_key, s.source_item_id), '')
          from anime_catalogue_sources s where s.catalogue_item_id = any($2::uuid[]))
     )) as fingerprint`,
    [fixtureUserIds, fixtureCatalogueItemIds],
  )
  return result.rows[0]?.fingerprint
}

function assertBackupDocument(
  bytes: Buffer,
  expectedTitle: string,
  excludedTitle: string,
): void {
  const text = bytes.toString('utf8')
  const document = JSON.parse(text) as {
    schema: unknown
    version: unknown
    exportedAt: unknown
    settings: {
      anime: { titleLanguage: unknown; adultContentEnabled: unknown }
    }
    archive: {
      anime: {
        entries: Array<{ catalogue: { titles: { english: unknown } } }>
      }
    }
  }
  expect(document.schema).toBe('zedarchive.archive-backup')
  expect(document.version).toBe(1)
  expect(document.exportedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
  )
  expect(document.settings.anime).toEqual({
    titleLanguage: expectedTitle === ownerBTitle ? 'romaji' : 'english',
    adultContentEnabled: false,
  })
  const titles = document.archive.anime.entries.map(
    (entry) => entry.catalogue.titles.english,
  )
  expect(titles).toContain(expectedTitle)
  expect(titles).not.toContain(excludedTitle)
  expect(text).not.toContain(sourceSentinel)
  expect(text).not.toMatch(
    /accounts|sessions|verifications|rate_limits|account_deletion_requests|catalogueItemId|userId|createdAt|updatedAt/iu,
  )
}

async function deleteDownload(download: Download | undefined): Promise<void> {
  if (download !== undefined) await download.delete()
}

test.beforeAll(async () => {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)

  ownerAId = await insertUser(owners.a)
  ownerBId = await insertUser(owners.b)
  pendingOwnerId = await insertUser(owners.pending)

  ownerASafeItemId = await insertCatalogueItem({
    englishTitle: ownerASafeTitle,
    maturity: 'safe',
    catalogueState: 'published',
  })
  ownerAAdultItemId = await insertCatalogueItem({
    englishTitle: ownerAAdultTitle,
    maturity: 'adult',
    catalogueState: 'hidden',
  })
  ownerBItemId = await insertCatalogueItem({
    englishTitle: ownerBTitle,
    maturity: 'safe',
    catalogueState: 'hidden',
  })
  await pool.query(
    `insert into anime_alternative_titles (catalogue_item_id, title, position)
     values ($1, $2, 0), ($1, $3, 1)`,
    [
      ownerASafeItemId,
      `${ownerASafeTitle} alternative one`,
      `${ownerASafeTitle} alternative two`,
    ],
  )
  await pool.query(
    `insert into anime_catalogue_sources (catalogue_item_id, source_key, source_item_id)
     values ($1, 'fixture', $2)`,
    [ownerASafeItemId, sourceSentinel],
  )
  await insertEntry({
    userId: ownerAId,
    catalogueItemId: ownerASafeItemId,
    status: 'in_progress',
    isFavourite: true,
  })
  await insertEntry({
    userId: ownerAId,
    catalogueItemId: ownerAAdultItemId,
    status: 'completed',
    isFavourite: false,
  })
  await insertEntry({
    userId: ownerBId,
    catalogueItemId: ownerBItemId,
    status: 'planned',
    isFavourite: false,
  })
  await pool.query(
    `insert into user_catalogue_preferences
       (user_id, title_language, adult_content_enabled)
     values ($1, 'english', false), ($2, 'romaji', false)`,
    [ownerAId, ownerBId],
  )
})

test.afterAll(async () => {
  try {
    const target = await pool.query<{ name: string }>(
      'select current_database() as name',
    )
    assertAllowedFixtureDatabase(target.rows[0]?.name)
    await pool.query('delete from users where id = any($1::uuid[])', [
      fixtureUserIds,
    ])
    await pool.query(
      'delete from anime_catalogue_items where id = any($1::uuid[])',
      [fixtureCatalogueItemIds],
    )
    const residue = await pool.query(
      `select
         (select count(*)::int from users where id = any($1::uuid[])) as users,
         (select count(*)::int from accounts where user_id = any($1::uuid[])) as accounts,
         (select count(*)::int from sessions where user_id = any($1::uuid[])) as sessions,
         (select count(*)::int from user_catalogue_preferences where user_id = any($1::uuid[])) as preferences,
         (select count(*)::int from account_deletion_requests where user_id = any($1::uuid[])) as deletions,
         (select count(*)::int from anime_entries where user_id = any($1::uuid[]) or catalogue_item_id = any($2::uuid[])) as entries,
         (select count(*)::int from anime_alternative_titles where catalogue_item_id = any($2::uuid[])) as alternatives,
         (select count(*)::int from anime_catalogue_sources where catalogue_item_id = any($2::uuid[])) as sources,
         (select count(*)::int from anime_catalogue_items where id = any($2::uuid[])) as catalogue`,
      [fixtureUserIds, fixtureCatalogueItemIds],
    )
    expect(residue.rows[0]).toEqual({
      accounts: 0,
      alternatives: 0,
      catalogue: 0,
      deletions: 0,
      entries: 0,
      preferences: 0,
      sessions: 0,
      sources: 0,
      users: 0,
    })
  } finally {
    await pool.end()
  }
})

test('delivers an active owner’s private archive through the native settings link', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  let download: Download | undefined
  try {
    await signIn(page, owners.a)
    const settingsResponse = await page.goto('/settings')
    expect(settingsResponse?.status()).toBe(200)
    await expectPrivateNoStore(settingsResponse!)
    const settingsHtml = await settingsResponse!.text()
    expect(settingsHtml).not.toContain(ownerAAdultTitle)
    expect(settingsHtml).not.toContain(sourceSentinel)
    expect(settingsHtml).toContain('href="/api/account/archive-backup"')
    const settingsFlight = await readSettingsFlight(page)
    expect(settingsFlight.contentType).toContain('text/x-component')
    expect(settingsFlight.cacheControl).toContain('private')
    expect(settingsFlight.cacheControl).toContain('no-store')
    expect(settingsFlight.body.toString('utf8')).not.toContain(ownerAAdultTitle)
    expect(settingsFlight.body.toString('utf8')).not.toContain(sourceSentinel)
    await expect(
      page.getByRole('heading', { name: 'Archive data', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Download a JSON copy of your saved anime tracking data and catalogue preferences. It excludes your account identity, sign-in information, and images.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(
      page.getByText(
        'The JSON file contains your complete saved anime data, including entries currently hidden by your adult-content setting. Store it somewhere private.',
        { exact: true },
      ),
    ).toBeVisible()
    const backupLink = page.getByRole('link', {
      name: 'Download archive backup (JSON)',
      exact: true,
    })
    await expect(backupLink).toHaveAttribute(
      'href',
      '/api/account/archive-backup',
    )
    await expect(backupLink).not.toHaveAttribute('download')

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 960 },
    ]) {
      await page.setViewportSize(viewport)
      await expectNoHorizontalOverflow(page)
      await expect(backupLink).toBeVisible()
    }

    await backupLink.focus()
    await expect(backupLink).toBeFocused()
    await expect(backupLink).toHaveCSS('outline-style', /^(auto|solid)$/)
    await expect(backupLink).not.toHaveCSS('outline-width', '0px')
    const downloadResponse = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'GET' &&
        new URL(candidate.url()).pathname === '/api/account/archive-backup',
    )
    const browserDownload = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    download = await browserDownload
    const response = await downloadResponse
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe(
      'application/json; charset=utf-8',
    )
    expect(response.headers()['content-disposition']).toBe(
      'attachment; filename="zedarchive-archive-backup-v1.json"',
    )
    expect(response.headers()['cache-control']).toBe(
      'private, no-store, max-age=0',
    )
    expect(response.headers()['pragma']).toBe('no-cache')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    expect(response.headers()['referrer-policy']).toBe('no-referrer')
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
    expect(response.headers()['cross-origin-resource-policy']).toBe(
      'same-origin',
    )
    expect(response.headers()['access-control-allow-origin']).toBeUndefined()
    expect(response.headers()['set-cookie']).toBeUndefined()
    expect(download.suggestedFilename()).toBe(
      'zedarchive-archive-backup-v1.json',
    )
    const stream = await download.createReadStream()
    if (stream === null) throw new Error('Expected in-memory download stream')
    const downloadChunks: Buffer[] = []
    for await (const chunk of stream) downloadChunks.push(Buffer.from(chunk))
    const downloadedBytes = Buffer.concat(downloadChunks)
    assertBackupDocument(downloadedBytes, ownerASafeTitle, ownerBTitle)
    expect(downloadedBytes.toString('utf8')).toContain(ownerAAdultTitle)
    await deleteDownload(download)
    download = undefined

    const noJavaScriptContext = await browser.newContext({
      javaScriptEnabled: false,
    })
    let noJavaScriptDownload: Download | undefined
    try {
      const noJavaScriptPage = await noJavaScriptContext.newPage()
      const assertNoUnexpectedNoJavaScriptErrors =
        monitorUnexpectedBrowserErrors(noJavaScriptPage)
      await noJavaScriptPage.goto('/sign-in')
      const applicationOrigin = new URL(noJavaScriptPage.url()).origin
      const noJavaScriptSignIn = await noJavaScriptContext.request.post(
        `${applicationOrigin}/api/auth/sign-in/email`,
        {
          data: { email: owners.a.email, password },
          headers: { origin: applicationOrigin },
        },
      )
      expect(noJavaScriptSignIn.status()).toBe(200)

      const noJavaScriptSettings = await noJavaScriptPage.goto('/settings')
      expect(noJavaScriptSettings?.status()).toBe(200)
      await expectPrivateNoStore(noJavaScriptSettings!)
      const noJavaScriptSettingsHtml = await noJavaScriptSettings!.text()
      expect(noJavaScriptSettingsHtml).not.toContain(ownerAAdultTitle)
      const noJavaScriptLink = noJavaScriptPage.getByRole('link', {
        name: 'Download archive backup (JSON)',
        exact: true,
      })
      await expect(noJavaScriptLink).toHaveAttribute(
        'href',
        '/api/account/archive-backup',
      )

      const noJavaScriptResponse = noJavaScriptPage.waitForResponse(
        (candidate) =>
          candidate.request().method() === 'GET' &&
          new URL(candidate.url()).pathname === '/api/account/archive-backup',
      )
      const noJavaScriptDownloadEvent =
        noJavaScriptPage.waitForEvent('download')
      await noJavaScriptLink.click()
      noJavaScriptDownload = await noJavaScriptDownloadEvent
      const noJavaScriptDownloadResponse = await noJavaScriptResponse
      expect(noJavaScriptDownloadResponse.status()).toBe(200)
      expect(noJavaScriptDownloadResponse.headers()['content-type']).toBe(
        'application/json; charset=utf-8',
      )
      expect(
        noJavaScriptDownloadResponse.headers()['content-disposition'],
      ).toBe('attachment; filename="zedarchive-archive-backup-v1.json"')
      expect(noJavaScriptDownloadResponse.headers()['cache-control']).toBe(
        'private, no-store, max-age=0',
      )
      expect(
        noJavaScriptDownloadResponse.headers()['cross-origin-resource-policy'],
      ).toBe('same-origin')
      expect(
        noJavaScriptDownloadResponse.headers()['access-control-allow-origin'],
      ).toBeUndefined()
      expect(
        noJavaScriptDownloadResponse.headers()['set-cookie'],
      ).toBeUndefined()
      expect(noJavaScriptDownload.suggestedFilename()).toBe(
        'zedarchive-archive-backup-v1.json',
      )
      const noJavaScriptStream = await noJavaScriptDownload.createReadStream()
      if (noJavaScriptStream === null) {
        throw new Error('Expected in-memory no-JavaScript download stream')
      }
      const noJavaScriptChunks: Buffer[] = []
      for await (const chunk of noJavaScriptStream) {
        noJavaScriptChunks.push(Buffer.from(chunk))
      }
      const noJavaScriptBytes = Buffer.concat(noJavaScriptChunks)
      assertBackupDocument(noJavaScriptBytes, ownerASafeTitle, ownerBTitle)
      expect(noJavaScriptBytes.toString('utf8')).toContain(ownerAAdultTitle)
      await deleteDownload(noJavaScriptDownload)
      noJavaScriptDownload = undefined

      const noJavaScriptSignOut = await noJavaScriptContext.request.post(
        `${applicationOrigin}/api/auth/sign-out`,
        { data: {}, headers: { origin: applicationOrigin } },
      )
      expect(noJavaScriptSignOut.status()).toBe(200)
      assertNoUnexpectedNoJavaScriptErrors()
    } finally {
      await deleteDownload(noJavaScriptDownload)
      await noJavaScriptContext.close()
    }
  } finally {
    await deleteDownload(download)
    await signOutIfSignedIn(page)
    assertNoUnexpectedBrowserErrors()
  }
})

test('isolates owners and rejects signed-out, pending, due, and cross-site navigations', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const assertNoUnexpectedBrowserErrors = monitorUnexpectedBrowserErrors(page)
  try {
    async function directArchiveBytes(expectedStatus: number): Promise<Buffer> {
      const response = await page
        .context()
        .request.get('http://127.0.0.1:3100/api/account/archive-backup', {
          headers: archiveNavigationHeaders(),
        })
      expect(response.status()).toBe(expectedStatus)
      expect(response.headers()['cache-control']).toBe(
        'private, no-store, max-age=0',
      )
      expect(response.headers()['access-control-allow-origin']).toBeUndefined()
      expect(response.headers()['set-cookie']).toBeUndefined()
      return response.body()
    }

    await signIn(page, owners.a)
    const ownerAFirst = await directArchiveBytes(200)
    assertBackupDocument(ownerAFirst, ownerASafeTitle, ownerBTitle)
    await signOutIfSignedIn(page)

    await signIn(page, owners.b)
    const ownerBBytes = await directArchiveBytes(200)
    assertBackupDocument(ownerBBytes, ownerBTitle, ownerASafeTitle)
    await signOutIfSignedIn(page)

    await signIn(page, owners.a)
    const ownerASecond = await directArchiveBytes(200)
    assertBackupDocument(ownerASecond, ownerASafeTitle, ownerBTitle)
    await signOutIfSignedIn(page)

    const signedOutContext = await browser.newContext()
    try {
      const signedOutPage = await signedOutContext.newPage()
      const signedOut = await signedOutPage
        .context()
        .request.get('http://127.0.0.1:3100/api/account/archive-backup', {
          headers: archiveNavigationHeaders(),
        })
      expect(signedOut.status()).toBe(401)
      expect(signedOut.headers()['cache-control']).toBe(
        'private, no-store, max-age=0',
      )
      expect(await signedOut.body()).toEqual(Buffer.from('Unavailable'))
    } finally {
      await signedOutContext.close()
    }

    await signIn(page, owners.pending)
    const pendingAt = new Date()
    const pendingPurgeAt = new Date(pendingAt.getTime() + 336 * 60 * 60 * 1_000)
    await pool.query(
      `insert into account_deletion_requests (user_id, requested_at, purge_after)
       values ($1, $2, $3)`,
      [pendingOwnerId, pendingAt, pendingPurgeAt],
    )
    const pendingBytes = await directArchiveBytes(403)
    expect(pendingBytes).toEqual(Buffer.from('Unavailable'))
    const dueAt = new Date(Date.now() - 336 * 60 * 60 * 1_000 - 1_000)
    const duePurgeAt = new Date(dueAt.getTime() + 336 * 60 * 60 * 1_000)
    await pool.query(
      `update account_deletion_requests
          set requested_at = $2, purge_after = $3
        where user_id = $1`,
      [pendingOwnerId, dueAt, duePurgeAt],
    )
    const dueBytes = await directArchiveBytes(403)
    expect(dueBytes).toEqual(Buffer.from('Unavailable'))
    await signOutIfSignedIn(page)

    const crossSiteContext = await browser.newContext()
    try {
      const crossSitePage = await crossSiteContext.newPage()
      await crossSitePage.goto('http://localhost:3100/sign-in')
      await crossSitePage.setContent(
        '<a href="http://127.0.0.1:3100/api/account/archive-backup">Download</a>',
      )
      const before = await fixtureFingerprint()
      const rejected = crossSitePage.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === '/api/account/archive-backup',
      )
      await crossSitePage.getByRole('link', { name: 'Download' }).click()
      const response = await rejected
      expect(response.status()).toBe(403)
      await expectPrivateNoStore(response)
      expect(await response.body()).toEqual(Buffer.from('Unavailable'))
      expect(await fixtureFingerprint()).toBe(before)
    } finally {
      await crossSiteContext.close()
    }
  } finally {
    await signOutIfSignedIn(page)
    assertNoUnexpectedBrowserErrors()
  }
})
