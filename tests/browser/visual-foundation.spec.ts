import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { hashPassword } from 'better-auth/crypto'
import 'dotenv/config'
import { Pool } from 'pg'
import { readDatabaseRuntimeEnvironment } from '../../src/config/database-environment'

test.use({ screenshot: 'off', trace: 'off' })

const applicationOrigin = 'http://127.0.0.1:3100'
const viewports = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 960 },
] as const
const fixturePrefix = `m37-browser-${randomUUID()}`
const password = `M37-${randomUUID()}-password`
// The visual shell must prove its maximum-length account-identity behaviour,
// not merely a long-looking string. This remains valid under the username
// domain rules: alphanumeric, starts and ends with a letter/number, 20 chars.
const maximumUsername = `M37${randomUUID().replaceAll('-', '').slice(0, 17)}`
const owner = {
  email: `${fixturePrefix}@example.test`,
  username: maximumUsername,
}

if (maximumUsername.length !== 20) {
  throw new Error('M37 browser fixture username must be exactly 20 characters')
}

const { databaseUrl } = readDatabaseRuntimeEnvironment()
const pool = new Pool({ connectionString: databaseUrl })
let ownerId = ''

type RateLimitSnapshot = Readonly<{
  count: number
  id: string
  key: string
  lastRequest: string
}>

const authRateLimitKeys = [
  '127.0.0.1|/sign-in/email',
  '127.0.0.1|/sign-out',
] as const
let rateLimitSnapshot: RateLimitSnapshot[] = []

function assertAllowedFixtureDatabase(databaseName: string | undefined) {
  const expectedDatabaseName =
    process.env.CI === 'true' ? 'zedarchive_test' : 'zedarchive_dev'

  if (databaseName !== expectedDatabaseName) {
    throw new Error('M37 browser fixture database target is not allowed')
  }
}

function monitorBoundedBrowserEvidence(page: Page) {
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
    if (message.type() === 'error') {
      unexpectedConsoleErrorObserved = true
    }
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

async function expectHorizontallyReachable(page: Page, selector: string) {
  await expectLocatorHorizontallyReachable(page, page.locator(selector))
}

async function expectLocatorHorizontallyReachable(
  page: Page,
  locator: ReturnType<Page['locator']>,
) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerWidth)) + 0.5,
  )
}

async function waitForProductionCss(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        return [
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
        })
      }),
    )
    .toBe(true)

  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--za-color-canvas')
          .trim(),
      ),
    )
    .not.toBe('')
}

