import type { QueuedMutation } from './outbox';
import { OFFLINE_CONFLICT_MESSAGE } from './conflict';

export const KNOWN_OUTBOX_ACTIONS = new Set<QueuedMutation['actionType']>([
  'UPDATE_PROGRESS',
  'UPDATE_STATUS',
  'UPDATE_NOTES',
  'CREATE_ENTRY',
  'DELETE_ENTRY',
]);

export function isUnknownActionType(actionType: string): boolean {
  return !KNOWN_OUTBOX_ACTIONS.has(actionType as QueuedMutation['actionType']);
}

export function isOfflineConflictError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(OFFLINE_CONFLICT_MESSAGE);
}

export function backoffMs(retryCount: number): number {
  const exp = Math.min(1000 * 2 ** retryCount, 30000);
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

export function isReadyToReplay(mutation: QueuedMutation, now: number): boolean {
  if (mutation.retryCount <= 0 || !mutation.lastAttemptAt) return true;
  return now >= mutation.lastAttemptAt + Math.min(1000 * 2 ** mutation.retryCount, 30000);
}
