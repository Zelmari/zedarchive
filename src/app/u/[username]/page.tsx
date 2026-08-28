import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { getPublicUserProfile, getUserProfileById } from '@/server/queries/user';
import { getCommentsByProfileUserId } from '@/server/queries/comments';
import { calculateArchiveStats, calculateReadingGoalProgress } from '@/lib/stats';
import { getInitials, getTileInitials, formatMonthYear } from '@/lib/format';
import { auth } from '@/lib/auth';
import { Star, ShieldAlert } from 'lucide-react';
import ProfileComments from './ProfileComments';
import ShareArchiveButton from './ShareArchiveButton';

import { THEME_LABELS } from '@/lib/constants';
import { MarkdownNotes } from '@/lib/markdown';

type PageParams = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageParams) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);
  if (!data?.user) {
    return { title: 'User Not Found — zedarchive' };
  }
  return {
    title: `@${data.user.username}’s Media Archive — zedarchive`,
    description:
      data.user.bio || `Explore @${data.user.username}’s public media collection on zedarchive.`,
    openGraph: {
      title: `${data.user.name} (@${data.user.username})’s Media Archive`,
      description:
        data.user.bio || `Explore @${data.user.username}’s public media collection on zedarchive.`,
      images: [
        {
          url:
            data.user.image && /^https:\/\//i.test(data.user.image)
              ? data.user.image
              : '/icon-512.png',
          width: 512,
          height: 512,
          alt: `${data.user.name}’s Profile`,
        },
      ],
    },
  };
}

