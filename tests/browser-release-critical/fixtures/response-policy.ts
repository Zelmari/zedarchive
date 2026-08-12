import {
  type APIResponse,
  expect,
  type BrowserContext,
  type Page,
  type Response,
} from '@playwright/test'
import {
  commonSecurityHeaders,
  deniedPermissionsPolicyFeatures,
  hasExpectedDynamicContentSecurityPolicyShape,
  staticContentSecurityPolicy,
} from '../../../src/config/security-headers'
import { releaseCriticalApplicationOrigin } from './release-critical-constants'

type PageSecurityState = {
  cspBrowserViolationCounts: CspViolationCounts
  cspConsoleMessageCount: number
  imageOptimizerRequestCount: number
  permissionsPolicyWarningFeatures: Set<string>
  staticPolicyChecks: Promise<void>[]
  staticPolicyChecked: boolean
  staticPolicyFailed: boolean
}

type CspViolationSnapshot = Readonly<{
  browserCounts: CspViolationCounts
  consoleCount: number
}>

type CspViolationCounts = {
  connect: number
  font: number
  form: number
  frame: number
  image: number
  other: number
  scriptAttribute: number
  scriptCrossOrigin: number
  scriptEvalDocumentSource: number
  scriptEvalNoSource: number
  scriptEvalOtherSource: number
  scriptEvalSameOriginSource: number
  scriptEvalStaticSource: number
  scriptInline: number
  scriptOther: number
  scriptSameOrigin: number
  style: number
}

function emptyCspViolationCounts(): CspViolationCounts {
  return {
    connect: 0,
    font: 0,
    form: 0,
    frame: 0,
    image: 0,
    other: 0,
    scriptAttribute: 0,
    scriptCrossOrigin: 0,
    scriptEvalDocumentSource: 0,
    scriptEvalNoSource: 0,
    scriptEvalOtherSource: 0,
    scriptEvalSameOriginSource: 0,
    scriptEvalStaticSource: 0,
    scriptInline: 0,
    scriptOther: 0,
    scriptSameOrigin: 0,
    style: 0,
  }
}

const cspViolationSentinels = {
  __zedarchiveM44CspConnectViolation__: 'connect',
  __zedarchiveM44CspFontViolation__: 'font',
  __zedarchiveM44CspFormViolation__: 'form',
  __zedarchiveM44CspFrameViolation__: 'frame',
  __zedarchiveM44CspImageViolation__: 'image',
  __zedarchiveM44CspOtherViolation__: 'other',
  __zedarchiveM44CspScriptAttributeViolation__: 'scriptAttribute',
  __zedarchiveM44CspScriptCrossOriginViolation__: 'scriptCrossOrigin',
  __zedarchiveM44CspScriptEvalDocumentSourceViolation__:
    'scriptEvalDocumentSource',
  __zedarchiveM44CspScriptEvalNoSourceViolation__: 'scriptEvalNoSource',
  __zedarchiveM44CspScriptEvalOtherSourceViolation__: 'scriptEvalOtherSource',
  __zedarchiveM44CspScriptEvalSameOriginSourceViolation__:
    'scriptEvalSameOriginSource',
  __zedarchiveM44CspScriptEvalStaticSourceViolation__: 'scriptEvalStaticSource',
  __zedarchiveM44CspScriptInlineViolation__: 'scriptInline',
  __zedarchiveM44CspScriptOtherViolation__: 'scriptOther',
  __zedarchiveM44CspScriptSameOriginViolation__: 'scriptSameOrigin',
  __zedarchiveM44CspStyleViolation__: 'style',
} as const satisfies Readonly<Record<string, keyof CspViolationCounts>>

const pageSecurityStates = new WeakMap<Page, PageSecurityState>()
const pageSecurityInstallations = new WeakMap<Page, Promise<void>>()
const contextSecurityPages = new WeakMap<BrowserContext, Set<Page>>()
const contextSecurityInstallations = new WeakMap<
  BrowserContext,
  Promise<void>
>()
type HeaderResponse = Response | APIResponse
type DynamicResponsePolicyOptions = Readonly<{
  cache?: 'no-store' | 'private-no-store'
  contentType: 'flight' | 'html' | 'json'
  referrerPolicy?: 'no-referrer' | 'same-origin'
  status: number
}>

async function responseHeaderValue(
  response: HeaderResponse,
  name: string,
): Promise<string | null> {
  if ('headerValue' in response) return response.headerValue(name)
  return response.headers()[name.toLowerCase()] ?? null
}

