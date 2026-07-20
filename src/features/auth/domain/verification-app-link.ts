import { z } from 'zod'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

const PROVIDER_VERIFICATION_PATH = '/api/auth/verify-email'

export const authOriginSchema = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin cannot contain surrounding whitespace',
    })

    return
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must be a valid absolute origin',
    })

    return
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must use http or https',
    })

    return
  }

  if (parsedUrl.username || parsedUrl.password) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin cannot include credentials',
    })

    return
  }

  if (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must not include a path',
    })

    return
  }

  if (parsedUrl.search) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must not include a query',
    })

    return
  }

  if (parsedUrl.hash) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must not include a fragment',
    })

    return
  }

  const canonicalOrigin = parsedUrl.origin

  if (value !== canonicalOrigin) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must be a canonical origin without trailing slash',
    })

    return
  }

  if (
    parsedUrl.protocol === 'http:' &&
    !LOOPBACK_HOSTNAMES.has(parsedUrl.hostname)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Auth origin must use https for non-loopback hosts',
    })
  }
})

export function buildVerificationAppLink(
  authOrigin: string,
  token: string,
): string {
  const validatedOrigin = authOriginSchema.parse(authOrigin)
  const url = new URL('/verify-email', validatedOrigin)

  url.hash = new URLSearchParams({ token }).toString()

  const href = url.toString()

  if (href.includes(PROVIDER_VERIFICATION_PATH)) {
    throw new Error(
      'Verification links must not target the provider mutation URL',
    )
  }

  return href
}
