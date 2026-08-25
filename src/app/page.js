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
            <Link className="za-button za-button--secondary" href="/signup">
              Register
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="za-container za-container--wide">
          <section className="za-hero">
            <p className="za-hero__eyebrow">Quiet media archive</p>

            <div className="za-hero__logo">
              <Image
                alt="zedarchive logo"
                height={192}
                src="/zedarchivelogo.png"
                width={288}
                unoptimized
                priority
              />
            </div>

            <h1 className="za-hero__title">
              Your watchlist &amp; reading list, <em>kept quietly.</em>
            </h1>

            <p className="za-hero__desc">
              A calm, distraction-free catalogue for the anime, television
              series, novels, and books you&apos;re working through — nothing more.
            </p>

            <div className="za-hero__badges" aria-label="Catalogued media types">
              <span className="za-badge">TV Series</span>
              <span className="za-badge">Anime</span>
              <span className="za-badge">Books</span>
              <span className="za-badge">Manga</span>
            </div>

            <div className="za-hero__actions">
              <Link className="za-button za-button--primary" href="/signup">
                Get started
              </Link>
              <Link className="za-button za-button--secondary" href="/login">
                Sign in
              </Link>
            </div>
          </section>

          <section className="za-feature-grid" aria-label="Features">
            <article className="za-feature">
              <span className="za-feature__index">01</span>
              <h2>Unified collection</h2>
              <p>
                Anime series, television shows, light novels, and physical
                literature in one serene archive.
              </p>
            </article>
            <article className="za-feature">
              <span className="za-feature__index">02</span>
              <h2>Frictionless steppers</h2>
              <p>
                Increment episodes and chapter milestones in one clean click. No
                feeds, algorithms, or banner ads.
              </p>
            </article>
            <article className="za-feature">
              <span className="za-feature__index">03</span>
              <h2>Private &amp; permanent</h2>
              <p>
                Your personal progress is stored securely and remains under your
                complete ownership.
              </p>
            </article>
          </section>
        </div>
      </main>

      <footer className="za-site-footer">
        <div className="za-container za-container--wide za-site-footer__inner">
          <small>zedarchive — quiet media archive</small>
          <small>episodes · chapters · volumes</small>
        </div>
      </footer>
    </>
  );
}