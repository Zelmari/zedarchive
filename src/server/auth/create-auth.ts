import 'server-only'

import { drizzleAdapter, type DB } from '@better-auth/drizzle-adapter'
import { APIError, betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import {
  normalizeUsernameForIdentity,
  usernameSchema,
} from '@/features/identity/domain/username'
import * as schema from '@/server/database/schema'

export type AuthEnvironment = Readonly<{
  authSecret: string
  authUrl: string
}>

export type CreateAuthTestOverrides = Readonly<{
  allowCredentialSignUpForTesting?: boolean
}>

const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 7
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24
const PASSWORD_MIN_LENGTH = 15
const PASSWORD_MAX_LENGTH = 128

export const PENDING_USERNAME_IDENTITY_KEY_SENTINEL =
  '__pending_identity__' as const

const stripCallerUsernameIdentityKeyBeforeHook = createAuthMiddleware(
  async (ctx) => {
    stripCallerUsernameIdentityKeyFromCredentialSignUp(ctx)
  },
)

export function stripCallerUsernameIdentityKeyFromCredentialSignUp(ctx: {
  path?: string
  body?: Record<string, unknown>
}): void {
  if (ctx.path !== '/sign-up/email' || ctx.body === undefined) {
    return
  }

  if ('usernameIdentityKey' in ctx.body) {
    delete ctx.body.usernameIdentityKey
  }
}

export function prepareUserCreateData(user: Record<string, unknown>): {
  data: Record<string, unknown>
} {
  const parsedUsername = usernameSchema.parse(user.name)
  const usernameIdentityKey = normalizeUsernameForIdentity(parsedUsername)

  return {
    data: {
      ...user,
      name: parsedUsername,
      usernameIdentityKey,
    },
  }
}

export function guardAgainstUsernameUpdate(
  user: Partial<Record<string, unknown>>,
): void {
  if (user.name !== undefined) {
    throw new APIError('BAD_REQUEST', {
      message: 'Username cannot be changed through this endpoint',
      code: 'USERNAME_UPDATE_NOT_SUPPORTED',
    })
  }
}

export function createAuthOptions(
  database: DB,
  environment: AuthEnvironment,
  testOverrides: CreateAuthTestOverrides = {},
): BetterAuthOptions {
  return {
    secret: environment.authSecret,
    baseURL: environment.authUrl,
    trustedOrigins: [environment.authUrl],
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: testOverrides.allowCredentialSignUpForTesting !== true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    session: {
      expiresIn: SESSION_EXPIRY_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: {
        enabled: false,
      },
    },
    user: {
      fields: {
        name: 'username',
      },
      additionalFields: {
        usernameIdentityKey: {
          type: 'string',
          required: true,
          input: false,
          returned: false,
          defaultValue: PENDING_USERNAME_IDENTITY_KEY_SENTINEL,
        },
      },
    },
    hooks: {
      before: stripCallerUsernameIdentityKeyBeforeHook,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
    },
    advanced: {
      disableOriginCheck: false,
      database: {
        generateId: 'uuid',
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => prepareUserCreateData(user),
        },
        update: {
          before: async (user) => {
            guardAgainstUsernameUpdate(user)

            return
          },
        },
      },
    },
  }
}

export function createAuth(
  database: DB,
  environment: AuthEnvironment,
  testOverrides: CreateAuthTestOverrides = {},
) {
  return betterAuth(createAuthOptions(database, environment, testOverrides))
}
