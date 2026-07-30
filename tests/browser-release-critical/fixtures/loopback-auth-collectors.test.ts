import assert from 'node:assert/strict'
import test from 'node:test'
import type { Locator } from '@playwright/test'
import { LoopbackAuthCollectors } from './loopback-auth-collectors'
import {
  releaseCriticalApplicationOrigin,
  releaseCriticalHibpOrigin,
  releaseCriticalHibpPath,
  releaseCriticalResendOrigin,
} from './release-critical-constants'

const recipient = 'm41-collector@example.test'
const fromAddress = 'noreply@example.test'
const replyToAddress = 'support@example.test'
const tokenMarker = 'opaque-test-marker'
const verificationUrl = `${releaseCriticalApplicationOrigin}/verify-email#token=${tokenMarker}`

function verificationPayload(overrides: Record<string, unknown> = {}) {
  return {
    from: `zedarchive <${fromAddress}>`,
    reply_to: replyToAddress,
    to: recipient,
    subject: 'Verify your email for zedarchive',
    text: `Verify your email\n\n${verificationUrl}\n`,
    html: `<a href="${verificationUrl}">Verify email</a><p>${verificationUrl}</p>`,
    tags: [{ name: 'category', value: 'email_verification' }],
    ...overrides,
  }
}

function collector() {
  return new LoopbackAuthCollectors({
    recipient,
    fromAddress,
    replyToAddress,
  })
}

function lifecycleCollector() {
  return new LoopbackAuthCollectors({
    recipient,
    fromAddress,
    replyToAddress,
    lifecycleRecipients: [recipient],
    lifecycleMessageLimits: {
      password_reset: 1,
      account_deletion_code: 1,
      account_deletion_requested: 1,
      account_deletion_cancelled: 1,
    },
  })
}

function lifecyclePayload(
  category:
    | 'password_reset'
    | 'account_deletion_code'
    | 'account_deletion_requested'
    | 'account_deletion_cancelled',
) {
  const details = {
    password_reset: {
      subject: 'Reset your zedarchive password',
      text: `Reset your password\n${releaseCriticalApplicationOrigin}/api/auth/reset-password/opaque-reset-marker?callbackURL=%2Freset-password%2Fcontinue`,
      html: `<a href="${releaseCriticalApplicationOrigin}/api/auth/reset-password/opaque-reset-marker?callbackURL=%2Freset-password%2Fcontinue">Reset password</a><p>${releaseCriticalApplicationOrigin}/api/auth/reset-password/opaque-reset-marker?callbackURL=%2Freset-password%2Fcontinue</p>`,
    },
    account_deletion_code: {
      subject: 'Your zedarchive account deletion code',
      text: 'Confirm account deletion\nVerification code: 12345678',
      html: '<p>Verification code: <strong>12345678</strong></p>',
    },
    account_deletion_requested: {
      subject: 'Deletion requested for your zedarchive account',
      text: 'Account deletion requested',
      html: '<h1>Account deletion requested</h1>',
    },
    account_deletion_cancelled: {
      subject: 'Deletion cancelled for your zedarchive account',
      text: 'Account deletion cancelled',
      html: '<h1>Account deletion cancelled</h1>',
    },
  } as const

  return {
    from: `zedarchive <${fromAddress}>`,
    reply_to: replyToAddress,
    to: recipient,
    tags: [{ name: 'category', value: category }],
    ...details[category],
  }
}

async function sendLifecycleMessage(
  category:
    | 'password_reset'
    | 'account_deletion_code'
    | 'account_deletion_requested'
    | 'account_deletion_cancelled',
  marker: string,
) {
  return fetch(`${releaseCriticalResendOrigin}/emails`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `auth-email/${category}/${marker.repeat(64)}`,
    },
    body: JSON.stringify(lifecyclePayload(category)),
  })
}

test('accepts one bounded verification message and serves only its opaque link', async () => {
  const target = collector()
  await target.start()
  try {
    const response = await fetch(`${releaseCriticalResendOrigin}/emails`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `auth-email/email_verification/${'a'.repeat(64)}`,
      },
      body: JSON.stringify(verificationPayload()),
    })
    assert.equal(response.status, 200)
    await target.waitForVerificationMessage()
    assert.deepEqual(target.evidence(), {
      hibpRequestCount: 0,
      emailAccepted: true,
      inboxReady: true,
    })

    const inbox = await fetch(target.inboxUrl)
    const inboxBody = await inbox.text()
    assert.equal(inbox.status, 200)
    assert.match(inboxBody, />Verify email<\/a>/u)
    assert.equal(inboxBody.includes('subject'), false)
    assert.equal(inboxBody.includes(recipient), false)
  } finally {
    await target.stop()
  }
})

