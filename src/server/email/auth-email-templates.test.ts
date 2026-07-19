import { describe, expect, it } from 'vitest'
import {
  createAuthEmailIdempotencyKey,
  renderEmailVerificationMessage,
  renderPasswordResetMessage,
} from '@/server/email/auth-email-templates'

const verificationUrl =
  'https://archive.example.com/api/auth/verify-email?token=verification-token&callbackURL=%2F'
const resetUrl =
  'https://archive.example.com/api/auth/reset-password/reset-token?callbackURL=%2Freset-password'

describe('authentication email templates', () => {
  it('renders the approved verification meaning in text and minimal HTML', () => {
    const message = renderEmailVerificationMessage({
      url: verificationUrl,
      token: 'verification-token',
    })

    expect(message.subject).toBe('Verify your email for zedarchive')
    expect(message.category).toBe('email_verification')
    expect(message.text).toContain(verificationUrl)
    expect(message.text).toContain('expires in 24 hours')
    expect(message.text).toContain('did not create a zedarchive account')
    expect(message.html).toContain('>Verify email</a>')
    expect(message.html).toContain('expires in 24 hours')
    expect(message.html).not.toMatch(/<(?:img|script|style|link)\b/iu)
  })

  it('renders the approved recovery meaning in text and minimal HTML', () => {
    const message = renderPasswordResetMessage({
      url: resetUrl,
      token: 'reset-token',
    })

    expect(message.subject).toBe('Reset your zedarchive password')
    expect(message.category).toBe('password_reset')
    expect(message.text).toContain(resetUrl)
    expect(message.text).toContain('expires in one hour')
    expect(message.text).toContain('password remains unchanged')
    expect(message.text).toContain('did not request this')
    expect(message.html).toContain('>Reset password</a>')
    expect(message.html).not.toMatch(/<(?:img|script|style|link)\b/iu)
  })

  it('does not introduce recipient or account metadata', () => {
    const serialized = JSON.stringify(
      renderEmailVerificationMessage({
        url: verificationUrl,
        token: 'verification-token',
      }),
    )

    expect(serialized).not.toContain('MediaFan')
    expect(serialized).not.toContain('fan@example.com')
    expect(serialized).not.toContain('user-id')
    expect(serialized).not.toContain('tracking')
  })

  it('escapes action URLs in HTML text and attribute contexts', () => {
    const unsafeUrl =
      'https://archive.example.com/verify?next="/><script>alert(1)</script>&label=日本語'
    const message = renderEmailVerificationMessage({
      url: unsafeUrl,
      token: 'safe-token',
    })

    expect(message.text).toContain(unsafeUrl)
    expect(message.html).toContain('&quot;/&gt;&lt;script&gt;')
    expect(message.html).toContain('&amp;label=日本語')
    expect(message.html).not.toContain('<script>')
  })

  it('derives stable, flow-specific keys without retaining the raw token', () => {
    const token = 'private-action-token'
    const first = createAuthEmailIdempotencyKey('email_verification', token)
    const second = createAuthEmailIdempotencyKey('email_verification', token)
    const otherFlow = createAuthEmailIdempotencyKey('password_reset', token)
    const otherToken = createAuthEmailIdempotencyKey(
      'email_verification',
      `${token}-other`,
    )

    expect(first).toBe(second)
    expect(first).toMatch(/^auth-email\/email_verification\/[a-f0-9]{64}$/u)
    expect(first).not.toContain(token)
    expect(otherFlow).not.toBe(first)
    expect(otherToken).not.toBe(first)
  })

  it('renders deterministically for the same inputs', () => {
    const input = { url: resetUrl, token: 'reset-token' }

    expect(renderPasswordResetMessage(input)).toEqual(
      renderPasswordResetMessage(input),
    )
  })
})