export default async function PublicProfilePage({ params }: PageParams) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user) {
    return (
      <div
        className="flex min-h-screen flex-col bg-canvas text-ink"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className={`za-card col-span-full flex flex-col items-center justify-center rounded-control border border-dashed border-required px-[var(--za-space-6)] py-[var(--za-space-12)] text-center [box-shadow:none]`}
          style={{ maxWidth: '28rem', textAlign: 'center' }}
        >
          <ShieldAlert
            size={36}
            style={{ margin: '0 auto var(--za-space-3)', color: 'var(--za-color-text-muted)' }}
          />
          <h1 className="mb-[var(--za-space-1)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Archive Unavailable
          </h1>
          <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
            This archive is either private or does not exist.
          </p>
          <Link
            href="/"
            className="za-button za-button--primary"
            style={{ marginTop: 'var(--za-space-3)' }}
          >
            Go to ZedArchive Home
          </Link>
        </div>
      </div>
    );
  }

  const { user, entries = [] } = data;

  // Viewer context: who (if anyone) is looking, and may they comment?
  let viewer: {
    isLoggedIn: boolean;
    id: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
    isPublic: boolean;
  } = { isLoggedIn: false, id: null, username: null, name: null, image: null, isPublic: false };
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    const meRow = await getUserProfileById(session.user.id);
    if (meRow) {
      viewer = {
        isLoggedIn: true,
        id: meRow.id,
        username: meRow.username,
        name: meRow.name,
        image: meRow.image,
        isPublic: meRow.isPublic,
      };
    }
  }

  // Guestbook comments (auto-purges expired rows for this profile)
  const initialComments = await getCommentsByProfileUserId(user.id, session?.user?.id);

  const stats = calculateArchiveStats(entries);
  const currentYear = new Date().getFullYear();
  const publicGoal = user.readingGoals?.[String(currentYear)]?.isPublic
    ? user.readingGoals[String(currentYear)]
    : null;
  const publicGoalProgress = publicGoal ? calculateReadingGoalProgress(entries, publicGoal) : null;

  const hostHeaders = await headers();
  const host = hostHeaders.get('x-forwarded-host') ?? hostHeaders.get('host') ?? 'zedarchive.com';
  const proto = hostHeaders.get('x-forwarded-proto') ?? 'https';
  const profileUrl = `${proto}://${host}/u/${user.username}`;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink" style={{ minHeight: '100vh' }}>
      {/* Public Header */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <Link href="/" className="za-wordmark za-link za-site-header__brand">
            <Image
              alt=""
              aria-hidden="true"
              className="za-wordmark__mark"
              height={36}
              src="/transparentlogo.png"
              width={36}
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
      <main id="main-content" className="flex-1 pt-[var(--za-space-6)] pb-[var(--za-space-12)]">
        <div className="za-container">
          {/* Profile Header Masthead */}
          <div className="mb-6 rounded-control border border-required border-b-decorative bg-surface p-6 shadow-raised">
            {/* Hero Identity Zone */}
            <div className="flex flex-wrap items-center gap-5">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- compressed data URL avatars, unoptimized by design
                <img
                  src={user.image}
                  alt={`${user.name}'s avatar`}
                  className="h-24 w-24 flex-none rounded-full border-[3px] border-accent object-cover shadow-raised"
                />
              ) : (
                <span
                  className="flex h-24 w-24 flex-none items-center justify-center rounded-full border-[3px] border-accent bg-[var(--za-color-title-tile)] text-2xl font-[var(--za-weight-heading)] text-[var(--za-color-title-tile-text)] shadow-raised"
                  aria-hidden="true"
                >
                  {getInitials(user.name)}
                </span>
              )}

              <div className="min-w-0 flex-1 basis-64">
                <h1 className="text-2xl font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] tracking-[-0.025em] text-ink">
                  {user.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[length:var(--za-text-supporting)] text-ink-muted">
                    @{user.username}
                  </span>
                  <span className="inline-block rounded-small border border-success/30 bg-success/10 px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-success">
                    Public Archive
                  </span>
                  {user.theme && (
                    <span className="inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted">
                      {(user.theme && (THEME_LABELS as Record<string, string>)[user.theme]) ??
                        user.theme}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[length:var(--za-text-fine)] text-ink-muted">
                  Archiving since {formatMonthYear(user.createdAt)}
                </p>
                {user.bio && (
                  <p className="mt-3 border-l-2 border-decorative pl-3 text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
                    {user.bio}
                  </p>
                )}
                {publicGoalProgress && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-small border border-decorative bg-surface-subtle px-3 py-1 text-xs text-ink">
                    <span>📖</span>
                    <span className="font-[var(--za-weight-emphasis)]">
                      {currentYear} Reading Challenge:
                    </span>
                    <span>
                      {publicGoalProgress.completedCount} of {publicGoalProgress.annualTarget} books
                      ({publicGoalProgress.percentage}%)
                    </span>
                    {publicGoalProgress.status === 'ahead' && (
                      <span className="text-[11px] font-[var(--za-weight-emphasis)] text-success">
                        · {publicGoalProgress.paceDiff} ahead of pace!
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Action Bar */}
              <div className="flex flex-none flex-col items-end gap-2">
                <ShareArchiveButton url={profileUrl} />
                <Link
                  href={`/u/${user.username}/wrapped/${currentYear}`}
                  className="za-button za-button--secondary inline-flex items-center text-xs"
                >
                  View Annual Wrapped
                </Link>
                {viewer.isLoggedIn && viewer.id === user.id && (
                  <Link
                    href="/settings"
                    className="za-button za-button--primary inline-flex items-center text-xs"
                  >
                    Edit Profile
                  </Link>
                )}
              </div>
            </div>

            {/* Enriched Stats & Highlights Bar */}
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
              <div className="flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center">
                <div className="text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-ink">
                  {stats.totalEntries}
                </div>
                <div className="mt-1 text-xs leading-[1.3] text-ink-muted">Total Cataloged</div>
              </div>
              <div className="flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center">
                <div className="text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-success">
                  {stats.completedCount}
                  <span className="text-xs text-ink-muted"> · {stats.completionRate}%</span>
                </div>
                <div className="mt-1 text-xs leading-[1.3] text-ink-muted">
                  Completed · Completion Rate
                </div>
              </div>
              <div className="flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center">
                <div className="text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-ink">
                  {stats.totalEpisodes}
                </div>
                <div className="mt-1 text-xs leading-[1.3] text-ink-muted">Episodes Watched</div>
              </div>
              <div className="flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center">
                <div className="text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-ink">
                  {stats.totalChapters}
                </div>
                <div className="mt-1 text-xs leading-[1.3] text-ink-muted">Chapters Read</div>
              </div>
              <div className="flex flex-col items-center rounded-control border border-decorative bg-surface-subtle px-2 py-3 text-center">
                <div
                  className="inline-flex items-center gap-1 text-[1.35rem] font-[var(--za-weight-heading)] leading-[1.2] text-ink"
                  style={{ color: '#b45309' }}
                >
                  <Star size={16} fill="currentColor" />
                  {stats.avgRating}
                </div>
                <div className="mt-1 text-xs leading-[1.3] text-ink-muted">Avg Rating</div>
              </div>
            </div>
          </div>

          {/* Media Grid */}
          <section aria-labelledby="cataloged-titles-heading" className="mt-8">
            <h2
              id="cataloged-titles-heading"
              className="mb-4 text-[length:var(--za-text-heading-sm)] font-[var(--za-weight-heading)] text-ink"
            >
              Cataloged Titles ({entries.length})
            </h2>

            {entries.length === 0 ? (
              <div className="za-card rounded-control border border-decorative bg-surface-subtle p-8 text-center text-[length:var(--za-text-supporting)] text-ink-muted">
                No titles cataloged yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-[var(--za-space-6)] md:grid-cols-2 lg:grid-cols-3">
                {entries.map((item) => {
                  const isMovie = item.category === 'movie';
                  const isBook = item.category === 'book' || item.category === 'manga';
                  const progressPct = item.secondaryUnitTotal
                    ? Math.min(
                        100,
                        Math.round(
                          ((item.secondaryUnitCurrent || 0) / item.secondaryUnitTotal) * 100,
                        ),
                      )
                    : item.status === 'completed'
                      ? 100
                      : 0;

                  return (
                    <article
                      key={item.id}
                      className={`za-card za-card--raised flex min-w-0 max-w-full flex-col gap-[var(--za-space-4)] rounded-control p-[var(--za-space-4)]`}
                    >
                      <div className="flex items-start gap-[var(--za-space-4)]">
                        <div className="relative block w-28 min-w-28 flex-none basis-28 overflow-hidden rounded-small border border-decorative bg-[var(--za-color-title-tile)] [aspect-ratio:2/3]">
                          {item.coverImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data URL / remote covers, unoptimized by design
                            <img
                              src={item.coverImage}
                              alt={item.title}
                              className="block h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="za-title-tile"
                              style={{ width: '100%', height: '100%' }}
                            >
                              <span>{getTileInitials(item.title)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 basis-40 flex-col justify-between gap-2">
                          <h3
                            className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink"
                            title={item.title}
                          >
                            {item.title}
                          </h3>

                          <div className="flex flex-wrap items-center gap-[var(--za-space-1)]">
                            <span
                              className="inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted"
                              style={{ textTransform: 'capitalize' }}
                            >
                              {(item.status || 'in_progress').replace('_', ' ')}
                            </span>
                            {item.rating != null && (
                              <span className="inline-flex items-center gap-[0.2rem] rounded-small border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.12)] px-[0.45rem] py-[0.12rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-[#b45309]">
                                <Star size={11} fill="currentColor" /> {item.rating}/10
                              </span>
                            )}
                            {isMovie ? (
                              item.primaryUnitCurrent && item.primaryUnitCurrent > 1 ? (
                                <span className="inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted">
                                  {item.primaryUnitCurrent}x Watched
                                </span>
                              ) : item.secondaryUnitTotal ? (
                                <span className="inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted">
                                  {Math.floor(item.secondaryUnitTotal / 60) > 0
                                    ? `${Math.floor(item.secondaryUnitTotal / 60)}h ${item.secondaryUnitTotal % 60}m`
                                    : `${item.secondaryUnitTotal}m`}
                                </span>
                              ) : null
                            ) : (
                              <span className="inline-block rounded-small border border-decorative bg-surface-subtle px-[0.45rem] py-[0.15rem] text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] leading-[1.2] text-ink-muted">
                                {isBook
                                  ? `Vol ${item.primaryUnitCurrent || 1}`
                                  : `S${item.primaryUnitCurrent || 1}`}
                              </span>
                            )}
                          </div>

                          {item.notes && (
                            <div className="mt-2 max-h-16 overflow-hidden text-ellipsis text-xs text-ink-muted">
                              <MarkdownNotes content={item.notes} />
                            </div>
                          )}

                          {item.quotes && item.quotes.length > 0 && (
                            <div className="mt-2 rounded-small border border-decorative bg-surface-subtle p-2 text-xs italic text-ink-muted">
                              &ldquo;
                              {item.quotes.find((q) => q.isFavorite)?.text || item.quotes[0]?.text}
                              &rdquo;
                              {(item.quotes.find((q) => q.isFavorite)?.speaker ||
                                item.quotes[0]?.speaker) && (
                                <span className="block not-italic text-[10px] text-ink-muted mt-0.5">
                                  —{' '}
                                  {item.quotes.find((q) => q.isFavorite)?.speaker ||
                                    item.quotes[0]?.speaker}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-[var(--za-space-3)] border-t border-decorative pt-[var(--za-space-3)]">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 'var(--za-text-fine)',
                            color: 'var(--za-color-text-muted)',
                            marginBottom: '0.3rem',
                          }}
                        >
                          <span>Progress</span>
                          <span>
                            {isMovie
                              ? item.status === 'completed'
                                ? 'Completed'
                                : `${item.secondaryUnitCurrent || 0}m / ${item.secondaryUnitTotal || 0}m`
                              : isBook
                                ? `Ch ${item.secondaryUnitCurrent || 0}${item.secondaryUnitTotal ? ` / ${item.secondaryUnitTotal}` : ''}`
                                : `Ep ${item.secondaryUnitCurrent || 0}${item.secondaryUnitTotal ? ` / ${item.secondaryUnitTotal}` : ''}`}
                          </span>
                        </div>
                        {item.secondaryUnitTotal ? (
                          <div className="h-1 flex-1 overflow-hidden rounded-sm bg-surface-subtle">
                            <div
                              className="h-full rounded-sm bg-accent transition-[width] duration-[var(--za-motion-fast)]"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Guestbook */}
          <div className="mt-8">
            <ProfileComments
              profileUser={{ id: user.id, username: user.username }}
              initialComments={initialComments}
              viewer={viewer}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
