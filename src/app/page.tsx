import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

async function isAuthenticated() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const signedIn = await isAuthenticated();

  const accountNav = signedIn ? (
    <nav aria-label="Account" className="za-site-header__nav">
      <Link className="za-button za-button--primary" href="/dashboard">
        Open your archive
      </Link>
    </nav>
  ) : (
    <nav aria-label="Account" className="za-site-header__nav">
      <Link className="za-link" href="/login">
        Sign in
      </Link>
      <Link className="za-button za-button--primary" href="/signup">
        Get started
      </Link>
    </nav>
  );

  return (
    <div className="za-landing">
      <div className="za-hero__ghost" aria-hidden="true">
        <Image alt="" height={1254} priority src="/biglogo.png" width={1254} unoptimized />
      </div>

      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <Link href="/" className="za-wordmark za-link za-site-header__brand">
            <Image
              alt=""
              aria-hidden="true"
              className="za-wordmark__mark"
              height={48}
              src="/zedarchivelogo.png"
              width={72}
              unoptimized
            />
            <span className="za-wordmark__text">zedarchive</span>
          </Link>
          {accountNav}
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="za-hero">
          <p className="za-hero__eyebrow">Quiet media archive</p>

          <h1 className="za-hero__title">
            Your watchlist &amp; reading list,
            <br />
            <em>kept quietly.</em>
          </h1>

          <div className="za-hero__actions">
            {signedIn ? (
              <Link className="za-button za-button--primary" href="/dashboard">
                Open your archive
              </Link>
            ) : (
              <>
                <Link className="za-button za-button--primary" href="/signup">
                  Get started
                </Link>
                <Link className="za-button za-button--secondary" href="/login">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="za-site-footer">
        <div className="za-container za-container--wide za-site-footer__inner">
          <small>episodes · chapters · volumes</small>
          <small>no feeds · no noise</small>
        </div>
      </footer>
    </div>
  );
}
