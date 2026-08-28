import { describe, it, expect } from 'vitest';
import { serializeEntry } from '@/lib/serialize';
import type { MediaQuote } from '@/types/media';

describe('Media Quotes', () => {
  it('serializes quotes correctly and supplies defaults for missing fields', () => {
    const rawEntry = {
      id: 'm1',
      userId: 'u1',
      title: 'Dune',
      quotes: [
        {
          id: 'q1',
          text: 'Fear is the mind-killer.',
          speaker: 'Paul Atreides',
          citation: 'Chapter 1, p. 8',
          isFavorite: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          text: 'A process cannot be understood by stopping it.',
        },
      ],
    };

    const serialized = serializeEntry(rawEntry);
    expect(serialized?.quotes).toHaveLength(2);

    const first = serialized?.quotes[0];
    expect(first?.text).toBe('Fear is the mind-killer.');
    expect(first?.speaker).toBe('Paul Atreides');
    expect(first?.citation).toBe('Chapter 1, p. 8');
    expect(first?.isFavorite).toBe(true);

    const second = serialized?.quotes[1];
    expect(second?.id).toBeDefined();
    expect(second?.text).toBe('A process cannot be understood by stopping it.');
    expect(second?.speaker).toBeNull();
    expect(second?.citation).toBeNull();
    expect(second?.isFavorite).toBe(false);
  });

  it('defaults to an empty quotes array when missing in raw input', () => {
    const rawEntry = {
      id: 'm2',
      userId: 'u1',
      title: 'Severance',
    };

    const serialized = serializeEntry(rawEntry);
    expect(serialized?.quotes).toEqual([]);
  });
});
