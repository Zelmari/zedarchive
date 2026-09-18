import { describe, it, expect } from 'vitest';
import { isNetworkError } from '@/lib/offline/offlineAwareMutation';

describe('isNetworkError', () => {
  it('treats fetch TypeErrors as network failures', () => {
    const err = new TypeError('Failed to fetch');
    expect(isNetworkError(err)).toBe(true);
  });

  it('treats Node fetch-failed messages as network failures', () => {
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
  });

  it('does not treat validation errors as network failures', () => {
    expect(isNetworkError(new Error('Title is required'))).toBe(false);
    expect(isNetworkError('offline')).toBe(false);
  });
});
