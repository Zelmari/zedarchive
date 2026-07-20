import { z } from 'zod'
import {
  passwordMaximumLength,
  passwordMinimumLength,
} from '@/features/auth/domain/password-policy'
import { usernameSchema } from '@/features/identity/domain/username'

const trimmedStringSchema = z.string().transform((value) => value.trim())

export const authEmailSchema = trimmedStringSchema.pipe(z.email())

export const authUsernameSchema = trimmedStringSchema.pipe(usernameSchema)

export const authPasswordSchema = z
  .string()
  .min(passwordMinimumLength)
  .max(passwordMaximumLength)

export const registrationFormSchema = z.object({
  username: authUsernameSchema,
  email: authEmailSchema,
  password: authPasswordSchema,
})

export const signInFormSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
})

export const forgotPasswordFormSchema = z.object({
  email: authEmailSchema,
})

export const resetPasswordFormSchema = z.object({
  password: authPasswordSchema,
})

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>
export type SignInFormValues = z.infer<typeof signInFormSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>
