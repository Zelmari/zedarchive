import { describe, expect, it } from 'vitest'
import {
  parseCompleteUsernameChangeFormData,
  parseStartUsernameChangeFormData,
} from '@/features/settings/domain/username-change'

describe('username change form parsing', () => {
  it('accepts only the start fields and leaves username policy to the server service', () => {
    const formData = new FormData()
    formData.set('username', '  NewName  ')
    formData.set('password', 'current password')

    expect(parseStartUsernameChangeFormData(formData)).toEqual({
      kind: 'valid',
      username: '  NewName  ',
      password: 'current password',
    })
  })

  it('rejects malformed start commands before server work', () => {
    const formData = new FormData()
    formData.set('username', 'NewName')
    formData.set('password', '')
    formData.set('userId', 'forged')

    expect(parseStartUsernameChangeFormData(formData)).toEqual({
      kind: 'invalid_username',
    })
  })

  it('preserves an eight-digit leading-zero code and requires exact confirmation', () => {
    const formData = new FormData()
    formData.set('code', '00000001')
    formData.set('confirmation', 'one-time-username-change')

    expect(parseCompleteUsernameChangeFormData(formData)).toEqual({
      kind: 'valid',
      code: '00000001',
    })
  })

  it('reports missing confirmation before code validation', () => {
    const formData = new FormData()
    formData.set('code', 'invalid')
    formData.set('confirmation', 'not-confirmed')

    expect(parseCompleteUsernameChangeFormData(formData)).toEqual({
      kind: 'confirmation_required',
    })
  })
})
