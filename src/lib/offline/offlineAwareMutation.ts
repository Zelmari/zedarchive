import { enqueueMutation, type QueuedMutation } from './outbox';

type ActionType = QueuedMutation['actionType'];

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name.toLowerCase();
  const message = err.message.toLowerCase();
  return (
    name === 'typeerror' ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('econnreset') ||
    message.includes('econnrefused')
  );
}

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
  try {
    return await serverAction();
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueMutation({ actionType, mediaId, payload, originalUpdatedAt });
      return null;
    }
    throw err;
  }
}
