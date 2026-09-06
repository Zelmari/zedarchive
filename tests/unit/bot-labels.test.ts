import { describe, it, expect } from 'vitest';
import {
  formatCategory,
  formatCategoryRibbon,
  formatShelf,
  formatShelfBadge,
} from '../../bot/src/format/labels';

describe('formatShelf', () => {
  it('maps known shelf statuses', () => {
    expect(formatShelf('in_progress')).toBe('In Progress');
    expect(formatShelf('completed')).toBe('Completed');
    expect(formatShelf('planning')).toBe('Planning');
    expect(formatShelf('on_hold')).toBe('On Hold');
    expect(formatShelf('dropped')).toBe('Dropped');
  });

  it('title-cases unknown statuses with underscores', () => {
    expect(formatShelf('custom_status')).toBe('Custom Status');
  });
});

describe('formatCategory', () => {
  it('maps known media categories', () => {
    expect(formatCategory('show')).toBe('Television');
    expect(formatCategory('movie')).toBe('Film');
    expect(formatCategory('book')).toBe('Book');
    expect(formatCategory('anime')).toBe('Anime');
    expect(formatCategory('manga')).toBe('Manga');
  });

  it('title-cases unknown categories', () => {
    expect(formatCategory('podcast')).toBe('Podcast');
  });

  it('uppercases ribbon and shelf badges', () => {
    expect(formatCategoryRibbon('movie')).toBe('FILM');
    expect(formatCategoryRibbon('show')).toBe('TELEVISION');
    expect(formatShelfBadge('in_progress')).toBe('IN PROGRESS');
  });
});
