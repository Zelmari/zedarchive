import { describe, expect, it } from 'vitest'
import {
  accountDeletionConfirmationValue,
  formatAccountDeletionDeadlineUtc,
  parseCompleteAccountDeletionFormData,
  parseEmptyAccountDeletionFormData,
  parseStartAccountDeletionFormData,
} from '@/features/account-deletion/domain/account-deletion'

describe('account deletion form validation', () => {
  it('accepts exactly one non-empty current password', () => {
    const formData = new FormData()
    formData.set('password', 'current password')

    expect(parseStartAccountDeletionFormData(formData)).toEqual({
      kind: 'valid',
      password: 'current password',
    })
  })

  it('rejects client-owned identity fields before sensitive work', () => {
    const formData = new FormData()
    formData.set('password', 'current password')
    formData.set('userId', 'forged')

    expect(parseStartAccountDeletionFormData(formData)).toEqual({
      kind: 'invalid_password',
    })
  })

  it('requires one exact eight-digit code and the approved confirmation', () => {
    const formData = new FormData()
    formData.set('code', '00000001')
    formData.set('confirmation', accountDeletionConfirmationValue)

    expect(parseCompleteAccountDeletionFormData(formData)).toEqual({
      kind: 'valid',
      code: '00000001',
    })

    formData.set('code', '1234567')
    expect(parseCompleteAccountDeletionFormData(formData)).toEqual({
      kind: 'invalid_code',
    })

    formData.set('code', '00000001')
    formData.delete('confirmation')
    expect(parseCompleteAccountDeletionFormData(formData)).toEqual({
      kind: 'confirmation_required',
    })
  })

  it('accepts only empty resend, setup cancellation, and cancellation forms', () => {
    expect(parseEmptyAccountDeletionFormData(new FormData())).toBe(true)

    const forged = new FormData()
    forged.set('requestId', 'forged')
    expect(parseEmptyAccountDeletionFormData(forged)).toBe(false)
  })
})

describe('formatAccountDeletionDeadlineUtc', () => {
  it('renders a deterministic fixed-UTC deadline', () => {
    expect(
      formatAccountDeletionDeadlineUtc(new Date('2026-08-25T14:30:00.000Z')),
    ).toBe('25 August 2026 at 14:30 UTC')
  })
})
