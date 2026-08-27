import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import type { NextAirInfo } from '@/types/media';

interface TvmazeEpisodeEmbed {
  season?: number;
  number?: number;
  airdate?: string;
  airstamp?: string | null;
}

interface TvmazeShowDetails {
  id?: number;
  status?: string;
  _embedded?: {
    nextepisode?: TvmazeEpisodeEmbed | null;
    previousepisode?: TvmazeEpisodeEmbed | null;
  };
}

interface AnimeScheduleAnime {
  title?: string;
  status?: string;
  episodes?: number;
  premier?: string;
  subTime?: string;
  episodeOverride?: { overrideDate?: string; overrideEpisode?: number; episodesAired?: number };
  delayedUntil?: string;
  websites?: { aniList?: string; mal?: string };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function validDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d;
}

/** Extract a numeric id from an external-site URL like "anilist.co/anime/188139/…". */
function extractIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

/**
 * Compute the next episode number and date from an AnimeSchedule anime
 * object, mirroring the math their site uses (weekly cadence anchored on
 * the premiere/sub time, with delay and override corrections).
 */
function computeAnimeNextAir(anime: AnimeScheduleAnime, now: number): NextAirInfo | null {
  if (anime.status !== 'Ongoing') return null;

  const overrideDate = validDate(anime.episodeOverride?.overrideDate);
  const overrideEpisode = anime.episodeOverride?.overrideEpisode ?? 0;

  let nextEp = 0;
  let anchor: Date | null;

  if (overrideEpisode > 0 && overrideDate) {
    nextEp = overrideEpisode + 1;
    anchor = overrideDate;
  } else {
    const subTime = validDate(anime.subTime);
    const premier = validDate(anime.premier);
    anchor = subTime ?? premier;
    if (anchor) {
      const elapsedWeeks = (now - anchor.getTime()) / WEEK_MS;
      nextEp = Math.max(1, Math.ceil(elapsedWeeks + 1e-6) + 1);
    }
  }

  if (!anchor || nextEp < 1) return null;

  if (anime.episodes && anime.episodes > 0 && nextEp > anime.episodes) {
    return null;
  }

  let nextDate = new Date(anchor.getTime() + (nextEp - 1) * WEEK_MS);
  const delayedUntil = validDate(anime.delayedUntil);
  if (delayedUntil && delayedUntil.getTime() > nextDate.getTime()) {
    nextDate = delayedUntil;
  }

  return {
    season: 1,
    number: nextEp,
    airdate: nextDate.toISOString().slice(0, 10),
    airstamp: null,
    status: 'RELEASING',
  };
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await fn(item);
    }
  });
  await Promise.all(workers);
}

async function fetchTvmazeAirdates(
  ids: Array<{ sourceId: string; id: string }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  await Promise.all(
    ids.map(async ({ sourceId, id }) => {
      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${id}?embed=nextepisode&embed=previousepisode`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!res.ok) return;

        const data: TvmazeShowDetails = await res.json();
        const status = data.status || 'Running';

        // Suppress on Ended and In Development
        if (status === 'Ended' || status === 'In Development') {
          return;
        }

        const nextEp = data._embedded?.nextepisode;
        if (nextEp && nextEp.airdate) {
          result[sourceId] = {
            season: typeof nextEp.season === 'number' ? nextEp.season : 1,
            number: typeof nextEp.number === 'number' ? nextEp.number : 1,
            airdate: nextEp.airdate,
            airstamp: nextEp.airstamp || null,
            status,
          };
        }
      } catch (err) {
        console.warn(`[airdate] TVMaze lookup failed for ${sourceId}:`, err);
      }
    }),
  );
}

/**
 * Resolve next-episode airdates for anime through the AnimeSchedule API —
 * the one provider reachable from Cloudflare Workers that carries the
 * scheduling data. AniList (403 on datacenter IPs), Kitsu (unreliable
 * nextRelease), and Jikan (intermittent 504s) are not viable.
 *
 * Each anime is looked up by title and only accepted when the result's
 * AniList/MAL website link matches the stored source id, preventing
 * misattributed dates from similar-titled shows.
 */
async function fetchAnimeScheduleAirdates(
  items: Array<{ sourceId: string; title: string; lookupId: string; idKind: 'anilist' | 'mal' }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  const now = Date.now();

  await mapWithConcurrency(items, 3, async ({ sourceId, title, lookupId, idKind }) => {
    if (!title) return;
    try {
      const res = await fetch(
        `https://animeschedule.net/api/v3/anime?q=${encodeURIComponent(title)}&limit=3`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'zedarchive/0.1 (https://zedarchive.com; media tracking app)',
          },
        },
      );

      if (!res.ok) return;

      const data = (await res.json()) as { anime?: AnimeScheduleAnime[] };
      const match = (data.anime ?? []).find((anime) => {
        const websites = anime.websites ?? {};
        const externalUrl = idKind === 'anilist' ? websites.aniList : websites.mal;
        return extractIdFromUrl(externalUrl) === lookupId;
      });

      if (!match) return;

      const nextAir = computeAnimeNextAir(match, now);
      if (nextAir) {
        result[sourceId] = nextAir;
      }
    } catch (err) {
      console.warn(`[airdate] AnimeSchedule lookup failed for ${sourceId}:`, err);
    }
  });
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids') || '';
  const rawIds = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (rawIds.length === 0) {
    return Response.json(
      {},
      {
        headers: {
          'Cache-Control': 'public, max-age=21600',
        },
      },
    );
  }

  const titlesParam = searchParams.get('titles') || '';
  let titles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(titlesParam);
    if (Array.isArray(parsed)) {
      titles = parsed.map((t) => String(t ?? ''));
    }
  } catch {
    titles = [];
  }

  const result: Record<string, NextAirInfo> = {};
  const tvmazeIds: Array<{ sourceId: string; id: string }> = [];
  const animeItems: Array<{
    sourceId: string;
    title: string;
    lookupId: string;
    idKind: 'anilist' | 'mal';
  }> = [];

  rawIds.forEach((sourceId, index) => {
    const tvmazeMatch = sourceId.match(/^tvmaze-(\d+)$/);
    if (tvmazeMatch?.[1]) {
      tvmazeIds.push({ sourceId, id: tvmazeMatch[1] });
      return;
    }
    const anilistMatch = sourceId.match(/^anilist-(\d+)$/);
    if (anilistMatch?.[1]) {
      animeItems.push({
        sourceId,
        title: titles[index] ?? '',
        lookupId: anilistMatch[1],
        idKind: 'anilist',
      });
      return;
    }
    const malMatch = sourceId.match(/^mal-(\d+)$/);
    if (malMatch?.[1]) {
      animeItems.push({
        sourceId,
        title: titles[index] ?? '',
        lookupId: malMatch[1],
        idKind: 'mal',
      });
    }
  });

  await Promise.all([
    fetchTvmazeAirdates(tvmazeIds, result),
    fetchAnimeScheduleAirdates(animeItems, result),
  ]);

  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=21600',
    },
  });
}
