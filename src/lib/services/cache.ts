import { db } from '@/lib/db';
import { externalApiCache } from '@/db/schema';
import { eq, lt } from 'drizzle-orm';

/**
 * Fetch a value from the external API cache if present and unexpired.
 */
export async function getCachedPayload<T>(key: string): Promise<T | null> {
  try {
    const [row] = await db.select().from(externalApiCache).where(eq(externalApiCache.key, key));

    if (!row) return null;

    if (new Date(row.expiresAt).getTime() < Date.now()) {
      // Opportunistically prune expired row in background
      db.delete(externalApiCache)
        .where(eq(externalApiCache.key, key))
        .catch(() => {});
      return null;
    }

    return row.payload as T;
  } catch (err) {
    console.warn(`[Cache] Failed to get cache key "${key}":`, err);
    return null;
  }
}

/**
 * Cache an external API response payload with a time-to-live (TTL).
 */
export async function setCachedPayload(
  key: string,
  payload: unknown,
  ttlMs: number,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    await db
      .insert(externalApiCache)
      .values({
        key,
        payload,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: externalApiCache.key,
        set: {
          payload,
          expiresAt,
        },
      });
  } catch (err) {
    console.warn(`[Cache] Failed to set cache key "${key}":`, err);
  }
}

/**
 * Robust fetch wrapper with configurable timeout (default: 3500ms).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 3500,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
