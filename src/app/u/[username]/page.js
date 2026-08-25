import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { getPublicUserProfile, getProfileComments } from '@/app/dashboard/actions';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user as userTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Star, ShieldAlert } from 'lucide-react';
import { getTileInitials } from '@/lib/format';
import ProfileComments from './ProfileComments';
import styles from '@/app/dashboard/dashboard.module.css';

export async function generateMetadata({ params }) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);
  if (!data?.user) {
    return { title: 'User Not Found — zedarchive' };
  }
  return {
    title: `@${data.user.username}’s Media Archive — zedarchive`,
    description: data.user.bio || `Explore @${data.user.username}’s public media collection on zedarchive.`,
  };
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user) {
    return (
      <div className={styles.dashboardContainer} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className={`za-card ${styles.emptyCard}`} style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <ShieldAlert size={36} style={{ margin: '0 auto var(--za-space-3)', color: 'var(--za-color-text-muted)' }} />
          <h1 className={styles.emptyTitle}>Archive Unavailable</h1>
          <p className={styles.emptySubtitle}>
            This archive is either private or does not exist.
          </p>
          <Link href="/" className="za-button za-button--primary" style={{ marginTop: 'var(--za-space-3)' }}>
            Go to ZedArchive Home
          </Link>
        </div>
      </div>
    );
  }

  const { user, entries = [] } = data;

  // Viewer context: who (if anyone) is looking, and may they comment?
  let viewer = { isLoggedIn: false, id: null, username: null, name: null, image: null, isPublic: false };
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    const [meRow] = await db
      .select({
        id: userTable.id,
        username: userTable.username,
        name: userTable.name,
        image: userTable.image,
        isPublic: userTable.isPublic,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id));
    if (meRow) {
      viewer = { isLoggedIn: true, ...meRow };
    }
  }

  // Guestbook comments (auto-purges expired rows for this profile)
  const initialComments = await getProfileComments(user.id);

  const showEntries = entries.filter((e) => e.category === 'show' || e.category === 'anime');
  const bookEntries = entries.filter((e) => e.category === 'book' || e.category === 'manga');
  const completedCount = entries.filter((e) => e.status === 'completed').length;
  const topRated = entries.filter((e) => e.rating && e.rating >= 9);

  return (
    <div className={styles.dashboardContainer} style={{ minHeight: '100vh' }}>
      {/* Public Header */}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--za-space-3)' }}>
            <Link href="/signup" className="za-button za-button--primary">
              Create Your Archive
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className={styles.mainArea}>
        <div className="za-container">
          {/* Profile Header Masthead */}
          <div className={styles.pageMasthead} style={{ borderBottom: 'var(--za-border-width) solid var(--za-color-border-decorative)', paddingBottom: 'var(--za-space-6)' }}>
            <div className={styles.mastheadText}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <h1 className={styles.mastheadTitle}>
                  @{user.username}
                </h1>
                <span className={styles.metaBadge} style={{ background: 'rgba(46, 125, 50, 0.1)', color: '#2e7d32', borderColor: 'rgba(46, 125, 50, 0.3)' }}>
                  Public Archive
                </span>
              </div>
              {user.bio && (
                <p className={styles.mastheadSubtitle} style={{ marginTop: 'var(--za-space-2)' }}>
                  {user.bio}
                </p>
              )}
            </div>

            {/* Quick Stats Grid */}
            <div className={styles.statsGrid} style={{ marginTop: 'var(--za-space-4)' }}>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{entries.length}</div>
                <div className={styles.statLabel}>Total Cataloged</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue} style={{ color: '#2e7d32' }}>{completedCount}</div>
                <div className={styles.statLabel}>Completed</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{showEntries.length}</div>
                <div className={styles.statLabel}>Shows & Anime</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{bookEntries.length}</div>
                <div className={styles.statLabel}>Books & Manga</div>
              </div>
            </div>
          </div>

          {/* Media Grid */}
          <div style={{ marginTop: 'var(--za-space-6)' }}>
            <div style={{ fontSize: 'var(--za-text-heading-sm)', fontWeight: 'var(--za-weight-heading)', marginBottom: 'var(--za-space-4)' }}>
              Cataloged Titles ({entries.length})
            </div>

            <div className={styles.mediaGrid}>
              {entries.map((item) => {
                const isBook = item.category === 'book' || item.category === 'manga';
                const progressPct = item.secondaryUnitTotal
                  ? Math.min(100, Math.round(((item.secondaryUnitCurrent || 0) / item.secondaryUnitTotal) * 100))
                  : 0;

                return (
                  <article key={item.id} className={`za-card za-card--raised ${styles.mediaCard}`}>
                    <div className={styles.cardTopSection}>
                      <div className={styles.coverWrapper}>
                        {item.coverImage ? (
                          <img src={item.coverImage} alt={item.title} className={styles.coverImage} loading="lazy" />
                        ) : (
                          <div className="za-title-tile" style={{ width: '100%', height: '100%' }}>
                            <span>{getTileInitials(item.title)}</span>
                          </div>
                        )}
                      </div>

                      <div className={styles.cardDetails}>
                        <h3 className={styles.cardTitle} title={item.title}>
                          {item.title}
                        </h3>

                        <div className={styles.badgeRow}>
                          <span className={styles.metaBadge} style={{ textTransform: 'capitalize' }}>
                            {(item.status || 'in_progress').replace('_', ' ')}
                          </span>
                          {item.rating != null && (
                            <span className={styles.ratingBadge}>
                              <Star size={11} fill="currentColor" /> {item.rating}/10
                            </span>
                          )}
                          <span className={styles.metaBadge}>
                            {isBook ? `Vol ${item.primaryUnitCurrent || 1}` : `S${item.primaryUnitCurrent || 1}`}
                          </span>
                        </div>

                        {item.notes && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--za-color-text-muted)', marginTop: 'var(--za-space-2)', lineHeight: 1.4, maxHeight: '3.5rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            &ldquo;{item.notes}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>

                    <div className={styles.cardActionZone}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginBottom: '0.3rem' }}>
                        <span>Progress</span>
                        <span>
                          {isBook ? 'Ch ' : 'Ep '}{item.secondaryUnitCurrent || 0}{item.secondaryUnitTotal ? ` / ${item.secondaryUnitTotal}` : ''}
                        </span>
                      </div>
                      {item.secondaryUnitTotal ? (
                        <div className={styles.progressBarContainer}>
                          <div className={styles.progressBarFill} style={{ width: `${progressPct}%` }} />
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Guestbook */}
          <ProfileComments
            profileUser={{ id: user.id, username: user.username }}
            initialComments={initialComments}
            viewer={viewer}
          />
        </div>
      </main>
    </div>
  );
}
