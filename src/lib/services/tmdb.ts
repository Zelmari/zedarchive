import type { SearchResult } from '@/types/search';

interface TmdbSearchMovie {
  id: number;
  title: string;
  poster_path?: string | null;
  release_date?: string | null;
  overview?: string | null;
  genre_ids?: number[];
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  runtime?: number | null;
  genres?: Array<{ id: number; name: string }>;
  poster_path?: string | null;
  release_date?: string | null;
  tagline?: string | null;
}

function getAuthHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  // TMDB v4 Read Access Tokens are JWT-like Bearer tokens (long string)
  // TMDB v3 API Keys are 32 hex characters
  if (token.length > 40) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function getSearchUrl(query: string, token: string): string {
  const base = 'https://api.themoviedb.org/3/search/movie';
  const params = new URLSearchParams({
    query: query.trim(),
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  });
  if (token.length <= 40) {
    params.set('api_key', token);
  }
  return `${base}?${params.toString()}`;
}

function getDetailsUrl(id: number, token: string): string {
  const base = `https://api.themoviedb.org/3/movie/${id}`;
  const params = new URLSearchParams({ language: 'en-US' });
  if (token.length <= 40) {
    params.set('api_key', token);
  }
  return `${base}?${params.toString()}`;
}

export async function searchTmdbMovies(query: string): Promise<SearchResult[] | null> {
  const token = process.env.TMDB_API_READ_TOKEN || process.env.TMDB_API_KEY;
  if (!token) {
    return null;
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return [];
  }

  const searchUrl = getSearchUrl(cleanQuery, token);
  const searchRes = await fetch(searchUrl, {
    next: { revalidate: 86400 },
    headers: getAuthHeaders(token),
  });

  if (!searchRes.ok) {
    throw new Error(`TMDB search failed with status ${searchRes.status}`);
  }

  const searchData = (await searchRes.json()) as { results?: TmdbSearchMovie[] };
  const topMovies = (searchData.results || []).slice(0, 6);

  if (topMovies.length === 0) {
    return [];
  }

  const detailedResults = await Promise.allSettled(
    topMovies.map(async (movie): Promise<SearchResult> => {
      let runtime: number | null = null;

      try {
        const detailsUrl = getDetailsUrl(movie.id, token);
        const detailsRes = await fetch(detailsUrl, {
          next: { revalidate: 86400 },
          headers: getAuthHeaders(token),
        });
        if (detailsRes.ok) {
          const details = (await detailsRes.json()) as TmdbMovieDetails;
          if (typeof details.runtime === 'number' && details.runtime > 0) {
            runtime = details.runtime;
          }
        }
      } catch {
        // Fallback gracefully without runtime
      }

      const posterUrl = movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null;

      const year = movie.release_date ? movie.release_date.substring(0, 4) : null;

      return {
        sourceId: `tmdb-${movie.id}`,
        category: 'movie',
        title: movie.title,
        coverUrl: posterUrl,
        primaryUnitTotal: 1,
        structure: [],
        secondaryUnitTotal: runtime,
        year,
      };
    }),
  );

  return detailedResults
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export interface WatchProviderItem {
  id: number;
  name: string;
  logoPath: string;
}

export interface WatchProvidersResult {
  link?: string;
  flatrate?: WatchProviderItem[];
  rent?: WatchProviderItem[];
  buy?: WatchProviderItem[];
  free?: WatchProviderItem[];
}

export async function fetchWatchProviders(
  tmdbId: number,
  category: 'movie' | 'show' | 'anime' = 'movie',
  countryCode = 'US',
): Promise<WatchProvidersResult | null> {
  const token = process.env.TMDB_API_READ_TOKEN || process.env.TMDB_API_KEY;
  if (!token) {
    return null;
  }

  const endpoint = category === 'movie' ? 'movie' : 'tv';
  const base = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/watch/providers`;
  const params = new URLSearchParams();
  if (token.length <= 40) {
    params.set('api_key', token);
  }
  const url = params.toString() ? `${base}?${params.toString()}` : base;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { results?: Record<string, Record<string, unknown>> };
    const countryData = data.results?.[countryCode.toUpperCase()];
    if (!countryData) {
      return null;
    }

    const mapProviders = (items?: unknown): WatchProviderItem[] => {
      if (!Array.isArray(items)) return [];
      return items.map((item: Record<string, unknown>) => ({
        id: Number(item.provider_id || 0),
        name: String(item.provider_name || ''),
        logoPath: item.logo_path ? `https://image.tmdb.org/t/p/original${item.logo_path}` : '',
      }));
    };

    return {
      link: typeof countryData.link === 'string' ? countryData.link : undefined,
      flatrate: mapProviders(countryData.flatrate),
      rent: mapProviders(countryData.rent),
      buy: mapProviders(countryData.buy),
      free: mapProviders(countryData.free ?? countryData.ads),
    };
  } catch {
    return null;
  }
}

export async function resolveTmdbId(
  sourceId?: string | null,
  title?: string | null,
  category: 'movie' | 'show' | 'anime' = 'movie',
): Promise<number | null> {
  const token = process.env.TMDB_API_READ_TOKEN || process.env.TMDB_API_KEY;
  if (!token) return null;

  // 1. Direct TMDB source ID
  if (sourceId?.startsWith('tmdb-')) {
    const rawId = parseInt(sourceId.replace('tmdb-', ''), 10);
    if (!isNaN(rawId) && rawId > 0) return rawId;
  }

  // 2. TVMaze external lookup to IMDb -> TMDB Find
  if (sourceId?.startsWith('tvmaze-')) {
    const tvmazeId = sourceId.replace('tvmaze-', '');
    try {
      const tvmRes = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}`, {
        next: { revalidate: 86400 },
        headers: { Accept: 'application/json' },
      });
      if (tvmRes.ok) {
        const tvmData = (await tvmRes.json()) as { externals?: { imdb?: string | null } };
        const imdbId = tvmData.externals?.imdb;
        if (imdbId) {
          const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id${
            token.length <= 40 ? `&api_key=${token}` : ''
          }`;
          const findRes = await fetch(findUrl, {
            next: { revalidate: 86400 },
            headers: getAuthHeaders(token),
          });
          if (findRes.ok) {
            const findData = (await findRes.json()) as {
              movie_results?: Array<{ id: number }>;
              tv_results?: Array<{ id: number }>;
            };
            const match =
              category === 'movie'
                ? findData.movie_results?.[0]?.id
                : (findData.tv_results?.[0]?.id ?? findData.movie_results?.[0]?.id);
            if (match) return match;
          }
        }
      }
    } catch {
      // Continue to title search fallback
    }
  }

  // 3. Fallback search by title
  if (title?.trim()) {
    try {
      const endpoint = category === 'movie' ? 'movie' : 'tv';
      const searchUrl = `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(
        title.trim(),
      )}&include_adult=false&language=en-US&page=1${token.length <= 40 ? `&api_key=${token}` : ''}`;
      const searchRes = await fetch(searchUrl, {
        next: { revalidate: 86400 },
        headers: getAuthHeaders(token),
      });
      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as { results?: Array<{ id: number }> };
        if (searchData.results && searchData.results.length > 0 && searchData.results[0]?.id) {
          return searchData.results[0].id;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}
