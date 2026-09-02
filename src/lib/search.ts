import { MAX_QUERY_LENGTH } from '@/lib/constants';
import type { MediaCategory } from '@/types/media';

export interface ParsedSearchQuery {
  query: string;
  searchParams: URLSearchParams;
}

export function jsonSearchError(message: string, status: number): Response {
  return Response.json({ results: [], error: message }, { status });
}

export function parseSearchQuery(request: Request): ParsedSearchQuery | Response {
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
