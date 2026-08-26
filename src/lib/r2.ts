import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Minimal structural typing for the R2 surface ZedArchive uses. When
 * `npm run cf-typegen` generates cloudflare-env.d.ts with a real R2Bucket
 * binding, this remains compatible.
 */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string; cacheControl?: string };
  } | null>;
}

/** Public URL prefix under which cover objects are served. */
export const COVER_URL_PREFIX = '/api/covers/';

export function getR2Bucket(): R2BucketLike | null {
  try {
    const { env } = getCloudflareContext() as unknown as {
      env: Record<string, R2BucketLike | undefined>;
    };
    return env.MEDIA_BUCKET ?? null;
  } catch {
    // Not running inside a Cloudflare-backed context (e.g. plain node test).
    return null;
  }
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function extensionForType(contentType: string): string | null {
  return ALLOWED_TYPES[contentType] ?? null;
}
