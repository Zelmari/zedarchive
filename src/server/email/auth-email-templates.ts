import { createHash } from 'node:crypto'
import { productName } from '@/config/product-identity'
import type {
  AuthEmailCategory,
  TransactionalEmailContent,
} from '@/server/email/email-delivery'

type AuthEmailTemplateInput = Readonly<{
  url: string
  token: string
}>

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createAuthEmailIdempotencyKey(
  category: AuthEmailCategory,
  token: string,
): string {
  const tokenHash = createHash('sha256').update(token).digest('hex')

  return `auth-email/${category}/${tokenHash}`
}

export function renderEmailVerificationMessage({
  url,
  token,
}: AuthEmailTemplateInput): TransactionalEmailContent {
  const escapedUrl = escapeHtml(url)

  return {
    category: 'email_verification',
    subject: `Verify your email for ${productName}`,
    text: [
      'Verify your email',
      '',
      `Verify this email address to finish creating your ${productName} account.`,
      '',
      url,
      '',
      'This link expires in 24 hours.',
      `If you did not create a ${productName} account, you can ignore this email.`,
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Verify your email</h1>',
      `<p>Verify this email address to finish creating your ${productName} account.</p>`,
      `<p><a href="${escapedUrl}">Verify email</a></p>`,
      '<p>If the link does not open, copy this address into your browser:</p>',
      `<p>${escapedUrl}</p>`,
      '<p>This link expires in 24 hours.</p>',
      `<p>If you did not create a ${productName} account, you can ignore this email.</p>`,
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey('email_verification', token),
  }
}

export function renderPasswordResetMessage({
  url,
  token,
}: AuthEmailTemplateInput): TransactionalEmailContent {
  const escapedUrl = escapeHtml(url)

  return {
    category: 'password_reset',
    subject: `Reset your ${productName} password`,
    text: [
      'Reset your password',
      '',
      `A password reset was requested for a ${productName} account.`,
      '',
      url,
      '',
      'This link expires in one hour.',
      'Your password remains unchanged unless you complete the reset.',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Reset your password</h1>',
      `<p>A password reset was requested for a ${productName} account.</p>`,
      `<p><a href="${escapedUrl}">Reset password</a></p>`,
      '<p>If the link does not open, copy this address into your browser:</p>',
      `<p>${escapedUrl}</p>`,
      '<p>This link expires in one hour.</p>',
      '<p>Your password remains unchanged unless you complete the reset.</p>',
      '<p>If you did not request this, you can ignore this email.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey('password_reset', token),
  }
}
