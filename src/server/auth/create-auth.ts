import 'server-only'

import { drizzleAdapter, type DB } from '@better-auth/drizzle-adapter'
import { APIError, betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { haveIBeenPwned } from 'better-auth/plugins'
import {
  normalizeUsernameForIdentity,
  usernameSchema,
} from '@/features/identity/domain/username'
import type {
  AuthEmailCallbackData,
  AuthEmailCallbacks,
} from '@/server/auth/auth-email-callbacks'
import * as schema from '@/server/database/schema'

export type AuthEnvironment = Readonly<{
  authSecret: string
  authUrl: string
}>

export type CreateAuthTestOverrides = Readonly<{
  allowCredentialSignUpForTesting?: boolean
  verificationExpiresInSeconds?: number
  resetExpiresInSeconds?: number
}>

export type CreateAuthDependencies = Readonly<{
  emailCallbacks?: AuthEmailCallbacks
  backgroundTaskHandler?: (promise: Promise<unknown>) => void
}>

export type AuthRegistrationMode = 'disabled' | 'verified-email-required'

export type CreateAuthConfiguration = Readonly<{
  registrationMode?: AuthRegistrationMode
}>

const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 7
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24
const EMAIL_VERIFICATION_EXPIRY_SECONDS = 60 * 60 * 24
const PASSWORD_RESET_EXPIRY_SECONDS = 60 * 60
const PASSWORD_MIN_LENGTH = 15
const PASSWORD_MAX_LENGTH = 128
const SIGN_UP_RATE_LIMIT_WINDOW_SECONDS = 60
const SIGN_UP_RATE_LIMIT_MAX_REQUESTS = 3

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

function hasCompleteEmailCallbacks(
  callbacks: AuthEmailCallbacks | undefined,
): callbacks is AuthEmailCallbacks {
  return (
    callbacks !== undefined &&
    typeof callbacks.sendVerificationEmail === 'function' &&
    typeof callbacks.sendResetPassword === 'function' &&
    typeof callbacks.afterPasswordReset === 'function'
  )
}

export function createAuthOptions(
  database: DB,
  environment: AuthEnvironment,
  dependencies: CreateAuthDependencies = {},
  configuration: CreateAuthConfiguration = {},
  testOverrides: CreateAuthTestOverrides = {},
): BetterAuthOptions {
  const emailCallbacks = dependencies.emailCallbacks
  const registrationMode = configuration.registrationMode ?? 'disabled'

  if (
    registrationMode === 'verified-email-required' &&
    !hasCompleteEmailCallbacks(emailCallbacks)
  ) {
    throw new Error(
      'Verified-email registration requires complete authentication email callbacks',
    )
  }

  const credentialSignUpEnabled =
    registrationMode === 'verified-email-required' ||
    (registrationMode === 'disabled' &&
      testOverrides.allowCredentialSignUpForTesting === true)

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
      disableSignUp: !credentialSignUpEnabled,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      ...(emailCallbacks === undefined
        ? {}
        : {
            requireEmailVerification: true,
            sendResetPassword: (data: AuthEmailCallbackData) =>
              emailCallbacks.sendResetPassword(data),
            resetPasswordTokenExpiresIn:
              testOverrides.resetExpiresInSeconds ??
              PASSWORD_RESET_EXPIRY_SECONDS,
            revokeSessionsOnPasswordReset: true,
            onPasswordReset: (data: { user: { id: string } }) =>
              emailCallbacks.afterPasswordReset(data.user.id),
          }),
    },
    ...(emailCallbacks === undefined
      ? {}
      : {
          emailVerification: {
            sendVerificationEmail: (data: AuthEmailCallbackData) =>
              emailCallbacks.sendVerificationEmail(data),
            sendOnSignUp: true,
            sendOnSignIn: false,
            autoSignInAfterVerification: false,
            expiresIn:
              testOverrides.verificationExpiresInSeconds ??
              EMAIL_VERIFICATION_EXPIRY_SECONDS,
          },
        }),
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
      customRules: {
        '/sign-up/email': {
          window: SIGN_UP_RATE_LIMIT_WINDOW_SECONDS,
          max: SIGN_UP_RATE_LIMIT_MAX_REQUESTS,
        },
      },
    },
    plugins: [
      haveIBeenPwned({
        paths: ['/sign-up/email', '/reset-password'],
      }),
    ],
    advanced: {
      disableOriginCheck: false,
      database: {
        generateId: 'uuid',
      },
      ...(dependencies.backgroundTaskHandler === undefined
        ? {}
        : {
            backgroundTasks: {
              handler: dependencies.backgroundTaskHandler,
            },
          }),
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
  dependencies: CreateAuthDependencies = {},
  configuration: CreateAuthConfiguration = {},
  testOverrides: CreateAuthTestOverrides = {},
) {
  return betterAuth(
    createAuthOptions(
      database,
      environment,
      dependencies,
      configuration,
      testOverrides,
    ),
  )
}
