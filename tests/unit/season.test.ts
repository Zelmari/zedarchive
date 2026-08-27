import { describe, it, expect } from 'vitest';
import { getNextSeason, getPrevSeason, sortedSeasonStructure } from '@/lib/season';

describe('sortedSeasonStructure', () => {
  it('sorts contiguous season numbers', () => {
    expect(sortedSeasonStructure([{ number: 2 }, { number: 1 }])).toEqual([
      { number: 1 },
      { number: 2 },
    ]);
  });

  it('filters malformed entries', () => {
    expect(
      sortedSeasonStructure([null, 'x', { number: '3' }, { name: 'S1' }, { number: 2 }]),
    ).toEqual([{ number: 2 }]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(sortedSeasonStructure(undefined)).toEqual([]);
    expect(sortedSeasonStructure({ number: 1 })).toEqual([]);
  });
});

describe('getNextSeason', () => {
  it('steps linearly within a bounded total when no structure exists', () => {
    expect(getNextSeason(1, [], 3)).toBe(2);
    expect(getNextSeason(3, [], 3)).toBeNull();
  });

  it('jumps to the next real season in a non-contiguous structure', () => {
    const structure = sortedSeasonStructure([{ number: 1 }, { number: 3 }]);
    expect(getNextSeason(1, structure, 2)).toBe(3);
    expect(getNextSeason(3, structure, 2)).toBeNull();
  });

  it('never returns a phantom season beyond the final real one', () => {
    const structure = sortedSeasonStructure([{ number: 1 }, { number: 3 }]);
    expect(getNextSeason(3, structure, 2)).toBeNull();
  });
});

describe('getPrevSeason', () => {
  it('steps linearly down to season 1 when no structure exists', () => {
    expect(getPrevSeason(3, [], 5)).toBe(2);
    expect(getPrevSeason(1, [], 5)).toBeNull();
  });

  it('steps back to the previous real season across a gap', () => {
    const structure = sortedSeasonStructure([{ number: 1 }, { number: 3 }]);
    expect(getPrevSeason(3, structure, 2)).toBe(1);
    expect(getPrevSeason(1, structure, 2)).toBeNull();
  });
});
