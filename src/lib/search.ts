import { MAX_QUERY_LENGTH } from '@/lib/constants';
import type { MediaCategory } from '@/types/media';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit';

export interface ParsedSearchQuery {
  query: string;
  searchParams: URLSearchParams;
}

export function jsonSearchError(message: string, status: number): Response {
  return Response.json({ results: [], error: message }, { status });
}

export function parseSearchQuery(request: Request): ParsedSearchQuery | Response {
  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    if (!checkRateLimit('search', clientKeyFromRequest(request), 60, 60_000)) {
      return jsonSearchError('Too many searches. Please wait a moment.', 429);
    }
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();

  if (query.length > MAX_QUERY_LENGTH) {
    return jsonSearchError('Query too long', 400);
  }

  return { query, searchParams };
}

const SEARCH_ENDPOINTS: Record<MediaCategory, string> = {
  show: '/api/search/shows',
  movie: '/api/search/movies',
  book: '/api/search/books',
  anime: '/api/search/anime',
  manga: '/api/search/anime',
};

export function endpointFor(category: MediaCategory, query: string): string {
  const categoryParam = category === 'anime' || category === 'manga' ? `&category=${category}` : '';
  return `${SEARCH_ENDPOINTS[category]}?q=${encodeURIComponent(query)}${categoryParam}`;
}
