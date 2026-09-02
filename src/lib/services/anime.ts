import type { SearchResult } from '@/types/search';
import type { NextAirInfo } from '@/types/media';
import { httpsCover } from '@/lib/format';
import { searchGoogleBooks, searchOpenLibrary } from './openlibrary';
import { searchTvmazeAnime } from './tvmaze';

interface AniListMedia {
  id: number;
  title?: { romaji?: string | null; english?: string | null };
  coverImage?: { large?: string | null; medium?: string | null };
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  startDate?: { year?: number | null };
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

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 5) {
    media(search: $search, type: $type, sort: POPULARITY_DESC) {
      id
      title {
        romaji
        english
      }
      coverImage {
        large
        medium
      }
      episodes
      chapters
      volumes
      format
      startDate {
        year
      }
    }
  }
}
`;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function anilistGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  revalidate: number,
): Promise<T | null> {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'zedarchive/0.1 (https://zedarchive.com; media tracking app)',
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as { data?: T };
  return json.data ?? null;
}

function validDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d;
}

function extractIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

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

function toAnimeResult(
  item: AniListMedia,
  isManga: boolean,
  sourcePrefix = 'anilist',
): SearchResult {
  const title = item.title?.english || item.title?.romaji || 'Unknown Title';
  const coverUrl = httpsCover(item.coverImage?.large || item.coverImage?.medium);

  if (isManga) {
    const volumeCount = item.volumes || 1;
    const structure = item.volumes
      ? Array.from({ length: item.volumes }, (_, i) => ({
          number: i + 1,
          name: `Volume ${i + 1}`,
          total: null,
        }))
      : [];

    return {
      sourceId: `${sourcePrefix}-${item.id}`,
      category: 'manga',
      title,
      coverUrl,
      primaryUnitTotal: volumeCount,
      structure,
      secondaryUnitTotal: item.chapters || null,
      year: item.startDate?.year ? String(item.startDate.year) : null,
    };
  }

  const structure = item.episodes ? [{ number: 1, name: 'Season 1', total: item.episodes }] : [];

  return {
    sourceId: `${sourcePrefix}-${item.id}`,
    category: 'anime',
    title,
    coverUrl,
    primaryUnitTotal: 1,
    structure,
    secondaryUnitTotal: item.episodes || null,
    year: item.startDate?.year ? String(item.startDate.year) : null,
  };
}

export async function searchAniList(
  query: string,
  isManga: boolean,
): Promise<SearchResult[] | null> {
  const data = await anilistGraphql<{ Page?: { media?: AniListMedia[] } }>(
    ANILIST_QUERY,
    {
      search: query,
      type: isManga ? 'MANGA' : 'ANIME',
    },
    86400,
  );
  if (!data) return null;

  const mediaList = data.Page?.media ?? [];
  return mediaList.map((item) => toAnimeResult(item, isManga, 'anilist'));
}

export async function searchAnimeAndManga(
  query: string,
  isManga: boolean,
): Promise<SearchResult[] | null> {
  let results = await searchAniList(query, isManga);

  if (!results?.length && isManga) {
    results = await searchGoogleBooks(query, { category: 'manga', querySuffix: 'manga' });
  }
  if (!results?.length && isManga) {
    results = await searchOpenLibrary(query, { category: 'manga', querySuffix: 'manga' });
  }
  if (!results?.length && !isManga) {
    results = await searchTvmazeAnime(query);
  }

  return results;
}

interface AniListRelationNode {
  id: number;
  format?: string | null;
  status?: string | null;
  title?: { romaji?: string | null; english?: string | null };
  nextAiringEpisode?: {
    airingAt: number;
    episode: number;
    timeUntilAiring?: number;
  } | null;
  relations?: {
    edges?: Array<{
      relationType: string;
      node: AniListRelationNode;
    }>;
  };
}

const ANILIST_AIR_INFO_FRAGMENT = `
fragment AirInfo on Media {
  nextAiringEpisode {
    airingAt
    episode
    timeUntilAiring
  }
}
`;

const ANILIST_RELATIONS_QUERY = `
${ANILIST_AIR_INFO_FRAGMENT}
query ($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    id
    status
    title {
      romaji
      english
    }
    ...AirInfo
    relations {
      edges {
        relationType
        node {
          id
          format
          status
          title {
            romaji
            english
          }
          ...AirInfo
          relations {
            edges {
              relationType
              node {
                id
                format
                status
                title {
                  romaji
                  english
                }
                ...AirInfo
              }
            }
          }
        }
      }
    }
  }
}
`;

function toNextAir(node: AniListRelationNode, season: number): NextAirInfo | null {
  if (node.status !== 'RELEASING' || !node.nextAiringEpisode) return null;

  const airDate = new Date(node.nextAiringEpisode.airingAt * 1000);
  return {
    season,
    number: node.nextAiringEpisode.episode,
    airdate: airDate.toISOString().slice(0, 10),
    airstamp: airDate.toISOString(),
    status: 'RELEASING',
    sequelTitle: node.title?.english || node.title?.romaji || null,
  };
}

/**
 * Traverses AniList relations graph following SEQUEL edges to find an active airing season.
 */
export async function resolveAniListAiringSequel(
  id: number | null,
  idMal: number | null,
): Promise<NextAirInfo | null> {
  if (!id && !idMal) return null;

  try {
    const data = await anilistGraphql<{ Media?: AniListRelationNode }>(
      ANILIST_RELATIONS_QUERY,
      id ? { id } : { idMal },
      21600,
    );
    const media = data?.Media;
    if (!media) return null;

    const directAir = toNextAir(media, 1);
    if (directAir) return directAir;

    const edges = media.relations?.edges || [];
    const sequelEdges = edges.filter(
      (e) =>
        e.relationType === 'SEQUEL' &&
        e.node &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || !e.node.format),
    );

    for (const edge of sequelEdges) {
      const node = edge.node;
      const sequelAir = toNextAir(node, 2);
      if (sequelAir) return sequelAir;

      const nestedSequels = (node.relations?.edges || []).filter(
        (ne) => ne.relationType === 'SEQUEL' && ne.node,
      );
      for (const nestedEdge of nestedSequels) {
        const nestedNode = nestedEdge.node;
        const nestedAir = toNextAir(nestedNode, 3);
        if (nestedAir) return nestedAir;
      }
    }

    return null;
  } catch (err) {
    console.warn(`[airdate] AniList sequel resolution error:`, err);
    return null;
  }
}

export async function fetchAnimeScheduleAirdates(
  items: Array<{ sourceId: string; title: string; lookupId: string; idKind: 'anilist' | 'mal' }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  const now = Date.now();

  await mapWithConcurrency(items, 3, async ({ sourceId, title, lookupId, idKind }) => {
    try {
      let matchedAirInfo: NextAirInfo | null = null;

      // 1. Primary AnimeSchedule lookup by Title
      if (title) {
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

          if (res.ok) {
            const data = (await res.json()) as { anime?: AnimeScheduleAnime[] };
            const match = (data.anime ?? []).find((anime) => {
              const websites = anime.websites ?? {};
              const externalUrl = idKind === 'anilist' ? websites.aniList : websites.mal;
              return extractIdFromUrl(externalUrl) === lookupId;
            });

            if (match) {
              matchedAirInfo = computeAnimeNextAir(match, now);
            }
          }
        } catch {
          // Fall through to AniList traversal
        }
      }

      // 2. If AnimeSchedule returned null (e.g. Finished or missing), follow AniList sequel graph
      if (!matchedAirInfo) {
        const parsedId = parseInt(lookupId, 10);
        if (!isNaN(parsedId) && parsedId > 0) {
          const anilistId = idKind === 'anilist' ? parsedId : null;
          const malId = idKind === 'mal' ? parsedId : null;
          matchedAirInfo = await resolveAniListAiringSequel(anilistId, malId);
        }
      }

      if (matchedAirInfo) {
        result[sourceId] = matchedAirInfo;
      }
    } catch (err) {
      console.warn(`[airdate] Lookup failed for ${sourceId}:`, err);
    }
  });
}

export type EpisodeCanonType = 'canon' | 'filler' | 'recap' | 'mixed';

export interface AnimeFillerMap {
  malId: number;
  totalEpisodes: number;
  episodes: Record<number, { type: EpisodeCanonType; title?: string }>;
}

interface JikanEpisodeItem {
  mal_id: number;
  title?: string | null;
  episode?: string | number;
  aired?: string | null;
  filler?: boolean;
  recap?: boolean;
  forum_url?: string | null;
}

let lastJikanRequestTime = 0;
const JIKAN_MIN_INTERVAL_MS = 350;

async function jikanFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLast = now - lastJikanRequestTime;
  if (timeSinceLast < JIKAN_MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, JIKAN_MIN_INTERVAL_MS - timeSinceLast));
  }
  lastJikanRequestTime = Date.now();

  let res = await fetch(url, {
    next: { revalidate: 2592000 },
    headers: { Accept: 'application/json', 'User-Agent': 'zedarchive/0.1' },
  });

  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    lastJikanRequestTime = Date.now();
    res = await fetch(url, {
      next: { revalidate: 2592000 },
      headers: { Accept: 'application/json', 'User-Agent': 'zedarchive/0.1' },
    });
  }

  return res;
}

export async function fetchAnimeFillerGuide(malId: number): Promise<AnimeFillerMap | null> {
  const url = `https://api.jikan.moe/v4/anime/${malId}/episodes`;
  try {
    const res = await jikanFetch(url);

    if (!res.ok) return null;
    const json = (await res.json()) as { data?: JikanEpisodeItem[] };
    const rawList: JikanEpisodeItem[] = json.data || [];

    const episodeMap: Record<number, { type: EpisodeCanonType; title?: string }> = {};
    for (const ep of rawList) {
      const epNum =
        typeof ep.episode === 'number' ? ep.episode : parseInt(String(ep.episode || ep.mal_id), 10);
      if (isNaN(epNum) || epNum <= 0) continue;
      let type: EpisodeCanonType = 'canon';
      if (ep.filler) type = 'filler';
      else if (ep.recap) type = 'recap';

      episodeMap[epNum] = { type, title: ep.title || undefined };
    }

    return {
      malId,
      totalEpisodes: rawList.length,
      episodes: episodeMap,
    };
  } catch {
    return null;
  }
}

export async function resolveMalId(
  sourceId?: string | null,
  title?: string | null,
): Promise<number | null> {
  if (sourceId?.startsWith('mal-')) {
    const parsed = parseInt(sourceId.replace('mal-', ''), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  if (sourceId?.startsWith('anilist-')) {
    const anilistId = parseInt(sourceId.replace('anilist-', ''), 10);
    if (!isNaN(anilistId) && anilistId > 0) {
      try {
        const query = `query ($id: Int) { Media(id: $id, type: ANIME) { idMal } }`;
        const data = await anilistGraphql<{ Media?: { idMal?: number | null } }>(
          query,
          { id: anilistId },
          2592000,
        );
        const idMal = data?.Media?.idMal;
        if (idMal && idMal > 0) return idMal;
      } catch {
        // Fallback to title search
      }
    }
  }

  if (title?.trim()) {
    try {
      const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title.trim())}&limit=1`;
      const searchRes = await jikanFetch(searchUrl);
      if (searchRes.ok) {
        const searchJson = (await searchRes.json()) as { data?: Array<{ mal_id: number }> };
        const match = searchJson.data?.[0]?.mal_id;
        if (match && match > 0) return match;
      }
    } catch {
      return null;
    }
  }

  return null;
}
