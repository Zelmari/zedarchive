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

interface AniListMedia {
  status?: string;
  nextAiringEpisode?: { episode?: number; airingAt?: number } | null;
}

/** AniList media statuses that never get a next episode. */
const ANILIST_DORMANT_STATUSES = new Set(['FINISHED', 'CANCELLED']);

async function fetchTvmazeAirdates(
  ids: Array<{ sourceId: string; id: string }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  await Promise.all(
    ids.map(async ({ sourceId, id }) => {
      try {
        const res = await fetch(
          `https://api.tvmaze.com/shows/${id}?embed=nextepisode&embed=previousepisode`,
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
}

/**
 * Resolve next-episode airdates for anime through the AniList GraphQL API.
 * Both anilist-{id} and mal-{id} sourceIds are supported (AniList accepts
 * lookups by its own id or by MAL id via `idMal`). All entries are batched
 * into a single aliased GraphQL request.
 */
async function fetchAniListAirdates(
  queries: Array<{ alias: string; sourceId: string; lookup: string }>,
  result: Record<string, NextAirInfo>,
): Promise<void> {
  if (queries.length === 0) return;

  const queryBody = `query { ${queries
    .map((q) => `${q.alias}: Media(${q.lookup}) { status nextAiringEpisode { episode airingAt } }`)
    .join(' ')} }`;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'zedarchive/0.1 (https://zedarchive.com; media tracking app)',
      },
      body: JSON.stringify({ query: queryBody }),
    });

    if (!res.ok) return;

    const data = (await res.json()) as {
      data?: Record<string, AniListMedia | null>;
    };

    for (const { alias, sourceId } of queries) {
      const media = data?.data?.[alias];
      if (!media) continue;
      const status = media.status || 'RELEASING';
      if (ANILIST_DORMANT_STATUSES.has(status)) continue;

      const nextEp = media.nextAiringEpisode;
      if (!nextEp || typeof nextEp.airingAt !== 'number' || !nextEp.episode) continue;

      result[sourceId] = {
        season: 1,
        number: nextEp.episode,
        airdate: new Date(nextEp.airingAt * 1000).toISOString().slice(0, 10),
        airstamp: null,
        status,
      };
    }
  } catch (err) {
    console.warn('[airdate] AniList lookup failed:', err);
  }
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
  const tvmazeIds: Array<{ sourceId: string; id: string }> = [];
  const aniListQueries: Array<{ alias: string; sourceId: string; lookup: string }> = [];

  for (const sourceId of rawIds) {
    const tvmazeMatch = sourceId.match(/^tvmaze-(\d+)$/);
    if (tvmazeMatch?.[1]) {
      tvmazeIds.push({ sourceId, id: tvmazeMatch[1] });
      continue;
    }
    const anilistMatch = sourceId.match(/^anilist-(\d+)$/);
    if (anilistMatch?.[1]) {
      aniListQueries.push({
        alias: `a${aniListQueries.length}`,
        sourceId,
        lookup: `id: ${anilistMatch[1]}`,
      });
      continue;
    }
    const malMatch = sourceId.match(/^mal-(\d+)$/);
    if (malMatch?.[1]) {
      aniListQueries.push({
        alias: `a${aniListQueries.length}`,
        sourceId,
        lookup: `idMal: ${malMatch[1]}`,
      });
    }
  }

  await Promise.all([
    fetchTvmazeAirdates(tvmazeIds, result),
    fetchAniListAirdates(aniListQueries, result),
  ]);

  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=21600',
    },
  });
}
