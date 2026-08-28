import { describe, it, expect } from 'vitest';
import { normalizeHandle, isReservedHandle } from '@/lib/handles';

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

describe('isReservedHandle', () => {
  it('identifies system reserved handles', () => {
    expect(isReservedHandle('search')).toBe(true);
    expect(isReservedHandle('Search')).toBe(true);
    expect(isReservedHandle('  DASHBOARD  ')).toBe(true);
    expect(isReservedHandle('settings')).toBe(true);
    expect(isReservedHandle('u')).toBe(true);
  });

  it('allows normal handles', () => {
    expect(isReservedHandle('zelmari')).toBe(false);
    expect(isReservedHandle('alex_reads')).toBe(false);
  });
});
