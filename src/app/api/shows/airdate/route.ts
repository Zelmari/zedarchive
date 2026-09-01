import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import type { NextAirInfo } from '@/types/media';
import { fetchTvmazeAirdates } from '@/lib/services/tvmaze';
import { fetchAnimeScheduleAirdates } from '@/lib/services/anime';

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
    .slice(0, 50);

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

  const titlesParam = searchParams.get('titles') || '';
  let titles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(titlesParam);
    if (Array.isArray(parsed)) {
      titles = parsed.map((t) => String(t ?? ''));
    }
  } catch {
    titles = [];
  }

  const result: Record<string, NextAirInfo> = {};
  const tvmazeIds: Array<{ sourceId: string; id: string }> = [];
  const animeItems: Array<{
    sourceId: string;
    title: string;
    lookupId: string;
    idKind: 'anilist' | 'mal';
  }> = [];

  rawIds.forEach((sourceId, index) => {
    const tvmazeMatch = sourceId.match(/^tvmaze-(\d+)$/);
    if (tvmazeMatch?.[1]) {
      tvmazeIds.push({ sourceId, id: tvmazeMatch[1] });
      return;
    }
    const anilistMatch = sourceId.match(/^anilist-(\d+)$/);
    if (anilistMatch?.[1]) {
      animeItems.push({
        sourceId,
        title: titles[index] ?? '',
        lookupId: anilistMatch[1],
        idKind: 'anilist',
      });
      return;
    }
    const malMatch = sourceId.match(/^mal-(\d+)$/);
    if (malMatch?.[1]) {
      animeItems.push({
        sourceId,
        title: titles[index] ?? '',
        lookupId: malMatch[1],
        idKind: 'mal',
      });
    }
  });

  await Promise.all([
    fetchTvmazeAirdates(tvmazeIds, result),
    fetchAnimeScheduleAirdates(animeItems, result),
  ]);

  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=21600',
    },
  });
}
