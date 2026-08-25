import { describe, it, expect } from 'vitest';
import { getInitials, getTileInitials, relativeTime } from '@/lib/format';

describe('getInitials', () => {
  it('uses the fallback for empty input', () => {
    expect(getInitials('', 'TV')).toBe('TV');
    expect(getInitials(null)).toBe('??');
  });

  it('takes two characters of a single word', () => {
    expect(getInitials('Frieren')).toBe('FR');
  });

  it('takes the first letter of the first two words', () => {
    expect(getInitials('Beyond Journey End')).toBe('BJ');
  });
});

describe('getTileInitials', () => {
  it('uppercases the leading two raw characters', () => {
    expect(getTileInitials('frieren')).toBe('FR');
  });

  it('falls back when blank', () => {
    expect(getTileInitials('   ')).toBe('??');
  });
});

describe('relativeTime', () => {
  it('reports just-now for sub-minute ages', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
  });

  it('reports minutes and hours', () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h ago');
  });

  it('reports days beyond a day', () => {
    expect(relativeTime(new Date(Date.now() - 6 * 86_400_000).toISOString())).toBe('6d ago');
  });
});
