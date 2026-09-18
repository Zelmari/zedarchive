import {
  getReplayableMutations,
  getDeadLetteredMutations,
  removeMutation,
  updateMutation,
  type QueuedMutation,
} from './outbox';
import { updateMediaProgress, createMediaEntry, deleteMediaEntry } from '@/server/media';
import { isUnknownActionType, isOfflineConflictError, isReadyToReplay } from './replay';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatusEventDetail {
  state: SyncState;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: number | null;
}

const MAX_RETRIES = 5;

let isReplaying = false;
let lastSyncedAt: number | null = null;

async function dispatchSyncEvent(state: SyncState, pendingCount: number) {
  if (typeof window === 'undefined') return;
  const conflicts = await getDeadLetteredMutations();
  const detail: SyncStatusEventDetail = {
    state,
    pendingCount,
    conflictCount: conflicts.length,
    lastSyncedAt,
  };
  window.dispatchEvent(new CustomEvent('za:sync-status', { detail }));
}

async function deadLetter(mutation: QueuedMutation, lastError: string): Promise<void> {
  await updateMutation({
    ...mutation,
    deadLettered: true,
    lastError,
    lastAttemptAt: Date.now(),
  });
}

/**
 * Replays all queued offline mutations against the backend server actions.
 */
export async function replayOutbox(): Promise<{ replayed: number; failed: number }> {
  if (isReplaying || typeof window === 'undefined' || !navigator.onLine) {
    const pending = await getReplayableMutations();
    await dispatchSyncEvent(navigator.onLine ? 'idle' : 'offline', pending.length);
    return { replayed: 0, failed: 0 };
  }

  isReplaying = true;
  let replayed = 0;
  let failed = 0;

  try {
    const mutations = await getReplayableMutations();
    if (mutations.length === 0) {
      await dispatchSyncEvent('idle', 0);
      return { replayed: 0, failed: 0 };
    }

    await dispatchSyncEvent('syncing', mutations.length);

    const now = Date.now();
    const ordered = [...mutations].sort(
      (a, b) => a.retryCount - b.retryCount || a.timestamp - b.timestamp,
    );

    for (const mutation of ordered) {
      if (!isReadyToReplay(mutation, now)) {
        failed++;
        continue;
      }

      if (isUnknownActionType(mutation.actionType)) {
        console.warn('[SyncEngine] Unknown mutation action type:', mutation.actionType);
        await deadLetter(mutation, `Unknown action type: ${mutation.actionType}`);
        failed++;
        continue;
      }

      try {
        switch (mutation.actionType) {
          case 'UPDATE_PROGRESS':
          case 'UPDATE_STATUS':
          case 'UPDATE_NOTES':
            await updateMediaProgress(mutation.mediaId, {
              ...mutation.payload,
              _offlineUpdatedAt: mutation.originalUpdatedAt,
            });
            break;
          case 'CREATE_ENTRY':
            await createMediaEntry(mutation.payload);
            break;
          case 'DELETE_ENTRY':
            await deleteMediaEntry(mutation.mediaId);
            break;
        }
        await removeMutation(mutation.id);
        replayed++;
      } catch (err) {
        console.error(`[SyncEngine] Failed to replay mutation ${mutation.id}:`, err);
        failed++;
        const lastError = err instanceof Error ? err.message : 'Unknown sync error';

        if (isOfflineConflictError(err)) {
          await deadLetter(mutation, lastError);
          continue;
        }

        const updated: QueuedMutation = {
          ...mutation,
          retryCount: mutation.retryCount + 1,
          lastError,
          lastAttemptAt: Date.now(),
        };
        if (updated.retryCount >= MAX_RETRIES) {
          await deadLetter(updated, lastError);
        } else {
          await updateMutation(updated);
        }
      }
    }

    if (replayed > 0) {
      lastSyncedAt = Date.now();
    }
    const remaining = await getReplayableMutations();
    const conflicts = await getDeadLetteredMutations();
    const nextState = failed > 0 || conflicts.length > 0 ? 'error' : 'idle';
    await dispatchSyncEvent(nextState, remaining.length);
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
    const pending = await getReplayableMutations();
    await dispatchSyncEvent('offline', pending.length);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

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
