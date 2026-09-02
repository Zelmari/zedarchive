import { describe, it, expect } from 'vitest';
import { serializeEntry } from '@/lib/serialize';

describe('serializeEntry', () => {
  it('normalizes dates to ISO strings', () => {
    const now = new Date('2026-08-25T10:00:00Z');
    const out = serializeEntry({ id: '1', createdAt: now, updatedAt: now, startedAt: now });
    expect(out?.createdAt).toBe(now.toISOString());
    expect(out?.startedAt).toBe(now.toISOString());
  });

  it('defaults collections and counters for sparse rows', () => {
    const out = serializeEntry({ id: '2' });
    expect(out?.tags).toEqual([]);
    expect(out?.genres).toEqual([]);
    expect(out?.quotes).toEqual([]);
    expect(out?.rewatchCount).toBe(0);
    expect(out?.status).toBe('in_progress');
    expect(out?.rating).toBeNull();
  });

  it('serializes quotes and supplies defaults for missing fields', () => {
    const serialized = serializeEntry({
      id: 'm1',
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
    });

    expect(serialized?.quotes).toHaveLength(2);
    expect(serialized?.quotes[0]).toMatchObject({
      text: 'Fear is the mind-killer.',
      speaker: 'Paul Atreides',
      citation: 'Chapter 1, p. 8',
      isFavorite: true,
    });
    expect(serialized?.quotes[1]?.id).toBeDefined();
    expect(serialized?.quotes[1]?.text).toBe('A process cannot be understood by stopping it.');
    expect(serialized?.quotes[1]?.speaker).toBeNull();
    expect(serialized?.quotes[1]?.citation).toBeNull();
    expect(serialized?.quotes[1]?.isFavorite).toBe(false);
  });

  it('returns null for nullish rows', () => {
    expect(serializeEntry(null)).toBeNull();
    expect(serializeEntry(undefined)).toBeNull();
  });

  it('passes string dates through untouched', () => {
    const iso = '2026-08-25T00:00:00.000Z';
    const out = serializeEntry({ id: '3', completedAt: iso });
    expect(out?.completedAt).toBe(iso);
  });

  it('keeps fallback child IDs and quote dates stable across serializations', () => {
    const entry = {
      id: 'legacy-entry',
      cycles: [{ cycleNumber: 1, startedAt: '2026-01-01T00:00:00.000Z' }],
      quotes: [{ text: 'A remembered line.' }],
    };

    const first = serializeEntry(entry);
    const second = serializeEntry(entry);

    expect(second?.cycles[0]?.id).toBe(first?.cycles[0]?.id);
    expect(second?.quotes[0]?.id).toBe(first?.quotes[0]?.id);
    expect(first?.quotes[0]?.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(second?.quotes[0]?.createdAt).toBe(first?.quotes[0]?.createdAt);
  });
});
