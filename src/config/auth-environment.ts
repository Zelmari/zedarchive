import 'server-only'

import { z } from 'zod'

type Environment = Readonly<Record<string, unknown>>

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname)
}

const authSecretSchema = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_SECRET cannot contain surrounding whitespace',
    })

    return
  }

  if (value.length < 32) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_SECRET must be at least 32 characters',
    })
  }
})

const authUrlSchema = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL cannot contain surrounding whitespace',
    })

    return
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must be a valid absolute origin',
    })

    return
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must use http or https',
    })

    return
  }

  if (parsedUrl.username || parsedUrl.password) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL cannot include credentials',
    })

    return
  }

  if (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must not include a path',
    })

    return
  }

  if (parsedUrl.search) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must not include a query',
    })

    return
  }

  if (parsedUrl.hash) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must not include a fragment',
    })

    return
  }

  const canonicalOrigin = parsedUrl.origin

  if (value !== canonicalOrigin) {
    context.addIssue({
      code: 'custom',
      message:
        'BETTER_AUTH_URL must be a canonical origin without trailing slash',
    })

    return
  }

  if (
    parsedUrl.protocol === 'http:' &&
    !isLoopbackHostname(parsedUrl.hostname)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'BETTER_AUTH_URL must use https for non-loopback hosts',
    })
  }
})

const authEnvironmentSchema = z.strictObject({
  BETTER_AUTH_SECRET: authSecretSchema,
  BETTER_AUTH_URL: authUrlSchema,
})

function parseAuthEnvironment(environment: Environment): {
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
} {
  const result = authEnvironmentSchema.safeParse({
    BETTER_AUTH_SECRET: environment.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: environment.BETTER_AUTH_URL,
  })

  if (!result.success) {
    const issue = result.error.issues[0]

    if (issue?.path[0] === 'BETTER_AUTH_SECRET') {
      if (typeof environment.BETTER_AUTH_SECRET !== 'string') {
        throw new Error('BETTER_AUTH_SECRET must be a string')
      }

      throw new Error(issue.message)
    }

    if (issue?.path[0] === 'BETTER_AUTH_URL') {
      if (typeof environment.BETTER_AUTH_URL !== 'string') {
        throw new Error('BETTER_AUTH_URL must be a string')
      }

      throw new Error(issue.message)
    }

    throw new Error('BETTER_AUTH_SECRET must be a string')
  }

  return result.data
}

const FORBIDDEN_TRUSTED_ORIGINS_VARIABLE = 'BETTER_AUTH_TRUSTED_ORIGINS'

function assertTrustedOriginsVariableAbsent(environment: Environment): void {
  if (environment[FORBIDDEN_TRUSTED_ORIGINS_VARIABLE] !== undefined) {
    throw new Error(`${FORBIDDEN_TRUSTED_ORIGINS_VARIABLE} must not be set`)
  }
}

export function readAuthEnvironment(environment: Environment = process.env): {
  authSecret: string
  authUrl: string
} {
  assertTrustedOriginsVariableAbsent(environment)

  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } =
    parseAuthEnvironment(environment)

  return {
    authSecret: BETTER_AUTH_SECRET,
    authUrl: BETTER_AUTH_URL,
  }
}
