const nonceByteLength = 16
const base64NoncePattern = /^[A-Za-z0-9+/]+={0,2}$/u

export const deniedPermissionsPolicyFeatures = [
  'accelerometer',
  'attribution-reporting',
  'autoplay',
  'browsing-topics',
  'camera',
  'captured-surface-control',
  'clipboard-read',
  'clipboard-write',
  'compute-pressure',
  'deferred-fetch',
  'deferred-fetch-minimal',
  'digital-credentials-get',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'identity-credentials-get',
  'interest-cohort',
  'join-ad-interest-group',
  'keyboard-map',
  'language-detector',
  'language-model',
  'local-fonts',
  'local-network',
  'local-network-access',
  'loopback-network',
  'magnetometer',
  'microphone',
  'midi',
  'on-device-speech-recognition',
  'otp-credentials',
  'payment',
  'picture-in-picture',
  'publickey-credentials-create',
  'publickey-credentials-get',
  'private-aggregation',
  'private-state-token-issuance',
  'private-state-token-redemption',
  'run-ad-auction',
  'screen-wake-lock',
  'serial',
  'shared-storage',
  'shared-storage-select-url',
  'storage-access',
  'summarizer',
  'sync-xhr',
  'translator',
  'unload',
  'usb',
  'window-management',
  'xr-spatial-tracking',
] as const

export const commonSecurityHeaders = {
  'Permissions-Policy': deniedPermissionsPolicyFeatures
    .map((feature) => `${feature}=()`)
    .join(', '),
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const

export const staticContentSecurityPolicy =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

function assertValidNonce(nonce: string): void {
  if (
    nonce.length === 0 ||
    nonce.length > 256 ||
    !base64NoncePattern.test(nonce)
  ) {
    throw new TypeError('CSP nonce must be a non-empty base64 value')
  }
}

export function createContentSecurityPolicyNonce(): string {
  const bytes = new Uint8Array(nonceByteLength)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function buildDynamicContentSecurityPolicy(
  nonce: string,
  options: Readonly<{ development: boolean }>,
): string {
  assertValidNonce(nonce)

  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
  if (options.development) scriptSources.push("'unsafe-eval'")

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function hasExpectedDynamicContentSecurityPolicyShape(
  policy: string,
  options: Readonly<{ development: boolean }>,
): boolean {
  const directiveEntries = policy
    .split(';')
    .map((directive): readonly [string, string] => {
      const [name, ...values] = directive.trim().split(/\s+/u)
      return [name ?? '', values.join(' ')]
    })
  const directives = new Map(directiveEntries)
  const scriptSource = directives.get('script-src')
  const styleSource = directives.get('style-src')
  const nonceMatch =
    scriptSource === undefined
      ? undefined
      : /'nonce-([A-Za-z0-9+/]+={0,2})'/u.exec(scriptSource)

  return (
    nonceMatch?.[1] !== undefined &&
    base64NoncePattern.test(nonceMatch[1]) &&
    scriptSource ===
      [
        "'self'",
        `'nonce-${nonceMatch[1]}'`,
        "'strict-dynamic'",
        ...(options.development ? ["'unsafe-eval'"] : []),
      ].join(' ') &&
    styleSource === `'self' 'nonce-${nonceMatch[1]}'` &&
    directives.get('default-src') === "'self'" &&
    directives.get('img-src') === "'self' data: blob:" &&
    directives.get('font-src') === "'self'" &&
    directives.get('connect-src') === "'self'" &&
    directives.get('object-src') === "'none'" &&
    directives.get('base-uri') === "'self'" &&
    directives.get('form-action') === "'self'" &&
    directives.get('frame-src') === "'none'" &&
    directives.get('frame-ancestors') === "'none'" &&
    directives.size === 11 &&
    directiveEntries.length === directives.size
  )
}

export function isStaticSecurityPath(pathname: string): boolean {
  return (
    pathname === '/zedarchivelogo.png' ||
    pathname === '/_next/static' ||
    pathname === '/_next/image' ||
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/_next/image/')
  )
}

export function isNextPrefetchRequest(headers: Headers): boolean {
  return (
    headers.has('next-router-prefetch') ||
    headers.get('purpose')?.toLowerCase() === 'prefetch'
  )
}
