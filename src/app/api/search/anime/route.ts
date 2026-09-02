export const revalidate = 86400;

import { parseSearchQuery } from '@/lib/search';
import { searchAnimeAndManga } from '@/lib/services/anime';

export async function GET(request: Request): Promise<Response> {
  const parsed = parseSearchQuery(request);
  if (parsed instanceof Response) return parsed;

  const { query, searchParams } = parsed;
  const rawType = (
    searchParams.get('type') ||
    searchParams.get('category') ||
    'ANIME'
  ).toUpperCase();
  const isManga = rawType === 'MANGA';

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchAnimeAndManga(query, isManga);
    if (!results) {
      return Response.json({ results: [], error: 'Search service unavailable' }, { status: 502 });
    }
    return Response.json({ results });
  } catch (error) {
    console.error('AniList search error:', error);
    return Response.json({ results: [], error: 'Failed to fetch anime/manga' }, { status: 500 });
  }
}
