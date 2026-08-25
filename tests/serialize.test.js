import { describe, it, expect } from 'vitest';
import { normalizeHandle } from '../src/lib/handles.js';
import { serializeEntry } from '../src/lib/serialize.js';

describe('normalizeHandle', () => {
  it('lowercases and strips invalid characters', () => {
    expect(normalizeHandle('  Zel Mari! ')).toBe('zelmari');
  });

  it('keeps allowed separators', () => {
    expect(normalizeHandle('Cozy-Reader_01')).toBe('cozy-reader_01');
  });

  it('caps length at 30 characters', () => {
    expect(normalizeHandle('a'.repeat(50))).toHaveLength(30);
  });

  it('returns an empty string for nullish input', () => {
    expect(normalizeHandle(null)).toBe('');
  });
});

describe('serializeEntry', () => {
  it('normalizes dates to ISO strings', () => {
    const now = new Date('2026-08-25T10:00:00Z');
    const out = serializeEntry({ id: '1', createdAt: now, updatedAt: now, startedAt: now });
    expect(out.createdAt).toBe(now.toISOString());
    expect(out.startedAt).toBe(now.toISOString());
  });

  it('defaults collections and counters for sparse rows', () => {
    const out = serializeEntry({ id: '2' });
    expect(out.tags).toEqual([]);
    expect(out.genres).toEqual([]);
    expect(out.rewatchCount).toBe(0);
    expect(out.status).toBe('in_progress');
    expect(out.rating).toBeNull();
  });

  it('returns null for null input', () => {
    expect(serializeEntry(null)).toBeNull();
  });
});
