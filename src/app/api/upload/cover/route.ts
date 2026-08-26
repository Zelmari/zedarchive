import { NextResponse } from 'next/server';
import { getAuthUser } from '@/server/internal';
import { getR2Bucket, extensionForType, COVER_URL_PREFIX } from '@/lib/r2';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 300 * 1024; // compressed covers land well under this

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await getAuthUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: 'Object storage unavailable' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  const ext = extensionForType(file.type);
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image too large after compression' }, { status: 413 });
  }

  const key = `covers/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, file, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  return NextResponse.json({ url: `${COVER_URL_PREFIX}${key}` });
}
