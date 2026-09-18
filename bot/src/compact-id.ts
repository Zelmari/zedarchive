import crypto from 'crypto';

const DEFAULT_MAX_SIZE = 2000;

/**
 * Allocate a short id that does not collide with an existing map key, evicting
 * the oldest entry when the store is at capacity (insertion-order LRU).
 */
export function allocCompactId(store: Map<string, unknown>, maxSize = DEFAULT_MAX_SIZE): string {
  let id = crypto.randomUUID().slice(0, 8);
  let attempts = 0;
  while (store.has(id) && attempts < 16) {
    id = crypto.randomUUID().slice(0, 8);
    attempts += 1;
  }
  while (store.size >= maxSize) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return id;
}
