export type BetterAuthProviderAccessPolicy =
  'pending_allowed' | 'deny_pending' | 'active_only' | 'globally_denied'

export type BetterAuthProviderOperationSnapshot = Readonly<{
  apiKey: string
  operationId: string
  path: string | undefined
  entries: readonly Readonly<{
    method: string
    policy: BetterAuthProviderAccessPolicy
  }>[]
}>

export const BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT = [
  {
    apiKey: 'signInSocial',
    operationId: 'socialSignIn',
    path: '/sign-in/social',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'callbackOAuth',
    operationId: 'handleOAuthCallback',
    path: '/callback/:id',
    entries: [
      { method: 'GET', policy: 'globally_denied' },
      { method: 'POST', policy: 'globally_denied' },
    ],
  },
  {
    apiKey: 'getSession',
    operationId: 'getSession',
    path: '/get-session',
    entries: [
      { method: 'GET', policy: 'pending_allowed' },
      { method: 'POST', policy: 'globally_denied' },
    ],
  },
  {
    apiKey: 'signOut',
    operationId: 'signOut',
    path: '/sign-out',
    entries: [{ method: 'POST', policy: 'pending_allowed' }],
  },
  {
    apiKey: 'signUpEmail',
    operationId: 'signUpWithEmailAndPassword',
    path: '/sign-up/email',
    entries: [{ method: 'POST', policy: 'deny_pending' }],
  },
  {
    apiKey: 'signInEmail',
    operationId: 'signInEmail',
    path: '/sign-in/email',
    entries: [{ method: 'POST', policy: 'pending_allowed' }],
  },
  {
    apiKey: 'resetPassword',
    operationId: 'resetPassword',
    path: '/reset-password',
    entries: [{ method: 'POST', policy: 'pending_allowed' }],
  },
  {
    apiKey: 'verifyPassword',
    operationId: 'verifyPassword',
    path: '/verify-password',
    entries: [{ method: 'POST', policy: 'active_only' }],
  },
  {
    apiKey: 'verifyEmail',
    operationId: 'verifyEmail',
    path: '/verify-email',
    entries: [{ method: 'GET', policy: 'deny_pending' }],
  },
  {
    apiKey: 'sendVerificationEmail',
    operationId: 'sendVerificationEmail',
    path: '/send-verification-email',
    entries: [{ method: 'POST', policy: 'deny_pending' }],
  },
  {
    apiKey: 'changeEmail',
    operationId: 'changeEmail',
    path: '/change-email',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'changePassword',
    operationId: 'changePassword',
    path: '/change-password',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'setPassword',
    operationId: 'setPassword',
    path: undefined,
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'updateSession',
    operationId: 'updateSession',
    path: '/update-session',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'updateUser',
    operationId: 'updateUser',
    path: '/update-user',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'deleteUser',
    operationId: 'deleteUser',
    path: '/delete-user',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'requestPasswordReset',
    operationId: 'requestPasswordReset',
    path: '/request-password-reset',
    entries: [{ method: 'POST', policy: 'pending_allowed' }],
  },
  {
    apiKey: 'requestPasswordResetCallback',
    operationId: 'resetPasswordCallback',
    path: '/reset-password/:token',
    entries: [{ method: 'GET', policy: 'pending_allowed' }],
  },
  {
    apiKey: 'listSessions',
    operationId: 'listUserSessions',
    path: '/list-sessions',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
  {
    apiKey: 'revokeSession',
    operationId: 'revokeSession',
    path: '/revoke-session',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'revokeSessions',
    operationId: 'revokeSessions',
    path: '/revoke-sessions',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'revokeOtherSessions',
    operationId: 'revokeOtherSessions',
    path: '/revoke-other-sessions',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'linkSocialAccount',
    operationId: 'linkSocialAccount',
    path: '/link-social',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'listUserAccounts',
    operationId: 'listUserAccounts',
    path: '/list-accounts',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
  {
    apiKey: 'deleteUserCallback',
    operationId: 'deleteUserCallback',
    path: '/delete-user/callback',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
  {
    apiKey: 'unlinkAccount',
    operationId: 'unlinkAccount',
    path: '/unlink-account',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'refreshToken',
    operationId: 'refreshToken',
    path: '/refresh-token',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'getAccessToken',
    operationId: 'getAccessToken',
    path: '/get-access-token',
    entries: [{ method: 'POST', policy: 'globally_denied' }],
  },
  {
    apiKey: 'accountInfo',
    operationId: 'accountInfo',
    path: '/account-info',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
  {
    apiKey: 'ok',
    operationId: 'ok',
    path: '/ok',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
  {
    apiKey: 'error',
    operationId: 'error',
    path: '/error',
    entries: [{ method: 'GET', policy: 'globally_denied' }],
  },
] as const satisfies readonly BetterAuthProviderOperationSnapshot[]

export type BetterAuthProviderOperationContext = Readonly<{
  operationId?: unknown
  path?: string
  method?: string
  requestMethod?: string
}>

export type MatchedBetterAuthProviderOperation = Readonly<{
  operationId: string
  path: string | undefined
  method: string
  policy: BetterAuthProviderAccessPolicy
}>

export function matchBetterAuthProviderOperation(
  context: BetterAuthProviderOperationContext,
): MatchedBetterAuthProviderOperation | null {
  if (typeof context.operationId !== 'string') {
    return null
  }

  const operation = BETTER_AUTH_PROVIDER_OPERATION_SNAPSHOT.find(
    (candidate) => candidate.operationId === context.operationId,
  )

  if (operation === undefined) {
    return null
  }

  if (operation.path !== undefined && context.path !== operation.path) {
    return null
  }

  if (
    context.method !== undefined &&
    context.requestMethod !== undefined &&
    context.method !== context.requestMethod
  ) {
    return null
  }

  const method =
    context.method ?? context.requestMethod ?? operation.entries[0]?.method
  const entry = operation.entries.find(
    (candidate) => candidate.method === method,
  )

  if (entry === undefined) {
    return null
  }

  return {
    operationId: operation.operationId,
    path: operation.path,
    method: entry.method,
    policy: entry.policy,
  }
}
