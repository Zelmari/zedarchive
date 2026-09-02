export const revalidate = 86400;

import { parseSearchQuery } from '@/lib/search';
import { searchTvmazeShows } from '@/lib/services/tvmaze';

export async function GET(request: Request): Promise<Response> {
  const parsed = parseSearchQuery(request);
  if (parsed instanceof Response) return parsed;

  const { query } = parsed;
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
