export const revalidate = 86400;

import { MAX_QUERY_LENGTH } from '@/lib/constants';
import { searchBooks } from '@/lib/services/openlibrary';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ results: [], error: 'Query too long' }, { status: 400 });
  }

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