function isCspConsoleMessage(message: string): boolean {
  return /content security policy|\bcsp\b/iu.test(message)
}

function isPermissionsPolicyConsoleWarning(message: string): boolean {
  return /permissions-policy|permissions policy|unrecognized feature/iu.test(
    message,
  )
}

async function contentSecurityPolicyValues(
  response: HeaderResponse,
): Promise<readonly string[]> {
  return (await response.headersArray())
    .filter(({ name }) => name.toLowerCase() === 'content-security-policy')
    .map(({ value }) => value)
}

async function assertCommonSecurityHeaders(
  response: HeaderResponse,
  options: Readonly<{
    referrerPolicy?: 'no-referrer' | 'same-origin'
  }> = {},
): Promise<void> {
  for (const [name, value] of Object.entries(commonSecurityHeaders)) {
    const expectedValue =
      name === 'Referrer-Policy' ? (options.referrerPolicy ?? value) : value
    expect(await responseHeaderValue(response, name)).toBe(expectedValue)
  }
}

function dynamicPolicyNonce(policy: string): string {
  const match =
    /(?:^|;)\s*script-src\s+[^;]*'nonce-([A-Za-z0-9+/]+={0,2})'/u.exec(policy)
  if (match?.[1] === undefined) {
    throw new TypeError('M44 dynamic CSP nonce is unavailable')
  }
  return match[1]
}

/** Asserts only fixed policy facts; it never returns a header or nonce. */
export async function assertDynamicResponsePolicy(
  response: Response,
  options: DynamicResponsePolicyOptions,
): Promise<void> {
  expect(response.status() === options.status).toBe(true)
  const contentType = (
    (await responseHeaderValue(response, 'content-type')) ?? ''
  ).toLowerCase()
  expect(
    options.contentType === 'html'
      ? contentType.startsWith('text/html')
      : options.contentType === 'flight'
        ? contentType.startsWith('text/x-component')
        : contentType.startsWith('application/json'),
  ).toBe(true)
  if (options.cache !== undefined) {
    const cacheControl = (
      (await responseHeaderValue(response, 'cache-control')) ?? ''
    ).toLowerCase()
    expect(
      cacheControl.includes('no-store') &&
        (options.cache === 'no-store' || cacheControl.includes('private')),
    ).toBe(true)
  }
  await assertCommonSecurityHeaders(response, options)
  const policies = await contentSecurityPolicyValues(response)
  expect(policies.length).toBe(1)
  const policy = policies[0]
  if (
    policy === undefined ||
    !hasExpectedDynamicContentSecurityPolicyShape(policy, {
      development: false,
    })
  ) {
    throw new TypeError('M44 dynamic CSP policy is not the approved shape')
  }

  if (options.contentType !== 'html') return
  const nonce = dynamicPolicyNonce(policy)
  const markup = await response.text()
  const markupNonces = [
    ...markup.matchAll(
      /<(?:script|style)\b[^>]*\snonce=(?:"([^"]+)"|'([^']+)')/giu,
    ),
  ]
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => value !== undefined)

  expect(markupNonces.length).toBeGreaterThan(0)
  expect(markupNonces.every((markupNonce) => markupNonce === nonce)).toBe(true)
}

export async function assertDistinctDynamicHtmlPolicies(
  first: Response,
  second: Response,
): Promise<void> {
  const firstPolicies = await contentSecurityPolicyValues(first)
  const secondPolicies = await contentSecurityPolicyValues(second)
  const firstPolicy = firstPolicies[0]
  const secondPolicy = secondPolicies[0]
  if (firstPolicy === undefined || secondPolicy === undefined) {
    throw new TypeError('M44 dynamic CSP policy is unavailable')
  }
  expect(
    dynamicPolicyNonce(firstPolicy) !== dynamicPolicyNonce(secondPolicy),
  ).toBe(true)
}

