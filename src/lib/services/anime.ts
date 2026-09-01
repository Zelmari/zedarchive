import type { SearchResult } from '@/types/search';
import type { NextAirInfo } from '@/types/media';
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

function httpsCover(url: string | null | undefined): string | null {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url ?? null;
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
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'zedarchive/0.1 (https://zedarchive.com; media tracking app)',
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: {
        search: query,
        type: isManga ? 'MANGA' : 'ANIME',
      },
    }),
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return null;
  }

  const json: unknown = await response.json();
  const mediaList =
    (json as { data?: { Page?: { media?: AniListMedia[] } } })?.data?.Page?.media || [];
  return mediaList.map((item) => toAnimeResult(item, isManga, 'anilist'));
}

export async function searchGoogleBooksManga(query: string): Promise<SearchResult[] | null> {
  const gbooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`${query} manga`)}&maxResults=5`;
  const gbooksRes = await fetch(gbooksUrl, {
    next: { revalidate: 86400 },
    headers: { Accept: 'application/json' },
  });

  if (!gbooksRes.ok) return null;

  const gbooksData: unknown = await gbooksRes.json();
  const items = (gbooksData as { items?: unknown[] }).items;
  if (!Array.isArray(items) || items.length === 0) return null;

  return items.map((rawItem): SearchResult => {
    const item = rawItem as { id: number; volumeInfo?: Record<string, unknown> };
    const info = item.volumeInfo || {};
    const imageLinks = info.imageLinks as
      { thumbnail?: string; smallThumbnail?: string } | undefined;
    const coverUrl = httpsCover(imageLinks?.thumbnail || imageLinks?.smallThumbnail);

    return {
      sourceId: `gbooks-${item.id}`,
      category: 'manga',
      title: (info.title as string) || 'Unknown Title',
      coverUrl,
      primaryUnitTotal: 1,
      structure: [],
      secondaryUnitTotal: typeof info.pageCount === 'number' ? info.pageCount : null,
      authors: Array.isArray(info.authors) ? info.authors.join(', ') : null,
      year: info.publishedDate ? String(info.publishedDate).substring(0, 4) : null,
    };
  });
}

export async function searchOpenLibraryManga(query: string): Promise<SearchResult[] | null> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(`${query} manga`)}&limit=5`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const docs = Array.isArray(data.docs) ? (data.docs as Record<string, unknown>[]) : [];
  if (docs.length === 0) return null;

  return docs.map((doc): SearchResult => {
    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${String(doc.cover_i)}-M.jpg`
      : null;

    const cleanKey = doc.key ? String(doc.key).replace(/^\/works\//, '') : null;

    return {
      sourceId: `openlib-${cleanKey || doc.title || query}`,
      category: 'manga',
      title: (doc.title as string) || 'Unknown Title',
      coverUrl,
      primaryUnitTotal: 1,
      structure: [],
      secondaryUnitTotal: (doc.number_of_pages_median as number) || null,
      authors: Array.isArray(doc.author_name) ? doc.author_name.join(', ') : null,
      year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    };
  });
}

export async function searchAnimeAndManga(
  query: string,
  isManga: boolean,
): Promise<SearchResult[] | null> {
  let results = await searchAniList(query, isManga);

  if (!results && isManga) {
    results = await searchGoogleBooksManga(query);
  }
  if (!results && isManga) {
    results = await searchOpenLibraryManga(query);
  }
  if (!results && !isManga) {
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

const ANILIST_RELATIONS_QUERY = `
query ($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    id
    status
    title {
      romaji
      english
    }
    nextAiringEpisode {
      airingAt
      episode
      timeUntilAiring
    }
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
          nextAiringEpisode {
            airingAt
            episode
            timeUntilAiring
          }
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
                nextAiringEpisode {
                  airingAt
                  episode
                  timeUntilAiring
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

/**
 * Traverses AniList relations graph following SEQUEL edges to find an active airing season.
 */
export async function resolveAniListAiringSequel(
  id: number | null,
  idMal: number | null,
  currentDepth = 1,
  maxDepth = 3,
  visited = new Set<number>(),
): Promise<NextAirInfo | null> {
  if ((!id && !idMal) || currentDepth > maxDepth) return null;
  const lookupKey = id ?? idMal ?? 0;
  if (visited.has(lookupKey)) return null;
  visited.add(lookupKey);

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'zedarchive/0.1 (https://zedarchive.com; media tracking app)',
      },
      body: JSON.stringify({
        query: ANILIST_RELATIONS_QUERY,
        variables: id ? { id } : { idMal },
      }),
      next: { revalidate: 21600 },
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        Media?: {
          id: number;
          status: string;
          title?: { romaji?: string; english?: string };
          nextAiringEpisode?: { airingAt: number; episode: number } | null;
          relations?: {
            edges?: Array<{
              relationType: string;
              node: AniListRelationNode;
            }>;
          };
        };
      };
    };

    const media = json.data?.Media;
    if (!media) return null;

    // Direct check on root
    if (media.status === 'RELEASING' && media.nextAiringEpisode) {
      const airDate = new Date(media.nextAiringEpisode.airingAt * 1000);
      return {
        season: currentDepth,
        number: media.nextAiringEpisode.episode,
        airdate: airDate.toISOString().slice(0, 10),
        airstamp: airDate.toISOString(),
        status: 'RELEASING',
        sequelTitle: media.title?.english || media.title?.romaji || null,
      };
    }

    // Inspect SEQUEL edges
    const edges = media.relations?.edges || [];
    const sequelEdges = edges.filter(
      (e) =>
        e.relationType === 'SEQUEL' &&
        e.node &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || !e.node.format),
    );

    for (const edge of sequelEdges) {
      const node = edge.node;
      if (node.status === 'RELEASING' && node.nextAiringEpisode) {
        const airDate = new Date(node.nextAiringEpisode.airingAt * 1000);
        return {
          season: currentDepth + 1,
          number: node.nextAiringEpisode.episode,
          airdate: airDate.toISOString().slice(0, 10),
          airstamp: airDate.toISOString(),
          status: 'RELEASING',
          sequelTitle: node.title?.english || node.title?.romaji || null,
        };
      }

      // Check depth 3 nested node if available in response
      const nestedSequels = (node.relations?.edges || []).filter(
        (ne) => ne.relationType === 'SEQUEL' && ne.node,
      );
      for (const nestedEdge of nestedSequels) {
        const nestedNode = nestedEdge.node;
        if (nestedNode.status === 'RELEASING' && nestedNode.nextAiringEpisode) {
          const airDate = new Date(nestedNode.nextAiringEpisode.airingAt * 1000);
          return {
            season: currentDepth + 2,
            number: nestedNode.nextAiringEpisode.episode,
            airdate: airDate.toISOString().slice(0, 10),
            airstamp: airDate.toISOString(),
            status: 'RELEASING',
            sequelTitle: nestedNode.title?.english || nestedNode.title?.romaji || null,
          };
        }
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
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'zedarchive/0.1',
          },
          body: JSON.stringify({ query, variables: { id: anilistId } }),
          next: { revalidate: 2592000 },
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: { Media?: { idMal?: number | null } } };
          const idMal = json.data?.Media?.idMal;
          if (idMal && idMal > 0) return idMal;
        }
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
