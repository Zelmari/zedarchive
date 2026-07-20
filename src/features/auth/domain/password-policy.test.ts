import { describe, expect, it } from 'vitest'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'

describe('password policy constants', () => {
  it('uses the approved password length boundaries', () => {
    expect(passwordMinimumLength).toBe(7)
    expect(passwordMaximumLength).toBe(128)
  })
})