export async function assertStaticResponsePolicy(
  response: HeaderResponse,
  options: Readonly<{ hashedAsset?: boolean }> = {},
): Promise<void> {
  await assertCommonSecurityHeaders(response)
  const policies = await contentSecurityPolicyValues(response)
  expect(
    policies.length === 1 && policies[0] === staticContentSecurityPolicy,
  ).toBe(true)
  if (options.hashedAsset === true) {
    const contentType = (
      (await responseHeaderValue(response, 'content-type')) ?? ''
    ).toLowerCase()
    const cacheControl = (
      (await responseHeaderValue(response, 'cache-control')) ?? ''
    ).toLowerCase()
    expect(response.status() === 200).toBe(true)
    expect(
      contentType.startsWith('application/javascript') ||
        contentType.startsWith('text/javascript') ||
        contentType.startsWith('text/css') ||
        contentType.startsWith('font/'),
    ).toBe(true)
    expect(cacheControl === 'public, max-age=31536000, immutable').toBe(true)
  }
}

export async function assertImageOptimizerIsUnreachable(
  page: Page,
): Promise<void> {
  const response = await page.request.get(
    '/_next/image?url=%2Fzedarchivelogo.png&w=640&q=75',
  )
  expect(response.status()).toBe(404)
  expect(await responseHeaderValue(response, 'content-type')).not.toMatch(
    /^image\//iu,
  )
  await assertStaticResponsePolicy(response)
}

export async function installReleaseCriticalSecurityEvidence(
  page: Page,
): Promise<void> {
  const installed = pageSecurityInstallations.get(page)
  if (installed !== undefined) return installed

  const state: PageSecurityState = {
    cspBrowserViolationCounts: emptyCspViolationCounts(),
    cspConsoleMessageCount: 0,
    imageOptimizerRequestCount: 0,
    permissionsPolicyWarningFeatures: new Set(),
    staticPolicyChecks: [],
    staticPolicyChecked: false,
    staticPolicyFailed: false,
  }
  pageSecurityStates.set(page, state)
  contextSecurityPages.get(page.context())?.add(page)
  const installation = page
    .addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        const directive = event.effectiveDirective
        const sentinel = directive.startsWith('connect-src')
          ? '__zedarchiveM44CspConnectViolation__'
          : directive.startsWith('font-src')
            ? '__zedarchiveM44CspFontViolation__'
            : directive.startsWith('form-action')
              ? '__zedarchiveM44CspFormViolation__'
              : directive.startsWith('frame-src') ||
                  directive.startsWith('frame-ancestors')
                ? '__zedarchiveM44CspFrameViolation__'
                : directive.startsWith('img-src')
                  ? '__zedarchiveM44CspImageViolation__'
                  : directive.startsWith('script-src')
                    ? directive.startsWith('script-src-attr')
                      ? '__zedarchiveM44CspScriptAttributeViolation__'
                      : event.blockedURI === 'eval' ||
                          event.blockedURI === 'wasm-eval'
                        ? event.sourceFile.length === 0
                          ? '__zedarchiveM44CspScriptEvalNoSourceViolation__'
                          : (() => {
                              try {
                                const sourceUrl = new URL(
                                  event.sourceFile,
                                  location.href,
                                )
                                if (sourceUrl.href === location.href) {
                                  return '__zedarchiveM44CspScriptEvalDocumentSourceViolation__'
                                }
                                if (
                                  sourceUrl.origin === location.origin &&
                                  sourceUrl.pathname.startsWith(
                                    '/_next/static/',
                                  )
                                ) {
                                  return '__zedarchiveM44CspScriptEvalStaticSourceViolation__'
                                }
                                return sourceUrl.origin === location.origin
                                  ? '__zedarchiveM44CspScriptEvalSameOriginSourceViolation__'
                                  : '__zedarchiveM44CspScriptEvalOtherSourceViolation__'
                              } catch {
                                return '__zedarchiveM44CspScriptEvalOtherSourceViolation__'
                              }
                            })()
                        : event.blockedURI === 'inline' ||
                            event.blockedURI.length === 0
                          ? '__zedarchiveM44CspScriptInlineViolation__'
                          : (() => {
                              try {
                                return new URL(event.blockedURI, location.href)
                                  .origin === location.origin
                                  ? '__zedarchiveM44CspScriptSameOriginViolation__'
                                  : '__zedarchiveM44CspScriptCrossOriginViolation__'
                              } catch {
                                return '__zedarchiveM44CspScriptOtherViolation__'
                              }
                            })()
                    : directive.startsWith('style-src')
                      ? '__zedarchiveM44CspStyleViolation__'
                      : '__zedarchiveM44CspOtherViolation__'
        console.debug(sentinel)
      })
    })
    .then(() => undefined)
  pageSecurityInstallations.set(page, installation)
  page.on('console', (message) => {
    const text = message.text()
    const violationClass =
      cspViolationSentinels[text as keyof typeof cspViolationSentinels]
    if (violationClass !== undefined) {
      state.cspBrowserViolationCounts[violationClass] += 1
    } else if (isCspConsoleMessage(text)) {
      state.cspConsoleMessageCount += 1
    } else if (isPermissionsPolicyConsoleWarning(text)) {
      const matchedFeature = deniedPermissionsPolicyFeatures.find((feature) =>
        text.includes(feature),
      )
      state.permissionsPolicyWarningFeatures.add(
        matchedFeature ?? 'unclassified',
      )
    }
  })
  page.on('request', (request) => {
    try {
      if (new URL(request.url()).pathname === '/_next/image') {
        state.imageOptimizerRequestCount += 1
      }
    } catch {
      // Non-URL request labels are irrelevant to the exact same-origin check.
    }
  })
  page.on('response', (response) => {
    let isStaticAsset = false
    try {
      const parsed = new URL(response.url())
      isStaticAsset =
        parsed.origin === new URL(releaseCriticalApplicationOrigin).origin &&
        parsed.pathname.startsWith('/_next/static/')
    } catch {
      return
    }
    if (!isStaticAsset || state.staticPolicyChecked) return
    const check = assertStaticResponsePolicy(response, { hashedAsset: true })
      .then(() => {
        state.staticPolicyChecked = true
      })
      .catch(() => {
        state.staticPolicyFailed = true
      })
    state.staticPolicyChecks.push(check)
  })
  await installation
}

