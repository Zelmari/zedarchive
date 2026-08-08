import { headers } from 'next/headers'
import { CurrentPageLink } from '@/components/current-page-link'
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
      <div className="za-container za-container--wide za-site-header__inner">
        <CurrentPageLink
          className="za-wordmark za-link za-site-header__brand"
          href="/"
        >
          <span aria-hidden="true" className="za-wordmark__monogram">
            z
          </span>
          <span>{productName}</span>
        </CurrentPageLink>
        {signedInUsername ? (
          <nav aria-label="Primary" className="za-site-header__nav">
            <CurrentPageLink
              className={primaryArchiveLinkClassName}
              href="/archive/anime"
            >
              My anime
            </CurrentPageLink>
          </nav>
        ) : null}
        <nav aria-label="Account" className="za-site-header__nav">
          {restricted ? (
            <>
              <CurrentPageLink
                className={linkClassName}
                href="/account/deletion"
              >
                Account deletion
              </CurrentPageLink>
              <SignOutButton />
            </>
          ) : signedInUsername ? (
            <>
              <span className="za-site-header__identity">
                <PublicUsername username={signedInUsername} />
              </span>
              <CurrentPageLink className={linkClassName} href="/settings">
                Settings
              </CurrentPageLink>
              <SignOutButton />
            </>
          ) : (
            <>
              <CurrentPageLink className={linkClassName} href="/sign-in">
                Sign in
              </CurrentPageLink>
              <CurrentPageLink className={linkClassName} href="/register">
                Register
              </CurrentPageLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