async function loadSpecimen(page: Page) {
  const response = await page.goto('/sign-in')
  expect(response?.status()).toBe(200)
  await waitForProductionCss(page)

  await page.evaluate(() => {
    const main = document.createElement('main')
    main.className = 'za-container za-container--wide'
    main.id = 'visual-foundation-specimen'
    main.tabIndex = -1
    main.innerHTML = `
      <section aria-labelledby="foundation-identity-heading" data-zone="identity">
        <p class="za-wordmark">zedarchive</p>
        <h1 id="foundation-identity-heading">Quiet archive editorial foundation</h1>
        <p>Fixed synthetic content demonstrates production visual recipes.</p>
        <a class="za-link" href="#foundation-actions">Explore actions</a>
        <label for="foundation-search">Search archive</label>
        <input class="za-field" id="foundation-search" name="search" type="search" />
      </section>
      <section aria-labelledby="foundation-actions-heading" data-zone="actions" id="foundation-actions">
        <h2 id="foundation-actions-heading">Action hierarchy</h2>
        <div>
          <button class="za-button za-button--primary" id="foundation-primary" type="button">Save archive</button>
          <button class="za-button za-button--secondary" id="foundation-secondary" type="button">Preview</button>
          <button class="za-button za-button--tertiary" id="foundation-tertiary" type="button">Learn more</button>
          <button class="za-button za-button--destructive" id="foundation-destructive" type="button">Delete draft</button>
          <button class="za-button za-button--secondary" disabled type="button">Unavailable</button>
        </div>
        <label for="foundation-select">Archive status</label>
        <select class="za-select" id="foundation-select" name="status">
          <option>Planned</option>
          <option>Watching</option>
        </select>
        <label for="foundation-invalid">Title</label>
        <input aria-describedby="foundation-invalid-help" aria-invalid="true" class="za-field" id="foundation-invalid" name="title" />
        <p id="foundation-invalid-help">A title is required.</p>
      </section>
      <section aria-labelledby="foundation-state-heading" data-zone="states">
        <h2 id="foundation-state-heading">Archive states</h2>
        <article class="za-card za-card--raised" id="foundation-raised-card">
          <div aria-label="The Amber Atlas initials" class="za-title-tile">TA</div>
          <div>
            <h3>The Amber Atlas</h3>
            <p>2014 · 12 episodes</p>
          </div>
        </article>
        <article class="za-card za-card--restricted">
          <div>
            <h3>Restricted entry</h3>
            <p>Sign in to view availability.</p>
          </div>
        </article>
        <p class="za-notice za-notice--information">Information: imported archive data is ready to review.</p>
        <p class="za-notice za-notice--success">Success: archive preferences saved.</p>
        <p class="za-notice za-notice--warning">Warning: metadata is incomplete.</p>
        <p class="za-notice za-notice--error">Error: the archive could not be updated.</p>
        <section aria-labelledby="foundation-empty-heading">
          <h3 id="foundation-empty-heading">No saved titles yet</h3>
          <p>Your archive is empty.</p>
        </section>
        <p role="alert">Archive unavailable. Try again later.</p>
      </section>
    `

    const primaryButton = main.querySelector<HTMLButtonElement>(
      '#foundation-primary',
    )
    primaryButton?.addEventListener('click', () => {
      primaryButton.setAttribute('data-activated', 'true')
    })
    document.body.replaceChildren(main)
  })

  await expect(page.locator('#visual-foundation-specimen')).toBeVisible()
}

async function computedValue(page: Page, selector: string, property: string) {
  return page
    .locator(selector)
    .evaluate(
      (element, propertyName) =>
        getComputedStyle(element).getPropertyValue(propertyName),
      property,
    )
}

async function resolvedTokenColour(
  page: Page,
  token: string,
  property: string,
) {
  return page.evaluate(
    ({ tokenName, styleProperty }) => {
      const probe = document.createElement('span')
      probe.style.setProperty(styleProperty, `var(${tokenName})`)
      document.body.append(probe)
      const value = getComputedStyle(probe).getPropertyValue(styleProperty)
      probe.remove()
      return value
    },
    { tokenName: token, styleProperty: property },
  )
}

async function resolvedTokenValue(page: Page, token: string, property: string) {
  return page.evaluate(
    ({ tokenName, styleProperty }) => {
      const probe = document.createElement('span')
      probe.style.setProperty(styleProperty, `var(${tokenName})`)
      document.body.append(probe)
      const value = getComputedStyle(probe).getPropertyValue(styleProperty)
      probe.remove()
      return value
    },
    { tokenName: token, styleProperty: property },
  )
}

