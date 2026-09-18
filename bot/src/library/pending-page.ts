import { allocCompactId } from '../compact-id';

const LIBRARY_TTL_MS = 14 * 60 * 1000;

export interface LibraryPageQuery {
  discordUserId: string;
  userId: string;
  status: string;
  category?: string;
  query?: string;
  createdAt: number;
  expiresAt: number;
}

const libraryStore = new Map<string, LibraryPageQuery>();

const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [id, entry] of libraryStore.entries()) {
      if (now >= entry.expiresAt) {
        libraryStore.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

export function createLibraryPageQuery(data: Omit<LibraryPageQuery, 'createdAt' | 'expiresAt'>): {
  cacheId: string;
  query: LibraryPageQuery;
} {
  const cacheId = allocCompactId(libraryStore);
  const now = Date.now();
  const query: LibraryPageQuery = {
    ...data,
    createdAt: now,
    expiresAt: now + LIBRARY_TTL_MS,
  };
  libraryStore.set(cacheId, query);
  return { cacheId, query };
}

export function getLibraryPageQuery(cacheId: string): LibraryPageQuery | null {
  const entry = libraryStore.get(cacheId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    libraryStore.delete(cacheId);
    return null;
  }
  return entry;
}

export const LIBRARY_PAGE_SIZE = 10;

export const LIBRARY_EXPIRED_COPY = 'That library view expired. Run `/library` again.';
