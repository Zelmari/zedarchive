import { describe, it, expect } from 'vitest';
import { isUnknownActionType, isOfflineConflictError, backoffMs } from '@/lib/offline/replay';
import { OFFLINE_CONFLICT_MESSAGE } from '@/lib/offline/conflict';

describe('sync engine replay classification', () => {
  it('treats unknown action types as non-replayable', () => {
    expect(isUnknownActionType('UPDATE_PROGRESS')).toBe(false);
    expect(isUnknownActionType('FUTURE_ACTION')).toBe(true);
  });

  it('detects offline conflict errors as permanent', () => {
    expect(isOfflineConflictError(new Error(OFFLINE_CONFLICT_MESSAGE))).toBe(true);
    expect(isOfflineConflictError(new Error('Title is required'))).toBe(false);
  });

  it('caps exponential backoff at 30s plus jitter', () => {
    expect(backoffMs(0)).toBeGreaterThanOrEqual(1000);
    expect(backoffMs(10)).toBeLessThanOrEqual(30250);
  });
});