async function expectSpecimenRecipeContract(page: Page) {
  const primaryBackground = await resolvedTokenColour(
    page,
    '--za-color-accent',
    'background-color',
  )
  const primaryForeground = await resolvedTokenColour(
    page,
    '--za-color-on-accent',
    'color',
  )
  const primaryHoverBackground = await resolvedTokenColour(
    page,
    '--za-color-accent-hover',
    'background-color',
  )
  const primaryActiveBackground = await resolvedTokenColour(
    page,
    '--za-color-accent-active',
    'background-color',
  )
  const destructiveBackground = await resolvedTokenColour(
    page,
    '--za-color-destructive',
    'background-color',
  )
  const destructiveForeground = await resolvedTokenColour(
    page,
    '--za-color-on-destructive',
    'color',
  )
  const destructiveHoverBackground = await resolvedTokenColour(
    page,
    '--za-color-destructive-hover',
    'background-color',
  )
  const destructiveActiveBackground = await resolvedTokenColour(
    page,
    '--za-color-destructive-active',
    'background-color',
  )
  const raisedShadow = await resolvedTokenValue(
    page,
    '--za-shadow-raised',
    'box-shadow',
  )

  await expect(
    page.getByRole('link', { name: 'Explore actions' }),
  ).toBeVisible()
  await expect(
    page.getByRole('searchbox', { name: 'Search archive' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save archive' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Learn more' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete draft' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'The Amber Atlas' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Restricted entry' }),
  ).toBeVisible()
  await expect(page.getByText(/^Information:/)).toBeVisible()
  await expect(page.getByText(/^Success:/)).toBeVisible()
  await expect(page.getByText(/^Warning:/)).toBeVisible()
  await expect(page.getByText(/^Error:/)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No saved titles yet' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Archive unavailable. Try again later.' }),
  ).toBeVisible()

  expect(
    await computedValue(page, '#foundation-primary', 'background-color'),
  ).toBe(primaryBackground)
  expect(await computedValue(page, '#foundation-primary', 'color')).toBe(
    primaryForeground,
  )
  expect(
    await computedValue(page, '#foundation-destructive', 'background-color'),
  ).toBe(destructiveBackground)
  expect(await computedValue(page, '#foundation-destructive', 'color')).toBe(
    destructiveForeground,
  )
  expect(
    await computedValue(page, '#foundation-raised-card', 'box-shadow'),
  ).toBe(raisedShadow)
  expect(
    await computedValue(page, '#foundation-search', 'border-top-width'),
  ).toBe('1px')
  expect(await computedValue(page, '#foundation-search', 'border-radius')).toBe(
    '8px',
  )
  expect(await computedValue(page, '#foundation-primary', 'min-height')).toBe(
    '40px',
  )
  expect(
    await computedValue(page, '#foundation-primary', 'transition-duration'),
  ).toContain('0.15s')

  const tileBox = await page.locator('.za-title-tile').first().boundingBox()
  expect(tileBox).not.toBeNull()
  expect(tileBox!.height / tileBox!.width).toBeCloseTo(1.5, 1)
  await expect(page.locator('.za-title-tile').first()).toHaveText('TA')

  await page.locator('#foundation-primary').hover()
  await expect
    .poll(() => computedValue(page, '#foundation-primary', 'background-color'))
    .toBe(primaryHoverBackground)
  await page.mouse.down()
  try {
    await expect
      .poll(() =>
        computedValue(page, '#foundation-primary', 'background-color'),
      )
      .toBe(primaryActiveBackground)
  } finally {
    await page.mouse.up()
  }

  await page.locator('#foundation-destructive').hover()
  await expect
    .poll(() =>
      computedValue(page, '#foundation-destructive', 'background-color'),
    )
    .toBe(destructiveHoverBackground)
  await page.mouse.down()
  try {
    await expect
      .poll(() =>
        computedValue(page, '#foundation-destructive', 'background-color'),
      )
      .toBe(destructiveActiveBackground)
  } finally {
    await page.mouse.up()
  }

  await page.locator('#visual-foundation-specimen').focus()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Explore actions' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#foundation-search')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#foundation-primary')).toBeFocused()
  expect(
    await computedValue(page, '#foundation-primary', 'outline-width'),
  ).toBe('3px')
  expect(
    await computedValue(page, '#foundation-primary', 'outline-offset'),
  ).toBe('3px')
  await page.keyboard.press('Enter')
  await expect(page.locator('#foundation-primary')).toHaveAttribute(
    'data-activated',
    'true',
  )
  await page.locator('#foundation-primary').focus()
  await page.keyboard.press('Space')
  await expect(page.locator('#foundation-primary')).toHaveAttribute(
    'data-activated',
    'true',
  )

  await page.locator('#foundation-search').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(
    page.getByRole('link', { name: 'Explore actions' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#foundation-search')).toBeFocused()
}

async function assertSpecimenAtViewport(
  page: Page,
  viewport: (typeof viewports)[number],
) {
  await page.setViewportSize(viewport)
  await loadSpecimen(page)
  await expectSpecimenRecipeContract(page)
  await expectNoHorizontalOverflow(page)

  for (const selector of [
    '[data-zone="identity"]',
    '[data-zone="actions"]',
    '[data-zone="states"]',
    '#foundation-primary',
    '#foundation-search',
    '#foundation-destructive',
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded()
    await expectHorizontallyReachable(page, selector)
  }
}

async function signIn(page: Page) {
  await page.goto('/sign-in')
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
  expect((await response).status()).toBe(200)
  await expect(page.getByText('Signed in as')).toBeVisible()
}

async function signOutIfSignedIn(page: Page) {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
  if (!(await signOut.isVisible().catch(() => false))) return

  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/auth/sign-out',
  )
  await signOut.click()
  expect((await response).status()).toBe(200)
  await page.reload()
  await expect(
    page
      .getByRole('navigation', { name: 'Account', exact: true })
      .getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
}

async function snapshotAuthRateLimits() {
  const result = await pool.query<RateLimitSnapshot>(
    `
      select id, key, count, last_request::text as "lastRequest"
      from rate_limits
      where key = any($1::text[])
      order by key
    `,
    [authRateLimitKeys],
  )
  return result.rows
}

async function restoreAuthRateLimits() {
  const desired = new Map(rateLimitSnapshot.map((row) => [row.key, row]))
  const current = await snapshotAuthRateLimits()

  for (const row of current) {
    if (!desired.has(row.key)) {
      await pool.query(
        'delete from rate_limits where id = $1::uuid and key = $2',
        [row.id, row.key],
      )
    }
  }
  for (const row of rateLimitSnapshot) {
    await pool.query(
      `
        insert into rate_limits (id, key, count, last_request)
        values ($1::uuid, $2, $3, $4::bigint)
        on conflict (key) do update
        set id = excluded.id,
            count = excluded.count,
            last_request = excluded.last_request
      `,
      [row.id, row.key, row.count, row.lastRequest],
    )
  }

  expect(await snapshotAuthRateLimits()).toEqual(rateLimitSnapshot)
}

test.beforeAll(async () => {
  const target = await pool.query<{ name: string }>(
    'select current_database() as name',
  )
  assertAllowedFixtureDatabase(target.rows[0]?.name)
  rateLimitSnapshot = await snapshotAuthRateLimits()

  ownerId = randomUUID()
  await pool.query(
    `
      insert into users (id, username, username_identity_key, email, email_verified)
      values ($1::uuid, $2, $3, $4, true)
    `,
    [ownerId, owner.username, owner.username.toLowerCase(), owner.email],
  )
  await pool.query(
    `
      insert into accounts (id, user_id, account_id, provider_id, password)
      values ($1::uuid, $2::uuid, $3, 'credential', $4)
    `,
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
    assertAllowedFixtureDatabase(target.rows[0]?.name)

    if (ownerId !== '') {
      await pool.query('delete from users where id = $1::uuid', [ownerId])
      const residue = await pool.query<{
        accounts: number
        sessions: number
        users: number
      }>(
        `
          select
            (select count(*)::int from users where id = $1::uuid) as users,
            (select count(*)::int from accounts where user_id = $1::uuid) as accounts,
            (select count(*)::int from sessions where user_id = $1::uuid) as sessions
        `,
        [ownerId],
      )
      expect(residue.rows[0]).toEqual({ accounts: 0, sessions: 0, users: 0 })
    }
    await restoreAuthRateLimits()
  } finally {
    await pool.end()
  }
})

test('renders the compiled visual foundation specimen without changing the application document', async ({
  page,
}) => {
  const assertBoundedBrowserEvidence = monitorBoundedBrowserEvidence(page)

  for (const viewport of viewports) {
    await assertSpecimenAtViewport(page, viewport)
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadSpecimen(page)
  expect(
    await computedValue(page, '#foundation-primary', 'transition-duration'),
  ).toMatch(/^(?:0\.01ms|1e-05s)$/)
  expect(
    await computedValue(
      page,
      '#foundation-primary',
      'animation-iteration-count',
    ),
  ).toBe('1')

  await page.emulateMedia({ forcedColors: 'active' })
  await page.locator('#foundation-primary').focus()
  expect(
    await computedValue(page, '#foundation-primary', 'forced-color-adjust'),
  ).not.toBe('none')
  expect(
    await computedValue(page, '#foundation-primary', 'outline-width'),
  ).toBe('3px')
  await expect(page.getByRole('button', { name: 'Save archive' })).toBeVisible()
  await expect(page.getByLabel('Search archive')).toBeVisible()

  await page.emulateMedia({ contrast: 'more', forcedColors: 'none' })
  const increasedContrastSupported = await page.evaluate(
    () => matchMedia('(prefers-contrast: more)').matches,
  )
  if (increasedContrastSupported) {
    await expect(
      page.getByRole('button', { name: 'Save archive' }),
    ).toBeVisible()
    await expect(page.getByLabel('Search archive')).toBeVisible()
  } else {
    test.info().annotations.push({
      type: 'capability-gap',
      description:
        'Installed Chromium did not expose prefers-contrast: more after Playwright emulation.',
    })
  }

  await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'none' })
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await expectNoHorizontalOverflow(page)
  for (const selector of [
    '#foundation-search',
    '#foundation-primary',
    '#foundation-destructive',
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded()
    await expectHorizontallyReachable(page, selector)
  }

  assertBoundedBrowserEvidence()
})

test('preserves public shell, metadata, favicon, and keyboard evidence at every M37 viewport', async ({
  page,
}) => {
  const assertBoundedBrowserEvidence = monitorBoundedBrowserEvidence(page)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    const browseResponse = await page.goto('/')
    expect(browseResponse?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: 'Anime catalogue' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const validationResponse = await page.goto('/?q=one&q=two')
    expect(validationResponse?.status()).toBe(200)
    await expect(
      page
        .locator('p[role="alert"]')
        .filter({ hasText: 'Search must be provided only once' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const signInResponse = await page.goto('/sign-in')
    expect(signInResponse?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }

  await page.goto('/sign-in')
  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main-content')).toBeFocused()

  expect(await page.locator('html').getAttribute('lang')).toBe('en')
  await expect(page).toHaveTitle('Sign in')
  const signInDescription = await page
    .locator('meta[name="description"]')
    .getAttribute('content')
  expect(signInDescription).toBe('Sign in to your zedarchive account.')

  await page.goto('/')
  await expect(page).toHaveTitle('zedarchive')
  const rootDescription = await page
    .locator('meta[name="description"]')
    .getAttribute('content')
  expect(rootDescription).toBe('Track the things you watch and read.')

  const icons = await page
    .locator('link[rel~="icon"]')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLLinkElement).href).href),
    )
  expect(icons).toHaveLength(1)
  const [iconHref] = icons
  expect(iconHref).toBeDefined()
  expect(new URL(iconHref).origin).toBe(applicationOrigin)
  const iconResponse = await page.request.get(iconHref)
  expect(iconResponse.ok()).toBe(true)
  expect(iconResponse.headers()['content-type']).toContain('image/svg+xml')
  const iconMarkup = await iconResponse.text()
  expect(iconMarkup).not.toMatch(/<script|\son[a-z]+=/iu)
  expect(iconMarkup).not.toMatch(/\b(?:href|src)\s*=\s*["'](?:https?:|data:)/iu)

  await page.goto('/sign-in')
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(email).toBeVisible()
  await expect(signIn).toBeVisible()
  await email.scrollIntoViewIfNeeded()
  await expectLocatorHorizontallyReachable(page, email)
  await signIn.scrollIntoViewIfNeeded()
  await expectHorizontallyReachable(page, 'button[type="submit"]')
  await expectNoHorizontalOverflow(page)

  await page.goto('/')
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const search = page.getByRole('searchbox', { name: 'Search anime' })
  const searchSubmit = page.getByRole('button', { name: 'Search', exact: true })
  await expect(search).toBeVisible()
  await expect(searchSubmit).toBeVisible()
  await search.scrollIntoViewIfNeeded()
  await expectHorizontallyReachable(page, '#anime-search-query')
  await searchSubmit.scrollIntoViewIfNeeded()
  await expectHorizontallyReachable(page, 'form[role="search"] button')
  await expectNoHorizontalOverflow(page)

  assertBoundedBrowserEvidence()
})

test('keeps the exact maximum-length signed-in username shell reachable at every M37 viewport', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const assertBoundedBrowserEvidence = monitorBoundedBrowserEvidence(page)
  await signIn(page)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const brand = page.getByRole('link', { name: 'zedarchive', exact: true })
    const primary = page.getByRole('navigation', {
      name: 'Primary',
      exact: true,
    })
    const account = page.getByRole('navigation', {
      name: 'Account',
      exact: true,
    })
    const identity = page.getByText(`@${owner.username}`, { exact: true })
    const settings = account.getByRole('link', {
      name: 'Settings',
      exact: true,
    })
    const signOut = account.getByRole('button', {
      name: 'Sign out',
      exact: true,
    })

    await expect(brand).toBeVisible()
    const archiveLink = primary.getByRole('link', {
      name: 'My anime',
      exact: true,
    })
    await expect(archiveLink).toBeVisible()
    await expect(archiveLink).toHaveClass(/\bza-button--secondary\b/)
    await expect(archiveLink).toHaveCSS('display', /^(flex|inline-flex)$/)
    await expect(identity).toBeVisible()
    await expect(settings).toBeVisible()
    await expect(signOut).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const landmarkOrder = await page.getByRole('banner').evaluate((header) => {
      const brand = header.querySelector<HTMLAnchorElement>('a[href="/"]')
      const primary = header.querySelector<HTMLElement>(
        'nav[aria-label="Primary"]',
      )
      const account = header.querySelector<HTMLElement>(
        'nav[aria-label="Account"]',
      )
      if (!brand || !primary || !account) return null

      return {
        accountFollowsPrimary: Boolean(
          primary.compareDocumentPosition(account) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        primaryFollowsBrand: Boolean(
          brand.compareDocumentPosition(primary) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      }
    })
    expect(landmarkOrder).toEqual({
      accountFollowsPrimary: true,
      primaryFollowsBrand: true,
    })
    await expect(account).toContainText(`@${owner.username}`)
    await expect(account).toContainText('Settings')
    await expect(account).toContainText('Sign out')
    const identityBox = await identity.boundingBox()
    expect(identityBox).not.toBeNull()
    expect(identityBox!.height).toBeGreaterThan(0)
    expect(
      await identity.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          overflow: style.overflow,
          scrollsHorizontally: element.scrollWidth > element.clientWidth,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          wordBreak: style.wordBreak,
        }
      }),
    ).toEqual({
      overflow: 'visible',
      scrollsHorizontally: false,
      textOverflow: 'clip',
      whiteSpace: 'normal',
      wordBreak: 'break-all',
    })

    for (const locator of [
      brand,
      primary,
      account,
      identity,
      settings,
      signOut,
    ]) {
      await locator.scrollIntoViewIfNeeded()
      const box = await locator.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5)
    }
  }

  assertBoundedBrowserEvidence()
})
