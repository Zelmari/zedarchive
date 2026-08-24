// src/app/page.js
import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className={styles.container}>
      <header className={styles.nav}>
        <div className={styles.brand}>zedarchive</div>
        <div className={styles.navLinks}>
          <Link href="/login" className={styles.navLogin}>
            Log In
          </Link>
          <Link href="/signup" className={styles.navSignup}>
            Sign Up
          </Link>
        </div>
      </header>

      <main className={styles.hero}>
        <span className={styles.badge}>Minimalist Media Tracker</span>
        <h1 className={styles.heroTitle}>Track what you watch & read without the bloat.</h1>
        <p className={styles.heroSubtitle}>
          A fast, distraction-free archive for your anime, TV series, novels, and books. Kept in sync with your personal account.
        </p>
        <div className={styles.ctaGroup}>
          <Link href="/signup" className={styles.primaryCta}>
            Get Started Free
          </Link>
          <Link href="/login" className={styles.secondaryCta}>
            Sign In
          </Link>
        </div>
      </main>

      <section className={styles.features}>
        <div className={styles.featureCard}>
          <h3>Unified Tracker</h3>
          <p>Track anime, shows, web novels, and physical books in a single streamlined dashboard.</p>
        </div>
        <div className={styles.featureCard}>
          <h3>Frictionless Updates</h3>
          <p>Increment episodes and chapters in one click. No cluttered social feeds or ads.</p>
        </div>
        <div className={styles.featureCard}>
          <h3>Persistent & Private</h3>
          <p>Your library is stored in PostgreSQL and tied securely to your account.</p>
        </div>
      </section>
    </div>
  );
}