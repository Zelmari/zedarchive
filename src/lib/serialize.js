/**
 * Normalize a raw database row (or API payload) into the canonical serialized
 * media-entry shape shared by server actions and RSC->client boundaries.
 */
export function serializeEntry(entry) {
  if (!entry) return null;
  return {
    ...entry,
    status: entry.status || 'in_progress',
    rating: entry.rating != null ? entry.rating : null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    genres: Array.isArray(entry.genres) ? entry.genres : [],
    rewatchCount: entry.rewatchCount || 0,
    synopsis: entry.synopsis || null,
    startedAt: entry.startedAt instanceof Date ? entry.startedAt.toISOString() : (entry.startedAt || null),
    completedAt: entry.completedAt instanceof Date ? entry.completedAt.toISOString() : (entry.completedAt || null),
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
  };
}
