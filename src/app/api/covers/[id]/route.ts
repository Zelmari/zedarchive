import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mediaEntries, user as userTable } from '@/db/schema';
import { getSessionUser } from '@/server/internal';
import { isDataUrl, parseDataUrl } from '@/lib/covers';

export const dynamic = 'force-dynamic';

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/**
 * Serves a stored cover from Postgres on demand so list payloads never carry
 * base64 blobs. Anonymous access mirrors public-profile visibility: the owner
 * must have a public profile and the entry must not be private. Remote covers
 * redirect to the upstream URL; private/owner-only covers are never public.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return notFound();

  const [row] = await db
    .select({
      coverImage: mediaEntries.coverImage,
      userId: mediaEntries.userId,
      isPrivate: mediaEntries.isPrivate,
      ownerIsPublic: userTable.isPublic,
    })
    .from(mediaEntries)
    .innerJoin(userTable, eq(mediaEntries.userId, userTable.id))
    .where(eq(mediaEntries.id, id));

  if (!row?.coverImage) return notFound();

  const publiclyVisible = !row.isPrivate && row.ownerIsPublic;
  if (!publiclyVisible) {
    const sessionUser = await getSessionUser().catch(() => null);
    if (!sessionUser?.id || sessionUser.id !== row.userId) return notFound();
  }

  const cacheControl = publiclyVisible
    ? 'public, max-age=31536000, immutable'
    : 'private, max-age=3600';

  if (!isDataUrl(row.coverImage)) {
    return new Response(null, {
      status: 302,
      headers: { Location: row.coverImage, 'Cache-Control': cacheControl },
    });
  }

  const parsed = parseDataUrl(row.coverImage);
  if (!parsed) return notFound();

  return new Response(parsed.bytes, {
    headers: {
      'Content-Type': parsed.mimeType,
      'Content-Length': String(parsed.bytes.byteLength),
      'Cache-Control': cacheControl,
    },
  });
}
