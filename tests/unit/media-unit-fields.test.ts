import { describe, it, expect } from 'vitest';
import { UNIT_FIELDS, unitFieldLabel, type UnitFieldContext } from '@/lib/media-unit-fields';
import type { MediaCategory } from '@/types/media';

describe('media-unit-fields', () => {
  it('defines unit fields for all media categories', () => {
    const categories: MediaCategory[] = ['show', 'anime', 'book', 'manga', 'movie'];
    for (const cat of categories) {
      expect(UNIT_FIELDS[cat]).toBeDefined();
      expect(UNIT_FIELDS[cat].length).toBeGreaterThan(0);
    }
  });

  it('renders correct labels for show and anime', () => {
    const ctx: UnitFieldContext = { primaryUnitCurrent: 2 };
    const fields = UNIT_FIELDS.show;

    expect(unitFieldLabel(fields[0]!, ctx)).toBe('Total Seasons');
    expect(unitFieldLabel(fields[1]!, ctx)).toBe('Current Season');
    expect(unitFieldLabel(fields[2]!, ctx)).toBe('Episodes in Season 2');
    expect(unitFieldLabel(fields[3]!, ctx)).toBe('Current Episode');
  });

  it('never prefixes labels with S2 to preserve season badge uniqueness', () => {
    const categories: MediaCategory[] = ['show', 'anime', 'book', 'manga', 'movie'];
    const ctx: UnitFieldContext = { primaryUnitCurrent: 2 };

    for (const cat of categories) {
      for (const field of UNIT_FIELDS[cat]) {
        const label = unitFieldLabel(field, ctx);
        expect(label).not.toMatch(/^S2/);
      }
    }
  });

  it('renders correct labels for movies', () => {
    const ctx: UnitFieldContext = { primaryUnitCurrent: 1 };
    const fields = UNIT_FIELDS.movie;

    expect(unitFieldLabel(fields[0]!, ctx)).toBe('Runtime (Minutes)');
    expect(unitFieldLabel(fields[1]!, ctx)).toBe('Times Watched (Rewatches)');
  });

  it('renders correct labels for books and manga', () => {
    const ctx: UnitFieldContext = { primaryUnitCurrent: 3 };
    const fields = UNIT_FIELDS.book;

    expect(unitFieldLabel(fields[0]!, ctx)).toBe('Total Volumes');
    expect(unitFieldLabel(fields[1]!, ctx)).toBe('Current Volume');
    expect(unitFieldLabel(fields[2]!, ctx)).toBe('Total Chapters / Pages');
    expect(unitFieldLabel(fields[3]!, ctx)).toBe('Current Chapter / Page');
  });
});
