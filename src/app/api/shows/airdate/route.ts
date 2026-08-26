import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import type { NextAirInfo } from '@/types/media';

interface TvmazeEpisodeEmbed {
  season?: number;
  number?: number;
  airdate?: string;
  airstamp?: string | null;
}

interface TvmazeShowDetails {
  id?: number;
  status?: string;
  _embedded?: {
    nextepisode?: TvmazeEpisodeEmbed | null;
    previousepisode?: TvmazeEpisodeEmbed | null;
  };
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids') || '';
  const rawIds = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (rawIds.length === 0) {
    return Response.json(
      {},
      {
        headers: {
          'Cache-Control': 'public, max-age=21600',
        },
      },
    );
  }

  const result: Record<string, NextAirInfo> = {};

  await Promise.all(
    rawIds.map(async (sourceId) => {
      const match = sourceId.match(/^tvmaze-(\d+)$/);
      if (!match || !match[1]) return;

      const tvmazeId = match[1];
      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${tvmazeId}?embed=nextepisode&embed=previousepisode`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!res.ok) return;

        const data: TvmazeShowDetails = await res.json();
        const status = data.status || 'Running';

        // Suppress on Ended and In Development
        if (status === 'Ended' || status === 'In Development') {
          return;
        }

        const nextEp = data._embedded?.nextepisode;
        if (nextEp && nextEp.airdate) {
          result[sourceId] = {
            season: typeof nextEp.season === 'number' ? nextEp.season : 1,
            number: typeof nextEp.number === 'number' ? nextEp.number : 1,
            airdate: nextEp.airdate,
            airstamp: nextEp.airstamp || null,
            status,
          };
        }
      } catch (err) {
        console.warn(`[airdate] TVMaze lookup failed for ${sourceId}:`, err);
      }
    }),
  );

  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=21600',
    },
  });
}
