import assert from 'node:assert/strict'
import test from 'node:test'
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
