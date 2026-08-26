import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, like, sql } from 'drizzle-orm';
import { getAuthUser } from '@/server/internal';
import { getR2Bucket, COVER_URL_PREFIX } from '@/lib/r2';

export const runtime = 'nodejs';

const BATCH_SIZE = 25;
const MAX_BATCHES = 40; // safety cap per invocation (~1000 rows)

/**
 * Idempotent one-time migration: uploads legacy base64 covers to R2 and
 * rewrites `cover_image` to the object URL.
 *
 * Owner-only. Invoke once per environment after deploy, e.g.:
 *   curl -X POST -b cookies.txt https://zedarchive.com/api/admin/backfill-covers
 * Safe to re-run: rows already migrated (non data: URLs) are skipped.
 */
export async function POST(): Promise<NextResponse> {
  try {
    await getAuthUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: 'Object storage unavailable' }, { status: 503 });
  }

  let migrated = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const rows = await db
      .select({ id: mediaEntries.id, coverImage: mediaEntries.coverImage })
      .from(mediaEntries)
      .where(like(mediaEntries.coverImage, 'data:%'))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      const match = row.coverImage?.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
      if (!match || !match[1] || !match[2]) continue;

      const contentType = match[1].toLowerCase();
      if (!/^image\/(webp|jpeg|png)$/.test(contentType)) continue;

      const buffer = Buffer.from(match[2] as string, 'base64');
      const ext =
        contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : 'jpg';
      const key = `covers/${crypto.randomUUID()}.${ext}`;

      await bucket.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });

      await db
        .update(mediaEntries)
        .set({ coverImage: `${COVER_URL_PREFIX}${key}` })
        .where(eq(mediaEntries.id, row.id));

      migrated++;
    }

    batches++;
  }

  const [remaining] = await db
    .select({ value: sql<number>`count(*)` })
    .from(mediaEntries)
    .where(like(mediaEntries.coverImage, 'data:%'));

  return NextResponse.json({
    migrated,
    remainingBase64: Number(remaining?.value ?? 0),
  });
}
