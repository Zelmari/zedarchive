export const revalidate = 86400;

import { MAX_QUERY_LENGTH } from '@/lib/constants';
import type { SearchResult } from '@/types/search';

interface AniListMedia {
  id: number;
  title?: { romaji?: string | null; english?: string | null };
  coverImage?: { large?: string | null; medium?: string | null };
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  startDate?: { year?: number | null };
}

interface TvmazeShowShape {
  id: number;
  name: string;
  image?: { medium?: string | null; original?: string | null } | null;
  premiered?: string | null;
}

interface TvmazeSeasonShape {
  number?: number | null;
  name?: string | null;
  episodeOrder?: number | null;
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

function httpsCover(url: string | null | undefined): string | null {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url ?? null;
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

async function searchAniList(query: string, isManga: boolean): Promise<SearchResult[] | null> {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // AniList throttles requests without a user agent; the Workers default
      // (undici) is frequently blocked, so send an identifying one.
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

// TVMaze covers most anime series and is reachable from Workers, unlike
// AniList (403 on datacenter IPs) and Jikan (504 from Workers).
async function searchTvmazeAnime(query: string): Promise<SearchResult[] | null> {
  const searchRes = await fetch(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
    {
      next: { revalidate: 86400 },
      headers: { Accept: 'application/json' },
    },
  );

  if (!searchRes.ok) return null;

  const searchData: unknown = await searchRes.json();
  const topResults = Array.isArray(searchData)
    ? (searchData as { show?: TvmazeShowShape }[]).slice(0, 5)
    : [];

  const results = await Promise.all(
    topResults.map(async ({ show }): Promise<SearchResult | null> => {
      if (!show) return null;

      let seasons: TvmazeSeasonShape[] = [];
      try {
        const seasonsRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/seasons`, {
          next: { revalidate: 86400 },
          headers: { Accept: 'application/json' },
        });
        if (seasonsRes.ok) {
          seasons = (await seasonsRes.json()) as TvmazeSeasonShape[];
        }
      } catch {
        seasons = [];
      }

      const structureArray = Array.isArray(seasons)
        ? seasons
            .filter((s) => s.number !== null && s.number !== undefined && (s.number ?? 0) > 0)
            .map((s) => ({
              number: s.number as number,
              name: s.name ? s.name : `Season ${s.number}`,
              total: s.episodeOrder || null,
            }))
        : [];

      const coverUrl = httpsCover(show.image?.medium || show.image?.original);

      return {
        sourceId: `tvmaze-${show.id}`,
        category: 'anime',
        title: show.name,
        coverUrl,
        primaryUnitTotal: structureArray.length || 1,
        structure: structureArray,
        secondaryUnitTotal: structureArray[0]?.total || null,
        year: show.premiered ? show.premiered.substring(0, 4) : null,
      };
    }),
  );

  const filtered = results.filter((r): r is SearchResult => r !== null);
  return filtered.length > 0 ? filtered : null;
}

// Manga volumes are published as books, so Google Books (reachable from
// Workers) serves as the manga fallback, with Open Library as a second
// fallback when Google blocks datacenter IPs.
async function searchGoogleBooksManga(query: string): Promise<SearchResult[] | null> {
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

async function searchOpenLibraryManga(query: string): Promise<SearchResult[] | null> {
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

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ results: [], error: 'Query too long' }, { status: 400 });
  }

  const rawType = (
    searchParams.get('type') ||
    searchParams.get('category') ||
    'ANIME'
  ).toUpperCase();
  const isManga = rawType === 'MANGA';

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
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

    if (!results) {
      return Response.json({ results: [], error: 'Search service unavailable' }, { status: 502 });
    }

    return Response.json({ results });
  } catch (error) {
    console.error('AniList search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch anime/manga' }, { status: 500 });
  }
}