test('uses fixed errors for malformed provider requests', async () => {
  const target = collector()
  await target.start()
  try {
    for (const payload of [
      verificationPayload({ subject: 'Unexpected' }),
      verificationPayload({ arbitrary: true }),
      verificationPayload({ to: 'different@example.test' }),
      verificationPayload({
        tags: [{ name: 'category', value: 'password_reset' }],
      }),
      verificationPayload({
        text: `Verify\n${releaseCriticalApplicationOrigin}/verify-email?token=${tokenMarker}`,
      }),
      verificationPayload({
        text: `Verify\n${verificationUrl}\n${releaseCriticalApplicationOrigin}/verify-email#token=second`,
      }),
    ]) {
      const response = await fetch(`${releaseCriticalResendOrigin}/emails`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `auth-email/email_verification/${'b'.repeat(64)}`,
        },
        body: JSON.stringify(payload),
      })
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), {
        message: 'M41 collector rejected the request',
      })
    }

    const wrongMethod = await fetch(`${releaseCriticalResendOrigin}/emails`)
    assert.equal(wrongMethod.status, 404)
    assert.equal((await wrongMethod.text()).includes(tokenMarker), false)

    const oversized = await fetch(`${releaseCriticalResendOrigin}/emails`, {
      method: 'POST',
      body: 'x'.repeat(64 * 1024 + 1),
    })
    assert.equal(oversized.status, 400)
    assert.deepEqual(await oversized.json(), {
      message: 'M41 collector rejected the request',
    })

    assert.deepEqual(target.evidence(), {
      hibpRequestCount: 0,
      emailAccepted: false,
      inboxReady: false,
    })
  } finally {
    await target.stop()
  }
})

test('accepts only the fixed HIBP collector request', async () => {
  const target = collector()
  await target.start()
  try {
    const accepted = await fetch(
      `${releaseCriticalHibpOrigin}${releaseCriticalHibpPath}`,
    )
    assert.equal(accepted.status, 200)
    assert.equal(await accepted.text(), '')

    const rejected = await fetch(
      `${releaseCriticalHibpOrigin}${releaseCriticalHibpPath}?prefix=ABCDE`,
    )
    assert.equal(rejected.status, 404)
    assert.deepEqual(target.evidence(), {
      hibpRequestCount: 1,
      emailAccepted: false,
      inboxReady: false,
    })
  } finally {
    await target.stop()
  }
})

test('accepts the configured lifecycle sequence while keeping reset and deletion credentials opaque', async () => {
  const target = lifecycleCollector()
  await target.start()
  try {
    assert.equal(
      (await sendLifecycleMessage('password_reset', 'c')).status,
      200,
    )
    await target.waitForLifecycleMessage('password_reset', 1)
    const inbox = await fetch(target.inboxUrl)
    const inboxBody = await inbox.text()
    assert.equal(inbox.status, 200)
    assert.match(inboxBody, />Reset password<\/a>/u)
    assert.equal(inboxBody.includes(recipient), false)

    assert.equal(
      (await sendLifecycleMessage('account_deletion_code', 'd')).status,
      200,
    )
    await target.waitForLifecycleMessage('account_deletion_code', 1)
    let fillCount = 0
    await target.fillDeletionCodeOnce({
      async fill() {
        fillCount += 1
      },
    } as unknown as Locator)
    assert.equal(fillCount, 1)
    await assert.rejects(
      target.fillDeletionCodeOnce({
        async fill() {
          fillCount += 1
        },
      } as unknown as Locator),
      new TypeError('M42 deletion code is unavailable'),
    )

    assert.equal(
      (await sendLifecycleMessage('account_deletion_requested', 'e')).status,
      200,
    )
    assert.equal(
      (await sendLifecycleMessage('account_deletion_cancelled', 'f')).status,
      200,
    )
    await target.waitForLifecycleMessage('account_deletion_requested', 1)
    await target.waitForLifecycleMessage('account_deletion_cancelled', 1)
    assert.deepEqual(target.lifecycleEvidence(), {
      deletionCancellationCount: 1,
      deletionCodeCount: 1,
      deletionRequestCount: 1,
      passwordResetCount: 1,
      resetInboxReady: false,
      deletionCodeReady: false,
    })
  } finally {
    await target.stop()
  }

  assert.deepEqual(target.lifecycleEvidence(), {
    deletionCancellationCount: 0,
    deletionCodeCount: 0,
    deletionRequestCount: 0,
    passwordResetCount: 0,
    resetInboxReady: false,
    deletionCodeReady: false,
  })
})

test('rejects unexpected lifecycle recipients, duplicate messages, and excess counts with fixed errors', async () => {
  const target = lifecycleCollector()
  await target.start()
  try {
    const wrongRecipient = await fetch(
      `${releaseCriticalResendOrigin}/emails`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `auth-email/password_reset/${'a'.repeat(64)}`,
        },
        body: JSON.stringify({
          ...lifecyclePayload('password_reset'),
          to: 'unexpected@example.test',
        }),
      },
    )
    assert.equal(wrongRecipient.status, 400)
    assert.deepEqual(await wrongRecipient.json(), {
      message: 'M41 collector rejected the request',
    })

    const accepted = await sendLifecycleMessage('password_reset', 'b')
    assert.equal(accepted.status, 200)
    const duplicate = await sendLifecycleMessage('password_reset', 'b')
    assert.equal(duplicate.status, 400)
    assert.deepEqual(await duplicate.json(), {
      message: 'M41 collector rejected the request',
    })
    const excess = await sendLifecycleMessage('password_reset', 'c')
    assert.equal(excess.status, 400)
    assert.deepEqual(await excess.json(), {
      message: 'M41 collector rejected the request',
    })
  } finally {
    await target.stop()
  }
})
