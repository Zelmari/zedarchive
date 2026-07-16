import { z } from 'zod'
import {
  blockedUsernameTerms,
  reservedUsernameTerms,
  usernameRestrictionExceptions,
} from '@/features/identity/domain/username-restrictions'

export const usernameMinimumLength = 3
export const usernameMaximumLength = 20

const usernameCharactersPattern = /^[A-Za-z0-9_-]+$/
const usernameBoundaryPattern = /^[A-Za-z0-9].*[A-Za-z0-9]$/
const adjacentSeparatorsPattern = /[-_]{2}/

const restrictedUsernameTerms: readonly string[] = [
  ...reservedUsernameTerms,
  ...blockedUsernameTerms,
]

const usernameRestrictionExceptionKeys = new Set<string>(
  usernameRestrictionExceptions,
)

export function normalizeUsernameForIdentity(username: string): string {
  return username.toLowerCase()
}

export function normalizeUsernameForRestriction(username: string): string {
  return normalizeUsernameForIdentity(username).replace(/[-_]/g, '')
}

function isUsernameRestricted(username: string): boolean {
  const restrictionKey = normalizeUsernameForRestriction(username)

  if (usernameRestrictionExceptionKeys.has(restrictionKey)) {
    return false
  }

  return restrictedUsernameTerms.some((term) => restrictionKey.includes(term))
}

export const usernameSchema = z
  .string()
  .min(usernameMinimumLength)
  .max(usernameMaximumLength)
  .regex(usernameCharactersPattern)
  .regex(usernameBoundaryPattern)
  .refine((username) => !adjacentSeparatorsPattern.test(username))
  .refine((username) => !isUsernameRestricted(username))

export type Username = z.infer<typeof usernameSchema>
