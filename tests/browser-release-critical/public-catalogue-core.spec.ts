import { expect, test, type Page } from '@playwright/test'
import {
  ReleaseCriticalDiagnostic,
  writeReleaseCriticalFailureDiagnostic,
} from './fixtures/diagnostic-manifest'
import { failReleaseCriticalIfRequested } from './fixtures/controlled-failure'
import { ReleaseCriticalFixture } from './fixtures/release-critical-fixture'
import {
  assertDistinctDynamicHtmlPolicies,
  assertDynamicResponsePolicy,
  assertImageOptimizerIsUnreachable,
  assertReleaseCriticalSecurityEvidence,
  installReleaseCriticalContextSecurityEvidence,
} from './fixtures/response-policy'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })
test.describe.configure({ mode: 'serial' })

const diagnostic = new ReleaseCriticalDiagnostic('public catalogue core')

function cardForTitle(page: Page, title: string) {
  return page.locator('article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

test.beforeEach(async ({ page }) => {
  await installReleaseCriticalContextSecurityEvidence(page.context())
})

test.afterEach(async ({ page }, testInfo) => {
  await assertReleaseCriticalSecurityEvidence(page.context())
  await writeReleaseCriticalFailureDiagnostic(testInfo, diagnostic)
})

test('public catalogue core', async ({ page }) => {
  const fixture = new ReleaseCriticalFixture()
  let cleanupPassed = false

  try {
    diagnostic.stage('setup')
    await fixture.setupCatalogue()
    diagnostic.checkpoint('databaseGuarded')

    diagnostic.stage('public-browse')
    const browseResponse = await page.goto('/')
    diagnostic.responseStatus(browseResponse?.status() ?? 500)
    expect(browseResponse?.status()).toBe(200)
    if (browseResponse === null) {
      throw new TypeError('M44 public catalogue response is unavailable')
    }
    await assertDynamicResponsePolicy(browseResponse, {
      cache: 'private-no-store',
      contentType: 'html',
      status: 200,
    })
    const secondBrowseResponse = await page.reload()
    if (secondBrowseResponse === null) {
      throw new TypeError('M44 public catalogue response is unavailable')
    }
    await assertDynamicResponsePolicy(secondBrowseResponse, {
      cache: 'private-no-store',
      contentType: 'html',
      status: 200,
    })
    await assertDistinctDynamicHtmlPolicies(
      browseResponse,
      secondBrowseResponse,
    )
    await assertImageOptimizerIsUnreachable(page)
    await expect(
      page.getByRole('heading', { name: 'Anime catalogue', exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/^\d+ anime$/u)).toBeVisible()
    await expect(cardForTitle(page, fixture.catalogueTitle)).toBeVisible()
    await expect(
      page.getByText('Sign in to add anime to your archive.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      cardForTitle(page, fixture.catalogueTitle).getByRole('combobox', {
        name: 'Status',
      }),
    ).toHaveCount(0)
    diagnostic.checkpoint('catalogueVisible')
    failReleaseCriticalIfRequested('public')

    diagnostic.stage('public-search')
    await page
      .getByRole('search')
      .getByRole('searchbox', { name: 'Search anime' })
      .fill(fixture.catalogueTitle)
    await Promise.all([
      page.waitForURL(
        (url) => url.searchParams.get('q') === fixture.catalogueTitle,
      ),
      page.getByRole('button', { name: 'Search', exact: true }).click(),
    ])
    const searchedUrl = new URL(page.url())
    expect(searchedUrl.pathname).toBe('/')
    expect(searchedUrl.search).toBe(
      `?q=${fixture.catalogueTitle.replaceAll(' ', '+')}`,
    )
    await expect(
      page.getByText(`1 result for "${fixture.catalogueTitle}"`, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(cardForTitle(page, fixture.catalogueTitle)).toBeVisible()
    diagnostic.checkpoint('searchMatched')

    await page
      .getByRole('searchbox', { name: 'Search anime' })
      .fill('M41 No Matching Catalogue Result')
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.searchParams.get('q') === 'M41 No Matching Catalogue Result',
      ),
      page.getByRole('button', { name: 'Search', exact: true }).click(),
    ])
    await expect(
      page.getByRole('heading', { name: 'No anime found', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'No results matched “M41 No Matching Catalogue Result”. Try another title or browse all anime.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Browse all anime', exact: true }),
    ).toBeVisible()
    diagnostic.checkpoint('emptyStateVisible')
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
