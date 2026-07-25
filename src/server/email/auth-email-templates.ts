import { createHash } from 'node:crypto'
import { productName } from '@/config/product-identity'
import { formatAccountDeletionDeadlineUtc } from '@/features/account-deletion/domain/account-deletion'
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

export function renderUsernameChangeCodeMessage({
  challengeId,
  code,
}: Readonly<{
  challengeId: string
  code: string
}>): TransactionalEmailContent {
  return {
    category: 'username_change',
    subject: `Your ${productName} username change code`,
    text: [
      'Confirm your username change',
      '',
      `A username change was requested for your ${productName} account.`,
      '',
      `Verification code: ${code}`,
      '',
      'This code expires in 10 minutes. If you requested another code, only the newest code works.',
      `If you did not request this, you can ignore this email.`,
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Confirm your username change</h1>',
      `<p>A username change was requested for your ${productName} account.</p>`,
      `<p>Your verification code: <strong>${escapeHtml(code)}</strong></p>`,
      '<p>This code expires in 10 minutes. If you requested another code, only the newest code works.</p>',
      '<p>If you did not request this, you can ignore this email.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey(
      'username_change',
      challengeId,
    ),
  }
}

export function renderAccountDeletionCodeMessage({
  challengeId,
  code,
}: Readonly<{
  challengeId: string
  code: string
}>): TransactionalEmailContent {
  return {
    category: 'account_deletion_code',
    subject: `Your ${productName} account deletion code`,
    text: [
      'Confirm account deletion',
      '',
      `An account deletion request was started for your ${productName} account.`,
      '',
      `Verification code: ${code}`,
      '',
      'This code expires in 10 minutes. If you requested another code, only the newest code works.',
      '',
      'Your account will not be restricted unless the code is entered and the request is confirmed.',
      '',
      'If you did not request this, reset your password.',
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Confirm account deletion</h1>',
      `<p>An account deletion request was started for your ${productName} account.</p>`,
      `<p>Verification code: <strong>${escapeHtml(code)}</strong></p>`,
      '<p>This code expires in 10 minutes. If you requested another code, only the newest code works.</p>',
      '<p>Your account will not be restricted unless the code is entered and the request is confirmed.</p>',
      '<p>If you did not request this, reset your password.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey(
      'account_deletion_code',
      challengeId,
    ),
  }
}

export function renderAccountDeletionRequestedMessage({
  recipient,
  purgeAfter,
}: Readonly<{
  recipient: string
  purgeAfter: Date
}>): TransactionalEmailContent {
  const deadline = formatAccountDeletionDeadlineUtc(purgeAfter)

  return {
    category: 'account_deletion_requested',
    subject: `Deletion requested for your ${productName} account`,
    text: [
      'Account deletion requested',
      '',
      `Your ${productName} account is now restricted.`,
      '',
      `Recovery ends on ${deadline}. You can cancel before this time by signing in and opening Account deletion.`,
      '',
      'After recovery ends, cancellation is unavailable and your live account and archive will be permanently deleted. Encrypted backups may retain copies until they expire.',
      '',
      'If you did not request this, sign in and cancel the request, then reset your password.',
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Account deletion requested</h1>',
      `<p>Your ${productName} account is now restricted.</p>`,
      `<p>Recovery ends on ${escapeHtml(deadline)}. You can cancel before this time by signing in and opening Account deletion.</p>`,
      '<p>After recovery ends, cancellation is unavailable and your live account and archive will be permanently deleted. Encrypted backups may retain copies until they expire.</p>',
      '<p>If you did not request this, sign in and cancel the request, then reset your password.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey(
      'account_deletion_requested',
      JSON.stringify([recipient, purgeAfter.toISOString()]),
    ),
  }
}

export function renderAccountDeletionCancelledMessage({
  recipient,
  purgeAfter,
}: Readonly<{
  recipient: string
  purgeAfter: Date
}>): TransactionalEmailContent {
  return {
    category: 'account_deletion_cancelled',
    subject: `Deletion cancelled for your ${productName} account`,
    text: [
      'Account deletion cancelled',
      '',
      `The deletion request for your ${productName} account was cancelled. Your account and archive are available again.`,
      '',
      'If you did not cancel this request, reset your password.',
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html lang="en">',
      '<body>',
      '<main>',
      '<h1>Account deletion cancelled</h1>',
      `<p>The deletion request for your ${productName} account was cancelled. Your account and archive are available again.</p>`,
      '<p>If you did not cancel this request, reset your password.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join(''),
    idempotencyKey: createAuthEmailIdempotencyKey(
      'account_deletion_cancelled',
      JSON.stringify([recipient, purgeAfter.toISOString()]),
    ),
  }
}
