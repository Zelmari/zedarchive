'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  authClient,
  getAuthClientErrorInput,
} from '@/features/auth/client/auth-client'
import { AuthFormStatus } from '@/features/auth/components/auth-form-status'
import { translateAuthError } from '@/features/auth/domain/auth-error-messages'

const buttonClassName =
  'rounded border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-70'

export function SignOutButton() {
  const router = useRouter()
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
        disabled={isPending}
        onClick={() => void handleSignOut()}
        type="button"
      >
        {isPending ? 'Signing out…' : 'Sign out'}
      </button>
      {errorMessage ? (
        <AuthFormStatus message={errorMessage} ref={statusRef} />
      ) : null}
    </div>
  )
}
