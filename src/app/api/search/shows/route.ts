export const revalidate = 86400;

import { MAX_QUERY_LENGTH } from '@/lib/constants';
import { searchTvmazeShows } from '@/lib/services/tvmaze';

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
    const results = await searchTvmazeShows(query);
    return Response.json({ results });
  } catch (error) {
    console.error('TVMaze search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch TV shows' }, { status: 500 });
  }
}
