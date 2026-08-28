import { describe, it, expect } from 'vitest';
import {
  getInitials,
  getTileInitials,
  relativeTime,
  formatAirdate,
  formatMonthYear,
  pageToPercent,
  percentToPage,
} from '@/lib/format';

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

describe('formatAirdate', () => {
  it('formats YYYY-MM-DD to short month day format', () => {
    expect(formatAirdate('2026-08-30')).toBe('Aug 30');
    expect(formatAirdate('2026-01-05')).toBe('Jan 5');
  });

  it('handles invalid or empty inputs gracefully', () => {
    expect(formatAirdate('')).toBe('');
    expect(formatAirdate('invalid')).toBe('invalid');
  });
});

describe('formatMonthYear', () => {
  it('formats Date and ISO strings as "Mon YYYY"', () => {
    expect(formatMonthYear(new Date('2026-08-15T10:00:00Z'))).toBe('Aug 2026');
    expect(formatMonthYear('2026-01-02T00:00:00.000Z')).toBe('Jan 2026');
  });

  it('handles invalid or empty inputs gracefully', () => {
    expect(formatMonthYear(null)).toBe('');
    expect(formatMonthYear(undefined)).toBe('');
    expect(formatMonthYear('not-a-date')).toBe('');
  });
});

describe('pageToPercent & percentToPage', () => {
  it('converts page to percent accurately', () => {
    expect(pageToPercent(240, 480)).toBe(50);
    expect(pageToPercent(288, 450)).toBe(64);
    expect(pageToPercent(0, 450)).toBe(0);
    expect(pageToPercent(450, 450)).toBe(100);
    expect(pageToPercent(500, 450)).toBe(100);
  });

  it('handles null/zero/negative totals gracefully in pageToPercent', () => {
    expect(pageToPercent(50, null)).toBe(0);
    expect(pageToPercent(50, 0)).toBe(0);
    expect(pageToPercent(50, -10)).toBe(0);
  });

  it('converts percent to page accurately', () => {
    expect(percentToPage(50, 480)).toBe(240);
    expect(percentToPage(64, 450)).toBe(288);
    expect(percentToPage(0, 450)).toBe(0);
    expect(percentToPage(100, 450)).toBe(450);
    expect(percentToPage(150, 450)).toBe(450);
    expect(percentToPage(-10, 450)).toBe(0);
  });

  it('handles null/zero totals gracefully in percentToPage', () => {
    expect(percentToPage(50, null)).toBe(0);
    expect(percentToPage(50, 0)).toBe(0);
  });
});
