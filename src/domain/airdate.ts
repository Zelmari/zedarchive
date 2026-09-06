import type { NextAirInfo } from '@/types/media';
import { fetchTvmazeAirdates } from '@/lib/services/tvmaze';
import { fetchAnimeScheduleAirdates } from '@/lib/services/anime';

export interface AirdateItem {
  sourceId: string;
  title: string;
}

/**
 * Next-free airdate resolution helper shared between the API route and Discord bot.
 */
export async function getUpcomingAirdates(
  items: AirdateItem[],
): Promise<Record<string, NextAirInfo>> {
  const result: Record<string, NextAirInfo> = {};
  const tvmazeIds: Array<{ sourceId: string; id: string }> = [];
  const animeItems: Array<{
    sourceId: string;
    title: string;
    lookupId: string;
    idKind: 'anilist' | 'mal';
  }> = [];

  for (const item of items) {
    const { sourceId, title } = item;
    const tvmazeMatch = sourceId.match(/^tvmaze-(\d+)$/);
    if (tvmazeMatch?.[1]) {
      tvmazeIds.push({ sourceId, id: tvmazeMatch[1] });
      continue;
    }
    const anilistMatch = sourceId.match(/^anilist-(\d+)$/);
    if (anilistMatch?.[1]) {
      animeItems.push({
        sourceId,
        title,
        lookupId: anilistMatch[1],
        idKind: 'anilist',
      });
      continue;
    }
    const malMatch = sourceId.match(/^mal-(\d+)$/);
    if (malMatch?.[1]) {
      animeItems.push({
        sourceId,
        title,
        lookupId: malMatch[1],
        idKind: 'mal',
      });
    }
  }

  await Promise.all([
    fetchTvmazeAirdates(tvmazeIds, result),
    fetchAnimeScheduleAirdates(animeItems, result),
  ]);

  return result;
}
