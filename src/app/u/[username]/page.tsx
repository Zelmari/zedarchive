import Link from 'next/link';
import { headers } from 'next/headers';
import { getPublicUserProfile, getUserProfileById } from '@/server/queries/user';
import { getCommentsByProfileUserId } from '@/server/queries/comments';
import { getYearlyActivityHeatmapForUser } from '@/server/queries/activity';
import { calculateArchiveStats, calculateReadingGoalProgress } from '@/lib/stats';
import { getInitials, getTileInitials, formatMonthYear } from '@/lib/format';
import { getSessionUser } from '@/server/internal';
import { Star, Sparkles } from 'lucide-react';
import ProfileComments from './ProfileComments';
import ShareArchiveButton from './ShareArchiveButton';
import ActivityHeatmap from '@/components/ui/ActivityHeatmap';
import BrandWordmark from '@/components/navigation/BrandWordmark';
import FriendButton from './FriendButton';
import { getFriendshipStatus } from '@/server/queries/friends';

import { THEME_LABELS } from '@/lib/constants';
import { MarkdownNotes } from '@/lib/markdown';
import ArchiveUnavailable from '@/components/ui/ArchiveUnavailable';
import { Badge, RatingBadge, StatusBadge } from '@/components/ui/Badge';

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
      <ArchiveUnavailable ctaLabel="Go to ZedArchive Home" ctaClassName="mt-[var(--za-space-3)]" />
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
  const sessionUser = await getSessionUser();
  if (sessionUser?.id) {
    const meRow = await getUserProfileById(sessionUser.id);
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

  // Friendship status for Add Friend button
  let friendshipStatus: {
    status: string | null;
    isSender: boolean | null;
    friendshipId: string | null;
  } = {
    status: null,
    isSender: null,
    friendshipId: null,
  };
  if (viewer.isLoggedIn && viewer.id && viewer.id !== user.id) {
    try {
      friendshipStatus = await getFriendshipStatus(viewer.id, user.id);
    } catch {
      // ignore
    }
  }

  // Guestbook comments (auto-purges expired rows for this profile)
  const initialComments = await getCommentsByProfileUserId(user.id, sessionUser?.id);
  const activityHeatmap = await getYearlyActivityHeatmapForUser(user.id, sessionUser?.id);

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

  const customStyles =
    user.theme === 'custom' && user.customTheme
      ? ({
          '--za-color-canvas': user.customTheme.canvas,
          '--za-color-surface': user.customTheme.surface,
          '--za-color-surface-subtle': user.customTheme.surfaceSubtle,
          '--za-color-text': user.customTheme.text,
          '--za-color-text-muted': user.customTheme.textMuted,
          '--za-color-border-required': user.customTheme.borderRequired,
          '--za-color-border-decorative': user.customTheme.borderDecorative,
          '--za-color-accent': user.customTheme.accent,
          '--za-color-accent-hover': user.customTheme.accent,
          '--za-color-on-accent': user.customTheme.onAccent,
          '--za-color-surface-sunken': user.customTheme.surfaceSubtle,
          '--za-color-gold': user.customTheme.accent,
          '--za-color-gold-hover': user.customTheme.accent,
          '--za-color-gold-dark': user.customTheme.accent,
          '--za-color-text-faint': user.customTheme.textMuted,
        } as React.CSSProperties)
      : {};

  return (
    <div
      className="flex min-h-screen flex-col bg-canvas text-ink"
      data-theme={user.theme || 'parchment'}
      style={customStyles}
    >
      {/* Public Header */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <BrandWordmark />

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--za-space-3)' }}>
            <Link href="/signup" className="za-button za-button--primary">
              Create Your Archive
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 pb-[var(--za-space-12)] pt-[var(--za-space-8)]">
        <div className="za-container max-w-6xl">
          {/* Profile Header Masthead */}
          <div className="za-bookplate relative mb-8 p-6 sm:p-8">
            <span className="za-ribbon-bookmark" aria-hidden="true" />
            <p className="mb-5 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.18em] text-accent">
              Published monograph · public collection
            </p>
            {/* Hero Identity Zone */}
            <div className="flex flex-wrap items-center gap-5">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- compressed data URL avatars, unoptimized by design
                <img
                  src={user.image}
                  alt={`${user.name}'s avatar`}
                  className="h-24 w-24 flex-none rounded-small border-2 border-required object-cover shadow-raised"
                />
              ) : (
                <span
                  className="flex h-24 w-24 flex-none items-center justify-center rounded-small border-2 border-required bg-[var(--za-color-title-tile)] font-[var(--za-font-display)] text-2xl font-[var(--za-weight-heading)] text-[var(--za-color-title-tile-text)] shadow-raised"
                  aria-hidden="true"
                >
                  {getInitials(user.name)}
                </span>
              )}

              <div className="min-w-0 flex-1 basis-64">
                <h1 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase leading-[var(--za-leading-compact)] tracking-[0.03em] text-ink">
                  {user.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-supporting)] text-ink-muted">
                    @{user.username}
                  </span>
                  <span className="inline-flex items-center rounded-small border border-success/40 bg-success-surface px-2 py-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.05em] text-success">
                    Public Archive
                  </span>
                  {user.theme && (
                    <span className="inline-flex items-center rounded-small border border-decorative bg-surface-subtle px-2 py-1 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-muted">
                      {(user.theme && (THEME_LABELS as Record<string, string>)[user.theme]) ??
                        user.theme}
                    </span>
                  )}
                </div>
                <p className="mt-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-faint">
                  Archiving since {formatMonthYear(user.createdAt)}
                </p>
                {user.bio && (
                  <p className="mt-4 max-w-2xl border-l-2 border-accent pl-4 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
                    {user.bio}
                  </p>
                )}
                {publicGoalProgress && (
                  <div className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-decorative py-2 font-[var(--za-font-serif-body)] text-sm text-ink">
                    <span className="font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.06em] text-accent">
                      Reading goal
                    </span>
                    <span className="font-[var(--za-weight-emphasis)]">
                      {currentYear} Reading Challenge:
                    </span>
                    <span>
                      {publicGoalProgress.completedCount} of {publicGoalProgress.annualTarget} books
                      ({publicGoalProgress.percentage}%)
                    </span>
                    {publicGoalProgress.status === 'ahead' && (
                      <span className="text-[11px] font-[var(--za-weight-emphasis)] text-success">
                        · {publicGoalProgress.paceDiff} ahead of pace
                      </span>
                    )}
                    {publicGoalProgress.status === 'behind' && (
                      <span className="text-[11px] font-[var(--za-weight-emphasis)] text-warning">
                        · {Math.abs(publicGoalProgress.paceDiff)} behind pace
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Action Bar */}
              <div className="flex w-full flex-none flex-wrap items-center gap-2 border-t border-decorative pt-4 lg:w-auto lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                <ShareArchiveButton url={profileUrl} />
                {viewer.isLoggedIn && viewer.username && viewer.id !== user.id && (
                  <Link
                    href={`/u/${viewer.username}/compare/${user.username}`}
                    className="za-button za-button--secondary inline-flex items-center gap-1.5 text-xs font-[var(--za-weight-emphasis)] text-accent"
                    title={`Compare your archive with @${user.username}`}
                  >
                    <Sparkles size={13} className="shrink-0 text-accent" />
                    <span>Taste Match</span>
                  </Link>
                )}
                {!viewer.isLoggedIn && (
                  <Link
                    href={`/login?callbackUrl=/u/${user.username}`}
                    className="za-button za-button--secondary inline-flex items-center gap-1.5 text-xs"
                    title="Log in to compare taste with this archive"
                  >
                    <Sparkles size={13} className="shrink-0 text-ink-muted" />
                    <span>Taste Match</span>
                  </Link>
                )}
                <Link
                  href={`/u/${user.username}/wrapped/${currentYear}`}
                  className="za-button za-button--secondary inline-flex items-center text-xs"
                >
                  View Annual Wrapped
                </Link>
                {viewer.isLoggedIn && viewer.id && viewer.id !== user.id && (
                  <FriendButton
                    targetUserId={user.id}
                    initialStatus={friendshipStatus.status}
                    initialIsSender={friendshipStatus.isSender}
                    initialRequestId={friendshipStatus.friendshipId}
                  />
                )}
                {viewer.isLoggedIn && viewer.id === user.id && (
                  <Link
                    href="/settings"
                    className="za-button za-button--secondary inline-flex items-center text-xs"
                  >
                    Edit Profile
                  </Link>
                )}
              </div>
            </div>

            {/* Enriched Stats & Highlights Bar */}
            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden border border-decorative bg-decorative sm:grid-cols-5">
              <div className="flex flex-col items-center bg-surface-subtle px-2 py-4 text-center">
                <div className="font-[var(--za-font-mono)] text-[1.35rem] leading-[1.2] text-ink">
                  {stats.totalEntries}
                </div>
                <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Total Cataloged
                </div>
              </div>
              <div className="flex flex-col items-center bg-surface-subtle px-2 py-4 text-center">
                <div className="font-[var(--za-font-mono)] text-[1.35rem] leading-[1.2] text-success">
                  {stats.completedCount}
                  <span className="text-xs text-ink-muted"> · {stats.completionRate}%</span>
                </div>
                <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Completed · Completion Rate
                </div>
              </div>
              <div className="flex flex-col items-center bg-surface-subtle px-2 py-4 text-center">
                <div className="font-[var(--za-font-mono)] text-[1.35rem] leading-[1.2] text-ink">
                  {stats.totalEpisodes}
                </div>
                <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Episodes Watched
                </div>
              </div>
              <div className="flex flex-col items-center bg-surface-subtle px-2 py-4 text-center">
                <div className="font-[var(--za-font-mono)] text-[1.35rem] leading-[1.2] text-ink">
                  {stats.totalChapters}
                </div>
                <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Chapters Read
                </div>
              </div>
              <div className="flex flex-col items-center bg-surface-subtle px-2 py-4 text-center">
                <div className="za-gold-stamp inline-flex items-center gap-1 font-[var(--za-font-mono)] text-[1.35rem] leading-[1.2]">
                  <Star size={16} fill="currentColor" />
                  {stats.avgRating}
                </div>
                <div className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Avg Rating
                </div>
              </div>
            </div>

            {/* Yearly Contribution Heatmap */}
            <div className="mt-7 border-t border-decorative pt-6">
              <ActivityHeatmap activityMap={activityHeatmap} />
            </div>
          </div>

          {/* Media Grid */}
          <section aria-labelledby="cataloged-titles-heading" className="mt-8">
            <h2
              id="cataloged-titles-heading"
              className="mb-4 flex items-baseline justify-between border-b border-decorative pb-3 font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
            >
              <span>Cataloged Titles</span>
              <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] font-normal tracking-normal text-ink-faint">
                {entries.length} records
              </span>
            </h2>

            {entries.length === 0 ? (
              <div className="za-bookplate relative p-10 text-center">
                <span className="za-ribbon-bookmark" aria-hidden="true" />
                <p className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
                  No titles cataloged yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {entries.map((item, index) => {
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
                      className="za-bookplate relative flex min-w-0 max-w-full flex-col p-4"
                    >
                      <div className="mb-3 flex items-center justify-between border-b border-decorative pb-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.08em] text-ink-faint">
                        <span>Ex libris · {item.category}</span>
                        <span>No. {String(index + 1).padStart(2, '0')}</span>
                      </div>
                      <div className="flex items-start gap-4">
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
                            className="font-[var(--za-font-editorial)] text-xl leading-[var(--za-leading-compact)] text-ink"
                            title={item.title}
                          >
                            {item.title}
                          </h3>

                          <div className="flex flex-wrap items-center gap-[var(--za-space-1)]">
                            <Badge>{item.category}</Badge>
                            <StatusBadge
                              status={item.status}
                              label={(item.status || 'in_progress').replace('_', ' ')}
                            />
                            {item.rating != null && <RatingBadge rating={item.rating} />}
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
                            <div className="mt-3 max-h-20 overflow-hidden text-ellipsis font-[var(--za-font-serif-body)] text-sm text-ink-muted">
                              <MarkdownNotes content={item.notes} />
                            </div>
                          )}

                          {item.quotes && item.quotes.length > 0 && (
                            <div className="mt-3 border-l-2 border-gold bg-gold/10 p-2 font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                              &ldquo;
                              {item.quotes.find((q) => q.isFavorite)?.text || item.quotes[0]?.text}
                              &rdquo;
                              {(item.quotes.find((q) => q.isFavorite)?.speaker ||
                                item.quotes[0]?.speaker) && (
                                <span className="mt-1 block font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] not-italic uppercase tracking-[0.04em] text-ink-faint">
                                  —{' '}
                                  {item.quotes.find((q) => q.isFavorite)?.speaker ||
                                    item.quotes[0]?.speaker}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t border-decorative pt-3">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--za-font-mono)',
                            fontSize: 'var(--za-text-fine)',
                            color: 'var(--za-color-text-faint)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            marginBottom: '0.3rem',
                          }}
                        >
                          <span>Catalog progress</span>
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
