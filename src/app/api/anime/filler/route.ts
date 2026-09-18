import { NextRequest, NextResponse } from 'next/server';
import { fetchAnimeFillerGuide, resolveMalId } from '@/lib/services/anime';
import { parseSearchQuery } from '@/lib/search';
import { MAX_QUERY_LENGTH } from '@/lib/constants';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const parsed = parseSearchQuery(request);
  if (parsed instanceof Response) return parsed;

  const { searchParams } = parsed;
  const sourceId =
    (searchParams.get('sourceId') || '').trim().slice(0, MAX_QUERY_LENGTH) || undefined;
  const title =
    (searchParams.get('title') || parsed.query || '').trim().slice(0, MAX_QUERY_LENGTH) ||
    undefined;

  try {
    const malId = await resolveMalId(sourceId, title);
    if (!malId) {
      return NextResponse.json(
        { fillerMap: null, malId: null },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
          },
        },
      );
    }

    const fillerMap = await fetchAnimeFillerGuide(malId);

    return NextResponse.json(
      { fillerMap, malId },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    console.error('Failed to fetch anime filler guide:', error);
    return NextResponse.json(
      { fillerMap: null, error: 'Failed to fetch anime filler guide' },
      { status: 500 },
    );
  }
}
