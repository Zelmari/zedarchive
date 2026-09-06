import { describe, it, expect } from 'vitest';
import {
  formatProgressBar,
  formatProgressString,
  progressFraction,
} from '../../bot/src/format/progress';

describe('formatProgressString', () => {
  it('formats show / anime progress', () => {
    expect(
      formatProgressString({ category: 'show', primaryUnitCurrent: 1, secondaryUnitCurrent: 4 }),
    ).toBe('S1E4');
    expect(
      formatProgressString({
        category: 'anime',
        primaryUnitCurrent: 2,
        secondaryUnitCurrent: 12,
        secondaryUnitTotal: 24,
      }),
    ).toBe('S2E12 / 24');
  });

  it('formats manga progress', () => {
    expect(
      formatProgressString({ category: 'manga', primaryUnitCurrent: 3, secondaryUnitCurrent: 25 }),
    ).toBe('Vol 3 Ch 25');
    expect(
      formatProgressString({
        category: 'manga',
        primaryUnitCurrent: 1,
        secondaryUnitCurrent: 10,
        secondaryUnitTotal: 100,
      }),
    ).toBe('Vol 1 Ch 10 / 100');
  });

  it('formats book progress', () => {
    expect(
      formatProgressString({ category: 'book', primaryUnitCurrent: 1, secondaryUnitCurrent: 150 }),
    ).toBe('Vol 1 p.150');
    expect(
      formatProgressString({
        category: 'book',
        primaryUnitCurrent: 1,
        secondaryUnitCurrent: 150,
        secondaryUnitTotal: 300,
      }),
    ).toBe('Vol 1 p.150 / 300');
  });

  it('formats movie progress', () => {
    expect(formatProgressString({ category: 'movie', secondaryUnitCurrent: 0 })).toBe('unwatched');
    expect(formatProgressString({ category: 'movie', secondaryUnitCurrent: 45 })).toBe('45 min');
    expect(formatProgressString({ category: 'movie', status: 'completed' })).toBe('watched');
  });
});

describe('progressFraction / formatProgressBar', () => {
  it('returns a fraction when a secondary total is known', () => {
    expect(
      progressFraction({
        category: 'anime',
        secondaryUnitCurrent: 14,
        secondaryUnitTotal: 28,
      }),
    ).toBe(0.5);
  });

  it('omits the bar when no total is known', () => {
    expect(
      progressFraction({ category: 'anime', primaryUnitCurrent: 1, secondaryUnitCurrent: 4 }),
    ).toBeNull();
  });

  it('renders five ticks', () => {
    expect(formatProgressBar(0.5)).toBe('▰▰▰▱▱');
    expect(formatProgressBar(1)).toBe('▰▰▰▰▰');
    expect(formatProgressBar(0)).toBe('▱▱▱▱▱');
  });
});
