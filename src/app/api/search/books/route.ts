export const revalidate = 86400;

import { parseSearchQuery } from '@/lib/search';
import { searchBooks } from '@/lib/services/openlibrary';

export async function GET(request: Request): Promise<Response> {
  const parsed = parseSearchQuery(request);
  if (parsed instanceof Response) return parsed;

  const { query } = parsed;
  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchBooks(query);
    if (results === null) {
      return Response.json({ results: [], error: 'Search service unavailable' }, { status: 502 });
    }
    return Response.json({ results });
  } catch (error) {
    console.error('Books search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch books' }, { status: 500 });
  }
}