export async function installReleaseCriticalContextSecurityEvidence(
  context: BrowserContext,
): Promise<void> {
  const installed = contextSecurityInstallations.get(context)
  if (installed !== undefined) return installed

  const pages = new Set(context.pages())
  contextSecurityPages.set(context, pages)
  context.on('page', (page) => {
    pages.add(page)
    void installReleaseCriticalSecurityEvidence(page)
  })
  const installation = Promise.all(
    [...pages].map((page) => installReleaseCriticalSecurityEvidence(page)),
  ).then(() => undefined)
  contextSecurityInstallations.set(context, installation)
  await installation
}

export async function assertReleaseCriticalSecurityEvidence(
  context: BrowserContext,
): Promise<void> {
  const pages = contextSecurityPages.get(context)
  if (pages === undefined) {
    throw new TypeError('M44 context security evidence was not installed')
  }
  for (const page of pages) {
    await assertPageSecurityEvidence(page)
  }
}

async function assertPageSecurityEvidence(page: Page): Promise<void> {
  const state = pageSecurityStates.get(page)
  if (state === undefined) {
    throw new TypeError('M44 page security evidence was not installed')
  }
  await Promise.all(state.staticPolicyChecks)
  expect(state.imageOptimizerRequestCount).toBe(0)
  expect(state.cspBrowserViolationCounts).toEqual(emptyCspViolationCounts())
  expect(state.cspConsoleMessageCount).toBe(0)
  expect([...state.permissionsPolicyWarningFeatures].sort()).toEqual([])
  expect(state.staticPolicyFailed).toBe(false)
  if (
    !page.isClosed() &&
    page.url().startsWith(releaseCriticalApplicationOrigin)
  ) {
    expect(state.staticPolicyChecked).toBe(true)
  }
}

export async function snapshotAdversarialCspViolationEvidence(
  page: Page,
): Promise<CspViolationSnapshot> {
  const state = pageSecurityStates.get(page)
  if (state === undefined) {
    throw new TypeError('M44 page security evidence was not installed')
  }
  return {
    browserCounts: { ...state.cspBrowserViolationCounts },
    consoleCount: state.cspConsoleMessageCount,
  }
}

/** Proves the malformed-origin request added no browser or console CSP event. */
export async function assertAdversarialCspEvidenceUnchanged(
  page: Page,
  snapshot: CspViolationSnapshot,
): Promise<void> {
  const state = pageSecurityStates.get(page)
  if (state === undefined) {
    throw new TypeError('M44 page security evidence was not installed')
  }
  const browserCountDelta = emptyCspViolationCounts()
  for (const key of Object.keys(browserCountDelta) as Array<
    keyof CspViolationCounts
  >) {
    browserCountDelta[key] =
      state.cspBrowserViolationCounts[key] - snapshot.browserCounts[key]
  }
  expect(browserCountDelta).toEqual(emptyCspViolationCounts())
  expect(state.cspConsoleMessageCount - snapshot.consoleCount).toBe(0)
}
