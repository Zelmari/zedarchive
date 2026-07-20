'use client'

import { forwardRef, type HTMLAttributes } from 'react'

type AuthFormStatusProps = HTMLAttributes<HTMLParagraphElement> & {
  message: string
  tone?: 'error' | 'success' | 'info'
}

export const AuthFormStatus = forwardRef<
  HTMLParagraphElement,
  AuthFormStatusProps
>(function AuthFormStatus({ message, tone = 'error', ...props }, ref) {
  const isError = tone === 'error'

  return (
    <p
      {...props}
      aria-live={isError ? undefined : 'polite'}
      ref={ref}
      role={isError ? 'alert' : 'status'}
      tabIndex={-1}
    >
      {message}
    </p>
  )
})
