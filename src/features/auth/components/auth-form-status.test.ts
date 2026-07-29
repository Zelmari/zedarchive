import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'

describe('AuthFormStatus', () => {
  it('keeps error and non-error semantics while applying the shared notice roles', () => {
    const errorMarkup = renderToStaticMarkup(
      createElement(AuthFormStatus, { message: 'Try again.' }),
    )
    const successMarkup = renderToStaticMarkup(
      createElement(AuthFormStatus, {
        message: 'Your email is verified.',
        tone: 'success',
      }),
    )

    expect(errorMarkup).toContain('class="za-notice za-notice--error"')
    expect(errorMarkup).toContain('role="alert"')
    expect(successMarkup).toContain('class="za-notice za-notice--success"')
    expect(successMarkup).toContain('aria-live="polite"')
    expect(successMarkup).toContain('role="status"')
  })
})
