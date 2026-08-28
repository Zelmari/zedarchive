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
