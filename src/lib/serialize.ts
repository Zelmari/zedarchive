import type { MediaEntry } from '@/types/media';

type SerializedEntryInput = {
  status?: string | null;
  rating?: number | null;
  tags?: unknown;
  genres?: unknown;
  rewatchCount?: number | null;
  synopsis?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
} & Record<string, unknown>;

function toIso(value: Date | string | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

/**
 * Normalize a raw database row (or API payload) into the canonical serialized
 * media-entry shape shared by server actions and RSC->client boundaries.
 */
export function serializeEntry(entry: SerializedEntryInput | null | undefined): MediaEntry | null {
  if (!entry) return null;
  return {
    ...(entry as unknown as MediaEntry),
    status: (entry.status || 'in_progress') as MediaEntry['status'],
    rating: entry.rating != null ? entry.rating : null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    genres: Array.isArray(entry.genres) ? entry.genres : [],
    rewatchCount: entry.rewatchCount || 0,
    synopsis: entry.synopsis || null,
    startedAt: toIso(entry.startedAt),
    completedAt: toIso(entry.completedAt),
    createdAt: toIso(entry.createdAt) ?? '',
    updatedAt: toIso(entry.updatedAt) ?? '',
  };
}
