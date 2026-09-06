import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkMutationRateLimit } from '../../bot/src/rate-limiter';

describe('bot mutation rate limiter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows up to 20 mutations within 1 minute for a user', () => {
    const userId = `user-${Date.now()}-1`;
    for (let i = 0; i < 20; i++) {
      const res = checkMutationRateLimit(userId);
      expect(res.allowed).toBe(true);
    }

    // 21st mutation within the window should be blocked
    const blocked = checkMutationRateLimit(userId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks users independently', () => {
    const userA = `user-a-${Date.now()}`;
    const userB = `user-b-${Date.now()}`;

    for (let i = 0; i < 20; i++) {
      checkMutationRateLimit(userA);
    }

    expect(checkMutationRateLimit(userA).allowed).toBe(false);
    expect(checkMutationRateLimit(userB).allowed).toBe(true);
  });
});
