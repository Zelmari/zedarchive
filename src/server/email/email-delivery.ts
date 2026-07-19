export type AuthEmailCategory = 'email_verification' | 'password_reset'

export type TransactionalEmail = Readonly<{
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
  category: AuthEmailCategory
}>

export type TransactionalEmailContent = Omit<TransactionalEmail, 'to'>

export type AuthEmailDelivery = Readonly<{
  send(message: TransactionalEmail): Promise<void>
}>
