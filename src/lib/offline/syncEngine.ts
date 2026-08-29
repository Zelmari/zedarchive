import { getPendingMutations, removeMutation, type QueuedMutation } from './outbox';
import { updateMediaProgress, createMediaEntry, deleteMediaEntry } from '@/server/media';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatusEventDetail {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: number | null;
}

let isReplaying = false;
let lastSyncedAt: number | null = null;

function dispatchSyncEvent(state: SyncState, pendingCount: number) {
  if (typeof window === 'undefined') return;
  const detail: SyncStatusEventDetail = {
    state,
    pendingCount,
    lastSyncedAt,
  };
  window.dispatchEvent(new CustomEvent('za:sync-status', { detail }));
}

/**
 * Replays all queued offline mutations against the backend server actions.
 */
export async function replayOutbox(): Promise<{ replayed: number; failed: number }> {
  if (isReplaying || typeof window === 'undefined' || !navigator.onLine) {
    const pending = await getPendingMutations();
    dispatchSyncEvent(navigator.onLine ? 'idle' : 'offline', pending.length);
    return { replayed: 0, failed: 0 };
  }

  isReplaying = true;
  let replayed = 0;
  let failed = 0;

  try {
    const mutations = await getPendingMutations();
    if (mutations.length === 0) {
      dispatchSyncEvent('idle', 0);
      return { replayed: 0, failed: 0 };
    }

    dispatchSyncEvent('syncing', mutations.length);

    for (const mutation of mutations) {
      try {
        switch (mutation.actionType) {
          case 'UPDATE_PROGRESS':
          case 'UPDATE_STATUS':
          case 'UPDATE_NOTES':
            await updateMediaProgress(mutation.mediaId, mutation.payload);
            break;
          case 'CREATE_ENTRY':
            await createMediaEntry(mutation.payload);
            break;
          case 'DELETE_ENTRY':
            await deleteMediaEntry(mutation.mediaId);
            break;
          default:
            console.warn('[SyncEngine] Unknown mutation action type:', mutation.actionType);
        }
        await removeMutation(mutation.id);
        replayed++;
      } catch (err) {
        console.error(`[SyncEngine] Failed to replay mutation ${mutation.id}:`, err);
        failed++;
        // If it's a hard validation failure or offline, keep in queue or retry count
      }
    }

    lastSyncedAt = Date.now();
    const remaining = await getPendingMutations();
    dispatchSyncEvent(failed > 0 ? 'error' : 'idle', remaining.length);
  } finally {
    isReplaying = false;
  }

  return { replayed, failed };
}

/**
 * Initializes the background sync listener. Call once in client lifecycle.
 */
export function initSyncEngine(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    console.log('[SyncEngine] Connection restored, replaying offline outbox...');
    replayOutbox();
  };

  const handleOffline = async () => {
    const pending = await getPendingMutations();
    dispatchSyncEvent('offline', pending.length);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial check on mount
  if (navigator.onLine) {
    replayOutbox();
  } else {
    handleOffline();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
