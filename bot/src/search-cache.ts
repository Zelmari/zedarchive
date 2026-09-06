import crypto from 'crypto';
import type { SearchResult } from '@/types/search';
import type { MediaCategory } from '@/types/media';

const CACHE_TTL_MS = 14 * 60 * 1000; // 14 minutes (Discord tokens expire at 15m)

interface SearchHitCache {
  cacheId: string;
  discordUserId: string;
  category: MediaCategory;
  hits: SearchResult[];
  createdAt: number;
  expiresAt: number;
}

const cacheStore = new Map<string, SearchHitCache>();

const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [id, entry] of cacheStore.entries()) {
      if (now >= entry.expiresAt) {
        cacheStore.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

export function stashSearchHits(
  discordUserId: string,
  category: MediaCategory,
  hits: SearchResult[],
): { cacheId: string } {
  const cacheId = crypto.randomUUID().slice(0, 8);
  const now = Date.now();
  const entry: SearchHitCache = {
    cacheId,
    discordUserId,
    category,
    hits,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
  };
  cacheStore.set(cacheId, entry);
  return { cacheId };
}

export function getSearchHits(
  cacheId: string,
): { hits: SearchResult[]; discordUserId: string; category: MediaCategory } | null {
  const entry = cacheStore.get(cacheId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cacheStore.delete(cacheId);
    return null;
  }
  return {
    hits: entry.hits,
    discordUserId: entry.discordUserId,
    category: entry.category,
  };
}
