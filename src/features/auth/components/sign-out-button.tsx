'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import {
  AuthNoScriptNotice,
  useAuthHydrated,
} from '@/features/auth/components/auth-hydration'
import { translateAuthError } from '@/features/auth/domain/auth-error-messages'

const buttonClassName = 'za-button za-button--secondary'

export function SignOutButton() {
  const router = useRouter()
  const hasHydrated = useAuthHydrated()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (errorMessage !== null) {
      statusRef.current?.focus()
    }
  }, [errorMessage])

  async function handleSignOut() {
    if (isPending) {
      return
    }

    setIsPending(true)
    setErrorMessage(null)

    const { error } = await authClient.signOut()

    if (error) {
      const translated = translateAuthError(getAuthClientErrorInput(error))
      setErrorMessage(translated.message)
      setIsPending(false)
      return
    }

    router.refresh()
    setIsPending(false)
  }

  return (
    <div className="space-y-3">
      <button
        aria-busy={isPending}
        className={buttonClassName}
        disabled={!hasHydrated || isPending}
        onClick={() => void handleSignOut()}
        type="button"
      >
        {isPending ? 'Signing out…' : 'Sign out'}
      </button>
      {errorMessage ? (
        <AuthFormStatus message={errorMessage} ref={statusRef} />
      ) : null}
      <AuthNoScriptNotice>
        JavaScript is required to sign out. Enable JavaScript and try again.
      </AuthNoScriptNotice>
    </div>
  )
}
