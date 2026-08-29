import { db } from '@/lib/db';
import { userIntegrations, mediaEntries } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { updateMediaProgress, createMediaEntry } from '@/server/media';

export interface AniListSyncResult {
  synced: number;
  skipped: number;
}

export async function syncAniListUserCollection(
  userId: string,
  anilistUsername: string,
): Promise<AniListSyncResult> {
  const query = `
    query ($username: String) {
      MediaListCollection(userName: $username, type: ANIME) {
        lists {
          entries {
            progress
            score(format: POINT_10)
            status
            media {
              id
              title {
                romaji
                english
              }
              episodes
              coverImage {
                large
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { username: anilistUsername } }),
    });

    if (!res.ok) {
      return { synced: 0, skipped: 0 };
    }

    const data = await res.json();
    const lists = data?.data?.MediaListCollection?.lists || [];
    let synced = 0;

    for (const list of lists) {
      for (const entry of list.entries || []) {
        const title = entry.media?.title?.english || entry.media?.title?.romaji;
        if (!title) continue;

        const sourceId = `anilist-${entry.media.id}`;
        const [existing] = await db
          .select()
          .from(mediaEntries)
          .where(and(eq(mediaEntries.userId, userId), eq(mediaEntries.sourceId, sourceId)));

        const statusMap: Record<string, string> = {
          CURRENT: 'in_progress',
          COMPLETED: 'completed',
          PAUSED: 'on_hold',
          DROPPED: 'dropped',
          PLANNING: 'planning',
        };

        const status = statusMap[entry.status] || 'in_progress';
        const progress = Number(entry.progress) || 0;
        const total = Number(entry.media.episodes) || null;

        if (existing) {
          await updateMediaProgress(existing.id, {
            status,
            secondaryUnitCurrent: progress,
            secondaryUnitTotal: total,
            rating: entry.score && entry.score > 0 ? entry.score : existing.rating,
          });
        } else {
          await createMediaEntry({
            title,
            category: 'anime',
            status,
            primaryUnitCurrent: 1,
            secondaryUnitCurrent: progress,
            secondaryUnitTotal: total,
            rating: entry.score && entry.score > 0 ? entry.score : null,
            coverImage: entry.media?.coverImage?.large || null,
            sourceId,
          });
        }
        synced++;
      }
    }

    return { synced, skipped: 0 };
  } catch (err) {
    console.error('AniList sync failed:', err);
    return { synced: 0, skipped: 0 };
  }
}
