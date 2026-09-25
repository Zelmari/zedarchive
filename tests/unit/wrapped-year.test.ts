import { describe, it, expect } from 'vitest';
import { adjacentWrappedYears, parseWrappedYear } from '@/lib/wrapped-year';

describe('adjacentWrappedYears', () => {
  it('finds the nearest older and newer editions in a descending list', () => {
    expect(adjacentWrappedYears([2026, 2024, 2021], 2024)).toEqual({ older: 2021, newer: 2026 });
  });

  it('returns null at either end of the range', () => {
    expect(adjacentWrappedYears([2026, 2025], 2026)).toEqual({ older: 2025, newer: null });
    expect(adjacentWrappedYears([2026, 2025], 2025)).toEqual({ older: null, newer: 2026 });
    expect(adjacentWrappedYears([2026], 2026)).toEqual({ older: null, newer: null });
  });

  it('works for a year with no archive activity', () => {
    expect(adjacentWrappedYears([2026, 2020], 2023)).toEqual({ older: 2020, newer: 2026 });
  });
});

describe('parseWrappedYear', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('accepts four-digit years up to next year', () => {
    expect(parseWrappedYear('2027', now)).toBe(2027);
    expect(parseWrappedYear('2028', now)).toBeNull();
    expect(parseWrappedYear('26', now)).toBeNull();
  });
});
