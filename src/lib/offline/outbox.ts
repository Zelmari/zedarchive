export interface QueuedMutation {
  id: string;
  actionType:
    'UPDATE_PROGRESS' | 'UPDATE_STATUS' | 'CREATE_ENTRY' | 'UPDATE_NOTES' | 'DELETE_ENTRY';
  mediaId: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
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

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineOutbox] IndexedDB write failed, falling back to localStorage:', err);
    try {
      const existing = JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]');
      existing.push(item);
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(existing));
    } catch {
      // no-op
    }
  }

  return item;
}

/**
 * Retrieve all pending mutations ordered by timestamp ascending.
 */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as QueuedMutation[]) || [];
        items.sort((a, b) => a.timestamp - b.timestamp);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      return JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]');
    } catch {
      return [];
    }
  }
}

/**
 * Remove a single processed mutation from the outbox.
 */
export async function removeMutation(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const existing = JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]');
      const filtered = existing.filter((item: QueuedMutation) => item.id !== id);
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(filtered));
    } catch {
      // no-op
    }
  }
}

/**
 * Clear the entire mutation outbox.
 */
export async function clearOutbox(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      localStorage.removeItem(LS_FALLBACK_KEY);
    } catch {
      // no-op
    }
  }
}
