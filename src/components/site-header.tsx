import { headers } from 'next/headers'
import Link from 'next/link'
import { productName } from '@/config/product-identity'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { PublicUsername } from '@/features/identity/components/public-username'
import { resolveAccountAccess } from '@/server/auth/auth'

const linkClassName = 'za-link'
const primaryArchiveLinkClassName = 'za-button za-button--secondary'

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
    <header className="za-site-header">
      <div className="za-container za-container--wide flex flex-wrap items-center justify-between gap-4 py-4 sm:py-6">
        <Link className="za-wordmark za-link" href="/">
          {productName}
        </Link>
        {signedInUsername ? (
          <nav
            aria-label="Primary"
            className="flex min-w-0 flex-wrap items-center gap-4"
          >
            <Link className={primaryArchiveLinkClassName} href="/archive/anime">
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
