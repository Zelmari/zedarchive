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
    expect(out?.rewatchCount).toBe(0);
    expect(out?.status).toBe('in_progress');
    expect(out?.rating).toBeNull();
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
});
