'use client'

import { forwardRef, type HTMLAttributes } from 'react'

type AuthFormStatusProps = HTMLAttributes<HTMLParagraphElement> & {
  message: string
  tone?: 'error' | 'success' | 'info'
}

export const AuthFormStatus = forwardRef<
  HTMLParagraphElement,
  AuthFormStatusProps
>(function AuthFormStatus(
  { className, message, tone = 'error', ...props },
  ref,
) {
  const isError = tone === 'error'
  const toneClassName =
    tone === 'error'
      ? 'za-notice za-notice--error'
      : tone === 'success'
        ? 'za-notice za-notice--success'
        : 'za-notice za-notice--information'

  return (
    <p
      {...props}
      aria-live={isError ? undefined : 'polite'}
      className={[toneClassName, className].filter(Boolean).join(' ')}
      ref={ref}
      role={isError ? 'alert' : 'status'}
      tabIndex={-1}
    >
      {message}
    </p>
  )
})
