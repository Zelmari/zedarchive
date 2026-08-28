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
  droppedAt?: Date | string | null;
  dropReason?: string | null;
  droppedProgressPrimary?: number | null;
  droppedProgressSecondary?: number | null;
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
    droppedAt: toIso(entry.droppedAt),
    dropReason: typeof entry.dropReason === 'string' ? entry.dropReason : null,
    droppedProgressPrimary:
      entry.droppedProgressPrimary != null ? Number(entry.droppedProgressPrimary) : null,
    droppedProgressSecondary:
      entry.droppedProgressSecondary != null ? Number(entry.droppedProgressSecondary) : null,
    cycles:
      Array.isArray(entry.cycles) && entry.cycles.length > 0
        ? (entry.cycles as Record<string, unknown>[]).map((c, i) => ({
            id: typeof c.id === 'string' && c.id ? c.id : crypto.randomUUID(),
            cycleNumber: typeof c.cycleNumber === 'number' ? c.cycleNumber : i + 1,
            startedAt: toIso(c.startedAt as Date | string),
            completedAt: toIso(c.completedAt as Date | string),
            rating: c.rating != null ? Number(c.rating) : null,
            notes: typeof c.notes === 'string' ? c.notes : null,
          }))
        : toIso(entry.startedAt) || toIso(entry.completedAt)
          ? [
              {
                id: crypto.randomUUID(),
                cycleNumber: 1,
                startedAt: toIso(entry.startedAt),
                completedAt: toIso(entry.completedAt),
                rating: entry.rating != null ? Number(entry.rating) : null,
                notes: null,
              },
            ]
          : [],
    quotes: Array.isArray(entry.quotes)
      ? (entry.quotes as Record<string, unknown>[]).map((q) => ({
          id: typeof q.id === 'string' && q.id ? q.id : crypto.randomUUID(),
          text: typeof q.text === 'string' ? q.text : '',
          speaker: typeof q.speaker === 'string' ? q.speaker : null,
          citation: typeof q.citation === 'string' ? q.citation : null,
          isFavorite: Boolean(q.isFavorite),
          createdAt: typeof q.createdAt === 'string' ? q.createdAt : new Date().toISOString(),
        }))
      : [],
    priorityIndex: entry.priorityIndex != null ? Number(entry.priorityIndex) : null,
    createdAt: toIso(entry.createdAt) ?? '',
    updatedAt: toIso(entry.updatedAt) ?? '',
  };
}
