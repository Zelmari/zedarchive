import { headers } from 'next/headers'
import Link from 'next/link'
import { productName } from '@/config/product-identity'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { PublicUsername } from '@/features/identity/components/public-username'
import { auth } from '@/server/auth/auth'

const linkClassName =
  'rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

export async function SiteHeader() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null

  try {
    session = await auth.api.getSession({
      headers: await headers(),
    })
  } catch {
    console.error('Site header session lookup failed.')
  }

  const signedInUsername = session?.user?.name

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
          {signedInUsername ? (
            <>
              <span className="min-w-0 break-all">
                <PublicUsername username={signedInUsername} />
              </span>
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
