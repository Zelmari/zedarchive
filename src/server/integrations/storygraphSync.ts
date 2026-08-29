import { updateMediaProgress, createMediaEntry } from '@/server/media';
import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface StoryGraphCsvRow {
  title: string;
  author?: string;
  readStatus: string; // 'read', 'currently-reading', 'to-read', 'did-not-finish'
  starRating?: number;
  lastDateRead?: string;
}

export async function importStoryGraphRow(
  userId: string,
  row: StoryGraphCsvRow,
): Promise<{ success: boolean }> {
  if (!row.title?.trim()) return { success: false };

  const title = row.title.trim();
  const statusMap: Record<string, string> = {
    read: 'completed',
    'currently-reading': 'in_progress',
    'to-read': 'planning',
    'did-not-finish': 'dropped',
  };

  const status = statusMap[row.readStatus] || 'in_progress';
  const rating = row.starRating ? Math.round(row.starRating * 2) : null; // Storygraph 5 star to 10 star

  const [existing] = await db
    .select()
    .from(mediaEntries)
    .where(and(eq(mediaEntries.userId, userId), eq(mediaEntries.title, title)));

  if (existing) {
    await updateMediaProgress(existing.id, {
      status,
      rating: rating || existing.rating,
    });
  } else {
    await createMediaEntry({
      title,
      category: 'book',
      status,
      primaryUnitCurrent: 1,
      rating,
    });
  }

  return { success: true };
}
