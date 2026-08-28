export const dynamic = 'force-dynamic';
export const revalidate = 86400;

import { MAX_QUERY_LENGTH } from '@/lib/constants';
import { searchTmdbMovies } from '@/lib/services/tmdb';

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
    const results = await searchTmdbMovies(query);
    if (results === null) {
      return Response.json(
        {
          results: [],
          configured: false,
          message:
            'TMDB API key not configured. Use manual entry or configure TMDB_API_READ_TOKEN.',
        },
        { status: 200 },
      );
    }

    return Response.json(
      { results, configured: true },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    console.error('TMDB movie search error:', error);
    return Response.json({ results: [], error: 'Failed to search movies' }, { status: 500 });
  }
}
