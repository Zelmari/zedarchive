import { NextRequest, NextResponse } from 'next/server';
import { fetchAnimeFillerGuide, resolveMalId } from '@/lib/services/anime';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sourceId = searchParams.get('sourceId') || undefined;
  const title = searchParams.get('title') || undefined;

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
