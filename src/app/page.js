import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <>
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
          <nav aria-label="Account" className="za-site-header__nav">
            <Link className="za-link" href="/login">
              Sign in
            </Link>
            <Link className="za-link" href="/signup">
              Register
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ display: 'grid', gap: 'var(--za-space-6)', paddingBlock: 'var(--za-space-6)' }}
      >
        <div className="za-container za-container--wide" style={{ display: 'grid', gap: 'var(--za-space-6)' }}>
          <section className="za-card za-card--raised" style={{ display: 'grid', gap: 'var(--za-space-4)', padding: 'var(--za-space-4)' }}>
            <h1
              style={{
                fontSize: 'var(--za-text-heading-xl)',
                lineHeight: 'var(--za-leading-compact)',
                fontWeight: 'var(--za-weight-heading)',
                overflowWrap: 'anywhere',
              }}
            >
              Track what you watch &amp; read
            </h1>
            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
                lineHeight: 'var(--za-leading-body)',
                maxInlineSize: 'var(--za-measure-readable)',
              }}
            >
              A calm, distraction-free catalogue for your anime, television
              series, web novels, and books. Kept cleanly in sync with your
              personal account.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--za-space-3)' }}>
              <Link href="/signup" className="za-button za-button--primary">
                Get started
              </Link>
              <Link href="/login" className="za-button za-button--secondary">
                Sign in
              </Link>
            </div>
          </section>

          <ul
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--za-space-6)',
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            <li className="za-card za-card--raised" style={{ display: 'grid', gap: 'var(--za-space-2)', padding: 'var(--za-space-4)' }}>
              <h2
                style={{
                  fontSize: 'var(--za-text-heading-md)',
                  fontWeight: 'var(--za-weight-heading)',
                  lineHeight: 'var(--za-leading-compact)',
                }}
              >
                Unified collection
              </h2>
              <p
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  color: 'var(--za-color-text-muted)',
                  lineHeight: 'var(--za-leading-body)',
                }}
              >
                Keep anime series, television shows, light novels, and physical
                literature in one serene archive.
              </p>
            </li>
            <li className="za-card za-card--raised" style={{ display: 'grid', gap: 'var(--za-space-2)', padding: 'var(--za-space-4)' }}>
              <h2
                style={{
                  fontSize: 'var(--za-text-heading-md)',
                  fontWeight: 'var(--za-weight-heading)',
                  lineHeight: 'var(--za-leading-compact)',
                }}
              >
                Frictionless steppers
              </h2>
              <p
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  color: 'var(--za-color-text-muted)',
                  lineHeight: 'var(--za-leading-body)',
                }}
              >
                Increment episodes and chapter milestones in one clean click. No
                social feeds, algorithms, or banner ads.
              </p>
            </li>
            <li className="za-card za-card--raised" style={{ display: 'grid', gap: 'var(--za-space-2)', padding: 'var(--za-space-4)' }}>
              <h2
                style={{
                  fontSize: 'var(--za-text-heading-md)',
                  fontWeight: 'var(--za-weight-heading)',
                  lineHeight: 'var(--za-leading-compact)',
                }}
              >
                Private &amp; permanent
              </h2>
              <p
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  color: 'var(--za-color-text-muted)',
                  lineHeight: 'var(--za-leading-body)',
                }}
              >
                Your personal progress is stored securely and remains under your
                complete ownership.
              </p>
            </li>
          </ul>
        </div>
      </main>
    </>
  );
}