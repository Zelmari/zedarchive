import Link from 'next/link';
import Image from 'next/image';
import { isAuthenticated } from '@/server/queries/user';
import BrandWordmark from '@/components/navigation/BrandWordmark';

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
        <Image alt="" height={1254} priority src="/transparentlogo.png" width={1254} unoptimized />
      </div>

      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <BrandWordmark />
          {accountNav}
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="za-container za-container--wide za-landing__content">
          <header className="za-landing__masthead">
            <div className="za-landing__masthead-meta" aria-label="Edition information">
              <span>Anno MMXXVI</span>
              <span>Quiet media archive</span>
              <span>Archivum Privatum</span>
            </div>

            <h1 className="za-hero__title">
              Your watchlist &amp; reading list,
              <br />
              <em>kept quietly.</em>
            </h1>

            <p className="za-landing__subtitle">
              An unhurried place for the stories, films, and books you mean to keep.
            </p>
            <p className="za-landing__motto">Legere · Videre · Recordari</p>
          </header>

          <section aria-labelledby="za-hero-heading" className="za-hero za-bookplate">
            <div className="za-hero__copy">
              <p className="za-hero__eyebrow">A personal media archive</p>
              <h2 className="za-hero__lead" id="za-hero-heading">
                “In an age of infinite feeds, keeping a shelf is a quiet act of attention.”
              </h2>
              <p className="za-hero__description">
                zedarchive gives your watchlist and reading list a considered home for books,
                cinema, television, and manga. No ads, no engagement loop—just a record of what you
                chose and what you want to return to.
              </p>

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
            </div>

            <aside aria-label="zedarchive ex libris plate" className="za-hero__ex-libris">
              <p className="za-hero__ex-libris-label">Ex Libris</p>
              <div aria-hidden="true" className="za-hero__seal">
                ❦
              </div>
              <p className="za-hero__owner">zedarchive</p>
              <p className="za-hero__caption">A quiet media archive</p>
              <p className="za-hero__inscription">
                Catalogue what matters.
                <br />
                Return when ready.
              </p>
            </aside>
          </section>

          <section aria-labelledby="za-manifesto-heading" className="za-landing__manifesto">
            <div className="za-landing__section-heading">
              <p className="za-landing__section-kicker">A small declaration</p>
              <h2 id="za-manifesto-heading">For a quieter shelf.</h2>
            </div>

            <div className="za-manifesto__grid">
              <article className="za-bookplate za-manifesto__plate">
                <h3 className="za-manifesto__title">
                  <span className="za-manifesto__dropcap">I.</span>
                  <span>The Anti-Algorithmic Shelf</span>
                </h3>
                <p>
                  Your shelf begins with intention. No feed decides what deserves another hour, and
                  no ad competes for the attention you brought to it. Keep a record of the works you
                  chose, in your order.
                </p>
              </article>

              <article className="za-bookplate za-manifesto__plate">
                <h3 className="za-manifesto__title">
                  <span className="za-manifesto__dropcap">II.</span>
                  <span>Physicality in the Digital Realm</span>
                </h3>
                <p>
                  Warm canvas, deckled edges, and measured type borrow the patience of a well-made
                  bookplate. The craft is visual, but the purpose is practical: make returning to a
                  title feel deliberate.
                </p>
              </article>

              <article className="za-bookplate za-manifesto__plate">
                <h3 className="za-manifesto__title">
                  <span className="za-manifesto__dropcap">III.</span>
                  <span>Absolute Data Sovereignty</span>
                </h3>
                <p>
                  Your entries belong to you. Work with the archive offline, and use its backup
                  tools when you need a portable copy. A shelf should never feel held hostage.
                </p>
              </article>
            </div>
          </section>

          <section aria-labelledby="za-specimens-heading" className="za-landing__specimens">
            <div className="za-landing__section-heading">
              <p className="za-landing__section-kicker">Decorative studies</p>
              <h2 id="za-specimens-heading">A shelf in miniature.</h2>
              <p>Static cover studies, not a preview of any personal collection.</p>
            </div>

            <div className="za-specimen__grid">
              <article
                aria-label="Decorative animation cover study"
                className="za-bookplate za-specimen"
              >
                <div aria-hidden="true" className="za-specimen__cover za-specimen__cover--ember">
                  <span>FR</span>
                  <small>BEYOND THE END</small>
                </div>
                <div className="za-specimen__details">
                  <p>Specimen plate 01 · animation</p>
                  <h3>Frieren</h3>
                  <span>Initials tile · cover study</span>
                </div>
              </article>

              <article
                aria-label="Decorative television cover study"
                className="za-bookplate za-specimen"
              >
                <div aria-hidden="true" className="za-specimen__cover za-specimen__cover--ink">
                  <span>SV</span>
                  <small>THE SEVERED HOUR</small>
                </div>
                <div className="za-specimen__details">
                  <p>Specimen plate 02 · television</p>
                  <h3>Severance</h3>
                  <span>Initials tile · cover study</span>
                </div>
              </article>

              <article
                aria-label="Decorative book cover study"
                className="za-bookplate za-specimen"
              >
                <div aria-hidden="true" className="za-specimen__cover za-specimen__cover--gold">
                  <span>BK</span>
                  <small>BOUND &amp; KEPT</small>
                </div>
                <div className="za-specimen__details">
                  <p>Specimen plate 03 · literature</p>
                  <h3>Bookmarked</h3>
                  <span>Initials tile · cover study</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>

      <footer className="za-site-footer">
        <div className="za-container za-container--wide za-site-footer__inner">
          <small>episodes · chapters · volumes</small>
          <small>
            <a
              className="za-site-footer__link"
              href="https://discord.gg/q6U9m4WZUh"
              rel="noopener noreferrer"
              target="_blank"
            >
              Updates posted regularly on Discord
            </a>
          </small>
          <small>no feeds · no noise</small>
        </div>
      </footer>
    </div>
  );
}
