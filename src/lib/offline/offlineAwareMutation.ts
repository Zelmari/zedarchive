import { enqueueMutation, type QueuedMutation } from './outbox';

type ActionType = QueuedMutation['actionType'];

export async function offlineAwareMutation<T>(
  actionType: ActionType,
  mediaId: string,
  payload: Record<string, unknown>,
  serverAction: () => Promise<T>,
  originalUpdatedAt?: string,
): Promise<T | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueMutation({ actionType, mediaId, payload, originalUpdatedAt });
    return null; // caller should optimistically update UI
  }
  return serverAction();
}
