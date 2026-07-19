import 'dotenv/config'

import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'
import { z } from 'zod'
import { readEmailEnvironment } from '@/config/email-environment'
import {
  renderEmailVerificationMessage,
  renderPasswordResetMessage,
} from '@/server/email/auth-email-templates'
import { createResendEmailDelivery } from '@/server/email/resend-email-delivery'

const CONFIRMATION_FLAG = '--confirm-live-send'
const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
])

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readSmokeRecipient(): string {
  const value = process.env.AUTH_EMAIL_SMOKE_TO

  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    /[<>,]/u.test(value) ||
    !z.email().safeParse(value).success
  ) {
    fail(
      'AUTH_EMAIL_SMOKE_TO must be a developer-controlled bare email address',
    )
  }

  return value
}

function readSmokeOrigin(): string {
  const value = process.env.BETTER_AUTH_URL

  if (typeof value !== 'string') {
    fail('BETTER_AUTH_URL must be configured for the live smoke')
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    fail('BETTER_AUTH_URL must be a valid HTTPS origin for the live smoke')
  }

  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    PLACEHOLDER_DOMAINS.has(url.hostname) ||
    url.hostname.endsWith('.example.com')
  ) {
    fail(
      'BETTER_AUTH_URL must be a non-placeholder HTTPS origin for the live smoke',
    )
  }

  return url.origin
}

function assertLiveConfiguration(configuration: {
  resendApiKey: string
  fromAddress: string
  replyToAddress: string
  recipient: string
}): void {
  const addresses = [
    configuration.fromAddress,
    configuration.replyToAddress,
    configuration.recipient,
  ]

  if (
    configuration.resendApiKey.includes('disposable') ||
    configuration.resendApiKey.includes('replace') ||
    addresses.some((address) => {
      const domain = address.split('@').at(-1)?.toLowerCase()

      return (
        domain === undefined ||
        PLACEHOLDER_DOMAINS.has(domain) ||
        domain.endsWith('.example.com')
      )
    })
  ) {
    fail('Live smoke refused placeholder or disposable configuration')
  }
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv.at(-1) !== CONFIRMATION_FLAG) {
    fail(`Live delivery requires the explicit ${CONFIRMATION_FLAG} flag`)
  }

  const emailEnvironment = readEmailEnvironment()
  const recipient = readSmokeRecipient()
  const origin = readSmokeOrigin()
  assertLiveConfiguration({ ...emailEnvironment, recipient })

  const delivery = createResendEmailDelivery(
    new Resend(emailEnvironment.resendApiKey),
    {
      fromAddress: emailEnvironment.fromAddress,
      replyToAddress: emailEnvironment.replyToAddress,
    },
  )
  const smokeNonce = randomBytes(32).toString('hex')
  const messages = [
    {
      kind: 'verification',
      message: {
        to: recipient,
        ...renderEmailVerificationMessage({
          url: `${origin}/email-smoke/verification`,
          token: `verification-${smokeNonce}`,
        }),
      },
    },
    {
      kind: 'recovery',
      message: {
        to: recipient,
        ...renderPasswordResetMessage({
          url: `${origin}/email-smoke/recovery`,
          token: `recovery-${smokeNonce}`,
        }),
      },
    },
  ] as const

  const results = await Promise.allSettled(
    messages.map(({ message }) => delivery.send(message)),
  )

  results.forEach((result, index) => {
    const kind = messages[index]?.kind ?? 'unknown'
    console.log(
      `${kind}: ${result.status === 'fulfilled' ? 'accepted' : 'failed'}`,
    )
  })

  if (results.some((result) => result.status === 'rejected')) {
    process.exitCode = 1
  }
}

await main()
