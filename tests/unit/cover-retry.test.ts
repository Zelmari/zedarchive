import { describe, it, expect } from 'vitest';
import { nextCoverSrc } from '@/lib/client/cover-retry';

describe('nextCoverSrc', () => {
  it('adds retry and keeps v', () => {
    expect(nextCoverSrc('/api/covers/entry-1?v=1700000000000')).toBe(
      '/api/covers/entry-1?v=1700000000000&retry=1',
    );
  });

  it('returns null on the second call', () => {
    const once = nextCoverSrc('/api/covers/entry-1?v=1700000000000');
    expect(once).toBe('/api/covers/entry-1?v=1700000000000&retry=1');
    expect(nextCoverSrc(once!)).toBeNull();
  });

  it('returns null for data URLs and remote image hosts', () => {
    expect(nextCoverSrc('data:image/png;base64,AAAA')).toBeNull();
    expect(nextCoverSrc('https://example.com/a.png')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(nextCoverSrc('')).toBeNull();
  });
});
