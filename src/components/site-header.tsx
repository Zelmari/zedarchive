import { headers } from 'next/headers'
import Link from 'next/link'
import { productName } from '@/config/product-identity'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { PublicUsername } from '@/features/identity/components/public-username'
import { resolveAccountAccess } from '@/server/auth/auth'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export async function SiteHeader() {
  let access: Awaited<ReturnType<typeof resolveAccountAccess>>

  try {
    access = await resolveAccountAccess(await headers())
  } catch {
    console.error('Site header account-access lookup failed.')
    access = { status: 'unavailable' }
  }

  const signedInUsername =
    access.status === 'active' ? access.session.user.name : undefined
  const restricted =
    access.status === 'deletion_recoverable' ||
    access.status === 'deletion_due' ||
    access.status === 'unavailable'

  return (
    <header className="border-b border-gray-300">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
        <Link className={linkClassName} href="/">
          {productName}
        </Link>
        {signedInUsername ? (
          <nav
            aria-label="Primary"
            className="flex min-w-0 flex-wrap items-center gap-4"
          >
            <Link className={linkClassName} href="/archive/anime">
              My anime
            </Link>
          </nav>
        ) : null}
        <nav
          aria-label="Account"
          className="flex min-w-0 flex-wrap items-center gap-4"
        >
          {restricted ? (
            <>
              <Link className={linkClassName} href="/account/deletion">
                Account deletion
              </Link>
              <SignOutButton />
            </>
          ) : signedInUsername ? (
            <>
              <span className="min-w-0 break-all">
                <PublicUsername username={signedInUsername} />
              </span>
              <Link className={linkClassName} href="/settings">
                Settings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link className={linkClassName} href="/sign-in">
                Sign in
              </Link>
              <Link className={linkClassName} href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
