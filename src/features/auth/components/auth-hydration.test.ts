import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/features/auth/client/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  getAuthClientErrorInput: vi.fn(),
}))

import { AuthNoScriptNotice } from '@/features/auth/components/auth-hydration'
import { SignOutButton } from '@/features/auth/components/sign-out-button'

describe('client-auth hydration safety', () => {
  it('renders the approved sign-out notice and disabled mutation before hydration', () => {
    const markup = renderToStaticMarkup(createElement(SignOutButton))

    expect(markup).toContain('disabled=""')
    expect(markup).toContain(
      '<noscript><p class="za-notice za-notice--information">JavaScript is required to sign out. Enable JavaScript and try again.</p></noscript>',
    )
  })

  it('keeps no-JavaScript information in the shared neutral notice treatment', () => {
    const markup = renderToStaticMarkup(
      createElement(
        AuthNoScriptNotice,
        null,
        'JavaScript is required to sign in. Enable JavaScript and try again.',
      ),
    )

    expect(markup).toBe(
      '<noscript><p class="za-notice za-notice--information">JavaScript is required to sign in. Enable JavaScript and try again.</p></noscript>',
    )
  })
})
