'use client'

import { createAuthClient } from 'better-auth/react'
import type { AuthErrorInput } from '@/features/auth/domain/auth-error-messages'

export const authClient = createAuthClient()

type AuthClientError = Readonly<{
  status?: number
  code?: string
}>

export function getAuthClientErrorInput(
  error: AuthClientError | null | undefined,
  flow?: AuthErrorInput['flow'],
): AuthErrorInput {
  if (error == null) {
    return {}
  }

  return {
    httpStatus: error.status,
    code: typeof error.code === 'string' ? error.code : undefined,
    flow,
  }
}
