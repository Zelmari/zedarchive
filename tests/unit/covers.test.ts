import { describe, it, expect } from 'vitest';
import { coverSrc, isDataUrl, parseDataUrl, toClientEntry, toCoverDisplay } from '@/lib/covers';
import type { MediaEntry } from '@/types/media';

const UPDATED_AT = '2026-01-01T00:00:00.000Z';

describe('cover display helpers', () => {
  it('detects data URLs', () => {
    expect(isDataUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isDataUrl('https://example.com/cover.png')).toBe(false);
  });

  it('builds a versioned on-demand route URL', () => {
    expect(coverSrc('entry-1', UPDATED_AT)).toBe(`/api/covers/entry-1?v=${Date.parse(UPDATED_AT)}`);
    expect(coverSrc('entry with/slash', null)).toBe('/api/covers/entry%20with%2Fslash');
  });

  it('maps stored covers to the route and missing covers to null', () => {
    expect(toCoverDisplay('entry-1', 'data:image/png;base64,AAAA', UPDATED_AT)).toBe(
      `/api/covers/entry-1?v=${Date.parse(UPDATED_AT)}`,
    );
    expect(toCoverDisplay('entry-1', 'https://example.com/cover.png', UPDATED_AT)).toBe(
      `/api/covers/entry-1?v=${Date.parse(UPDATED_AT)}`,
    );
    expect(toCoverDisplay('entry-1', null, UPDATED_AT)).toBeNull();
  });

  it('rewrites the cover on a client entry without touching other fields', () => {
    const entry = {
      id: 'entry-1',
      userId: 'user-1',
      title: 'Frieren',
      coverImage: 'data:image/png;base64,AAAA',
      updatedAt: UPDATED_AT,
      createdAt: UPDATED_AT,
    } as MediaEntry;

    const clientEntry = toClientEntry(entry);
    expect(clientEntry.coverImage).toBe(`/api/covers/entry-1?v=${Date.parse(UPDATED_AT)}`);
    expect(clientEntry.title).toBe('Frieren');
    expect(clientEntry.id).toBe('entry-1');
  });
});

describe('parseDataUrl', () => {
  it('decodes base64 payloads to bytes', () => {
    const parsed = parseDataUrl(`data:image/png;base64,${btoa('hello')}`);
    expect(parsed?.mimeType).toBe('image/png');
    expect(Array.from(parsed?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode('hello')));
  });

  it('decodes percent-encoded payloads', () => {
    const parsed = parseDataUrl('data:text/plain,hello%20world');
    expect(parsed?.mimeType).toBe('text/plain');
    expect(new TextDecoder().decode(parsed?.bytes)).toBe('hello world');
  });

  it('returns null for remote URLs, malformed input and bad base64', () => {
    expect(parseDataUrl('https://example.com/cover.png')).toBeNull();
    expect(parseDataUrl('data:image/png;base64')).toBeNull();
    expect(parseDataUrl('data:image/png;base64,%%%')).toBeNull();
  });
});
