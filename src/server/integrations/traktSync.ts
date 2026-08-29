import { db } from '@/lib/db';
import { userIntegrations, mediaEntries } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { updateMediaProgress, createMediaEntry } from '@/server/media';

export interface TraktScrobblePayload {
  action: 'scrobble' | 'checkin';
  progress: number;
  movie?: {
    title: string;
    year?: number;
    ids?: {
      trakt?: number;
      tmdb?: number;
      imdb?: string;
    };
  };
  show?: {
    title: string;
    year?: number;
    ids?: {
      trakt?: number;
      tvmaze?: number;
      tmdb?: number;
    };
  };
  episode?: {
    season: number;
    number: number;
    title?: string;
  };
}

export async function processTraktScrobble(
  userId: string,
  payload: TraktScrobblePayload,
): Promise<{ success: boolean; action: string }> {
  const isMovie = Boolean(payload.movie);
  const title = payload.movie?.title || payload.show?.title;

  if (!title) {
    return { success: false, action: 'ignored_missing_title' };
  }

  const category = isMovie ? 'movie' : 'show';
  const sourceId = payload.movie?.ids?.tmdb
    ? `tmdb-${payload.movie.ids.tmdb}`
    : payload.show?.ids?.tvmaze
      ? `tvmaze-${payload.show.ids.tvmaze}`
      : null;

  // Search existing user entry
  const [existing] = await db
    .select()
    .from(mediaEntries)
    .where(
      and(
        eq(mediaEntries.userId, userId),
        sourceId ? eq(mediaEntries.sourceId, sourceId) : eq(mediaEntries.title, title),
      ),
    );

  if (isMovie) {
    if (existing) {
      await updateMediaProgress(existing.id, {
        status: 'completed',
        primaryUnitCurrent: (existing.primaryUnitCurrent || 0) + 1,
      });
    } else {
      await createMediaEntry({
        title,
        category: 'movie',
        status: 'completed',
        primaryUnitCurrent: 1,
        sourceId,
      });
    }
  } else {
    const season = payload.episode?.season || 1;
    const episode = payload.episode?.number || 1;

    if (existing) {
      await updateMediaProgress(existing.id, {
        status: 'in_progress',
        primaryUnitCurrent: season,
        secondaryUnitCurrent: episode,
      });
    } else {
      await createMediaEntry({
        title,
        category: 'show',
        status: 'in_progress',
        primaryUnitCurrent: season,
        secondaryUnitCurrent: episode,
        sourceId,
      });
    }
  }

  return { success: true, action: 'synchronized' };
}
