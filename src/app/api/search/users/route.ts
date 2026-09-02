export const dynamic = 'force-dynamic';

import { parseSearchQuery } from '@/lib/search';
import { searchPublicProfiles } from '@/server/queries/user';

export async function GET(request: Request): Promise<Response> {
  const parsed = parseSearchQuery(request);
  if (parsed instanceof Response) return parsed;

  const { query, searchParams } = parsed;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 5, 1), 20) : 5;

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchPublicProfiles(query, { limit });
    return Response.json(
      { results },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    console.error('User search error:', error);
    return Response.json({ results: [], error: 'Failed to search public users' }, { status: 500 });
  }
}
