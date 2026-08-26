import { NextResponse } from 'next/server';
import { getR2Bucket, COVER_URL_PREFIX } from '@/lib/r2';

export const runtime = 'nodejs';

/** Serve cover objects with immutable caching (uuid-keyed content). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<NextResponse | Response> {
  const { key: segments } = await params;
  const key = segments.join('/');

  if (!key.startsWith('covers/')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return new NextResponse('Object storage unavailable', { status: 503 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new NextResponse('Not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
