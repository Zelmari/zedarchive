import type { MediaEntry } from '@/types/media';

const STABLE_MISSING_DATE = '1970-01-01T00:00:00.000Z';

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

function toGroupId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? String(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function hashToHex(value: string): string {
  let result = '';

  for (let seed = 0; seed < 4; seed++) {
    let hash = (0x811c9dc5 ^ Math.imul(seed + 1, 0x9e3779b9)) >>> 0;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    result += hash.toString(16).padStart(8, '0');
  }

  return result;
}

/**
 * Returns the deterministic UUID used for legacy JSONB children that predate
 * persisted child IDs. Keep this shared by serialization and write sanitizers.
 */
export function stableMediaChildId(
  kind: 'cycle' | 'quote',
  mediaId: unknown,
  index: number,
  child: unknown,
): string {
  const hex = hashToHex(
    `${kind}|${String(mediaId ?? '')}|${index}|${stableStringify(child)}`,
  ).split('');
  hex[12] = '4';
  const variant = Number.parseInt(hex[16] ?? '0', 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

export function stableMediaChildDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? STABLE_MISSING_DATE : value.toISOString();
  }
  return typeof value === 'string' ? value : STABLE_MISSING_DATE;
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
        ? (entry.cycles as unknown[]).map((rawCycle, i) => {
            const cycle =
              rawCycle && typeof rawCycle === 'object' ? (rawCycle as Record<string, unknown>) : {};
            return {
              id:
                typeof cycle.id === 'string' && cycle.id
                  ? cycle.id
                  : stableMediaChildId('cycle', entry.id, i, cycle),
              cycleNumber: typeof cycle.cycleNumber === 'number' ? cycle.cycleNumber : i + 1,
              startedAt: toIso(cycle.startedAt as Date | string),
              completedAt: toIso(cycle.completedAt as Date | string),
              rating: cycle.rating != null ? Number(cycle.rating) : null,
              notes: typeof cycle.notes === 'string' ? cycle.notes : null,
            };
          })
        : toIso(entry.startedAt) || toIso(entry.completedAt)
          ? [
              (() => {
                const cycle = {
                  cycleNumber: 1,
                  startedAt: toIso(entry.startedAt),
                  completedAt: toIso(entry.completedAt),
                  rating: entry.rating != null ? Number(entry.rating) : null,
                  notes: null,
                };
                return {
                  // The write sanitizer has no root-rating input for this legacy
                  // fallback, so keep the ID seed limited to shared fields.
                  id: stableMediaChildId('cycle', entry.id, 0, {
                    ...cycle,
                    rating: null,
                  }),
                  ...cycle,
                };
              })(),
            ]
          : [],
    quotes: Array.isArray(entry.quotes)
      ? (entry.quotes as unknown[]).map((rawQuote, i) => {
          const quote =
            rawQuote && typeof rawQuote === 'object' ? (rawQuote as Record<string, unknown>) : {};
          return {
            id:
              typeof quote.id === 'string' && quote.id
                ? quote.id
                : stableMediaChildId('quote', entry.id, i, quote),
            text: typeof quote.text === 'string' ? quote.text : '',
            speaker: typeof quote.speaker === 'string' ? quote.speaker : null,
            citation: typeof quote.citation === 'string' ? quote.citation : null,
            isFavorite: Boolean(quote.isFavorite),
            createdAt: stableMediaChildDate(quote.createdAt),
          };
        })
      : [],
    priorityIndex: entry.priorityIndex != null ? Number(entry.priorityIndex) : null,
    groupId: toGroupId((entry as Record<string, unknown>).groupId),
    createdAt: toIso(entry.createdAt) ?? '',
    updatedAt: toIso(entry.updatedAt) ?? '',
  };
}
