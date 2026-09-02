export interface QueuedMutation {
  id: string;
  actionType:
    'UPDATE_PROGRESS' | 'UPDATE_STATUS' | 'CREATE_ENTRY' | 'UPDATE_NOTES' | 'DELETE_ENTRY';
  mediaId: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  originalUpdatedAt?: string;
}

const DB_NAME = 'za_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'mutation_outbox';
const LS_FALLBACK_KEY = 'za_offline_outbox_fallback';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  try {
    const db = await openDB();
    try {
      const transaction = db.transaction(STORE_NAME, mode);
      return await fn(transaction.objectStore(STORE_NAME));
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function readFallback(): QueuedMutation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function writeFallback(items: QueuedMutation[]): void {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // localStorage unavailable
  }
}

function putMutation(store: IDBObjectStore, mutation: QueuedMutation): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(mutation);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteMutation(store: IDBObjectStore, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueue a mutation to be replayed when connection is re-established.
 */
export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>,
): Promise<QueuedMutation> {
  const item: QueuedMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    retryCount: 0,
  };

  const idbResult = await withStore('readwrite', (store) => putMutation(store, item));
  if (idbResult === null) {
    console.warn('[OfflineOutbox] IndexedDB write failed, using localStorage fallback');
    const existing = readFallback();
    existing.push(item);
    writeFallback(existing);
  }

  return item;
}

/**
 * Retrieve all pending mutations ordered by timestamp ascending.
 */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const idbItems =
    (await withStore(
      'readonly',
      (store) =>
        new Promise<QueuedMutation[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve((request.result as QueuedMutation[]) || []);
          request.onerror = () => reject(request.error);
        }),
    )) ?? [];
  const lsItems = readFallback();

  // Deduplicate by id, preferring IDB entries
  const seen = new Set(idbItems.map((m) => m.id));
  const merged = [...idbItems, ...lsItems.filter((m) => !seen.has(m.id))];
  return merged.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Update an existing mutation (e.g. to increment retryCount).
 */
export async function updateMutation(mutation: QueuedMutation): Promise<void> {
  const idbResult = await withStore('readwrite', (store) => putMutation(store, mutation));

  const existing = readFallback();
  const idx = existing.findIndex((item) => item.id === mutation.id);
  if (idx !== -1) {
    existing[idx] = mutation;
    writeFallback(existing);
  } else if (idbResult === null) {
    existing.push(mutation);
    writeFallback(existing);
  }
}

/**
 * Remove a single processed mutation from the outbox.
 */
export async function removeMutation(id: string): Promise<void> {
  await withStore('readwrite', (store) => deleteMutation(store, id));

  const existing = readFallback();
  writeFallback(existing.filter((item) => item.id !== id));
}
