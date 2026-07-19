import 'server-only'

import { z } from 'zod'

type Environment = Readonly<Record<string, unknown>>

export type EmailEnvironment = Readonly<{
  resendApiKey: string
  fromAddress: string
  replyToAddress: string
}>

const resendApiKeySchema = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: 'custom',
      message: 'RESEND_API_KEY cannot contain surrounding whitespace',
    })

    return
  }

  if (!value.startsWith('re_') || value.length <= 3) {
    context.addIssue({
      code: 'custom',
      message: 'RESEND_API_KEY must use the Resend re_ key format',
    })
  }
})

function bareMailboxSchema(variableName: string) {
  return z.string().superRefine((value, context) => {
    if (value.trim() !== value) {
      context.addIssue({
        code: 'custom',
        message: `${variableName} cannot contain surrounding whitespace`,
      })

      return
    }

    const hasControlCharacter = Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0)

      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
    })

    if (hasControlCharacter) {
      context.addIssue({
        code: 'custom',
        message: `${variableName} must be a bare email address`,
      })

      return
    }

    if (/[<>,]/u.test(value) || !z.email().safeParse(value).success) {
      context.addIssue({
        code: 'custom',
        message: `${variableName} must be a bare email address`,
      })
    }
  })
}

const emailEnvironmentSchema = z.strictObject({
  RESEND_API_KEY: resendApiKeySchema,
  AUTH_EMAIL_FROM: bareMailboxSchema('AUTH_EMAIL_FROM'),
  AUTH_EMAIL_REPLY_TO: bareMailboxSchema('AUTH_EMAIL_REPLY_TO'),
})

const variableNames = [
  'RESEND_API_KEY',
  'AUTH_EMAIL_FROM',
  'AUTH_EMAIL_REPLY_TO',
] as const

export function readEmailEnvironment(
  environment: Environment = process.env,
): EmailEnvironment {
  const values = {
    RESEND_API_KEY: environment.RESEND_API_KEY,
    AUTH_EMAIL_FROM: environment.AUTH_EMAIL_FROM,
    AUTH_EMAIL_REPLY_TO: environment.AUTH_EMAIL_REPLY_TO,
  }
  const result = emailEnvironmentSchema.safeParse(values)

  if (!result.success) {
    const issue = result.error.issues[0]
    const variableName = issue?.path[0]

    if (
      typeof variableName === 'string' &&
      variableNames.includes(variableName as (typeof variableNames)[number])
    ) {
      if (typeof environment[variableName] !== 'string') {
        throw new Error(`${variableName} must be a string`)
      }

      throw new Error(issue.message)
    }

    throw new Error('RESEND_API_KEY must be a string')
  }

  return {
    resendApiKey: result.data.RESEND_API_KEY,
    fromAddress: result.data.AUTH_EMAIL_FROM,
    replyToAddress: result.data.AUTH_EMAIL_REPLY_TO,
  }
}
