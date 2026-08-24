import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className={styles.container}>
      <header className="za-site-header">
        <div className="za-container za-site-header__inner">
          <Link href="/" className="za-wordmark">
            <span className="za-wordmark__mark">
              <Image
                src="/zedarchivelogo.png"
                alt="zedarchive logo"
                width={72}
                height={48}
                priority
                unoptimized
              />
            </span>
            <span className="za-wordmark__text">zedarchive</span>
          </Link>
          <nav className={styles.navLinks} aria-label="Main Navigation">
            <Link href="/login" className="za-button za-button--secondary">
              Sign In
            </Link>
            <Link href="/signup" className="za-button za-button--primary">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className={styles.mainContent}>
        <section className={styles.heroSection}>
          <div className="za-container za-container--medium">
            <span className={styles.categoryBadge}>Quiet Media Archive</span>
            <h1 className={styles.heroTitle}>
              Track what you watch & read without the noise.
            </h1>
            <p className={styles.heroSubtitle}>
              A calm, distraction-free catalogue for your anime, television series, web novels, and books. Kept cleanly in sync with your personal account.
            </p>
            <div className={styles.ctaGroup}>
              <Link href="/signup" className="za-button za-button--primary">
                Get Started Free
              </Link>
              <Link href="/login" className="za-button za-button--secondary">
                Sign In to Archive
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.featuresSection}>
          <div className="za-container">
            <div className={styles.featuresGrid}>
              <article className="za-card za-card--raised">
                <h2 className={styles.featureTitle}>Unified Collection</h2>
                <p className={styles.featureText}>
                  Keep anime series, television shows, light novels, and physical literature in one serene archive.
                </p>
              </article>
              <article className="za-card za-card--raised">
                <h2 className={styles.featureTitle}>Frictionless Steppers</h2>
                <p className={styles.featureText}>
                  Increment episodes and chapter milestones in one clean click. No social feeds, algorithms, or banner ads.
                </p>
              </article>
              <article className="za-card za-card--raised">
                <h2 className={styles.featureTitle}>Private & Permanent</h2>
                <p className={styles.featureText}>
                  Your personal progress is stored securely in PostgreSQL and remains under your complete ownership.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className="za-container">
          <p className={styles.footerText}>
            © {new Date().getFullYear()} zedarchive. Quiet archive foundation.
          </p>
        </div>
      </footer>
    </div>
  );
}