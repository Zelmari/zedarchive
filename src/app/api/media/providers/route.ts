import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchProviders, resolveTmdbId } from '@/lib/services/tmdb';
import { getSessionUser } from '@/server/internal';
import { getUserProfileById } from '@/server/queries/user';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sourceId = searchParams.get('sourceId') || undefined;
  const title = searchParams.get('title') || undefined;
  const rawCategory = searchParams.get('category') || 'movie';
  const category =
    rawCategory === 'movie' || rawCategory === 'show' || rawCategory === 'anime'
      ? rawCategory
      : 'movie';

  let country = searchParams.get('country')?.toUpperCase() || undefined;

  // Fallback to user saved country preference if logged in
  if (!country) {
    try {
      const sessionUser = await getSessionUser();
      if (sessionUser?.id) {
        const profile = await getUserProfileById(sessionUser.id);
        if (profile?.countryCode) {
          country = profile.countryCode.toUpperCase();
        }
      }
    } catch {
      // Ignored for unauthenticated or edge requests
    }
  }

  // Fallback to Cloudflare IP country header or US
  if (!country) {
    const cfCountry = request.headers.get('cf-ipcountry');
    country = cfCountry && cfCountry.length === 2 ? cfCountry.toUpperCase() : 'US';
  }

  try {
    const tmdbId = await resolveTmdbId(sourceId, title, category);
    if (!tmdbId) {
      return NextResponse.json(
        { providers: null, country, tmdbId: null },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
          },
        },
      );
    }

    const providers = await fetchWatchProviders(tmdbId, category, country);

    return NextResponse.json(
      { providers, country, tmdbId },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
        },
      },
    );
  } catch (error) {
    console.error('Failed to fetch watch providers:', error);
    return NextResponse.json(
      { providers: null, country, error: 'Failed to fetch providers' },
      { status: 500 },
    );
  }
}
