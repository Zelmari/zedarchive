import type { MediaEntry } from '@/types/media';

/**
 * Covers live in Postgres (`media_entries.cover_image`) either as compressed
 * `data:` URLs or as remote URLs. Client components receive only the
 * on-demand route path so archive payloads stay small; the route serves the
 * stored bytes or redirects to the remote URL.
 */
export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

function coverVersion(updatedAt: Date | string | null | undefined): number | null {
  if (updatedAt instanceof Date) {
    return Number.isNaN(updatedAt.getTime()) ? null : updatedAt.getTime();
  }
  if (typeof updatedAt === 'string') {
    const parsed = Date.parse(updatedAt);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * On-demand cover URL. The version query keeps browser caches safe when a
 * cover is replaced without invalidating unrelated assets.
 */
export function coverSrc(entryId: string, updatedAt: Date | string | null | undefined): string {
  const version = coverVersion(updatedAt);
  return `/api/covers/${encodeURIComponent(entryId)}${version !== null ? `?v=${version}` : ''}`;
}

/**
 * Display src for a stored cover value: the on-demand route when a cover
 * exists, otherwise null. Remote covers also route through the app so private
 * entries never leak their upstream URL to clients.
 */
export function toCoverDisplay(
  entryId: string,
  coverImage: string | null | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  return coverImage ? coverSrc(entryId, updatedAt) : null;
}

/** Map a server-side entry into the client-safe shape (cover via the route). */
export function toClientEntry(entry: MediaEntry): MediaEntry {
  return {
    ...entry,
    coverImage: toCoverDisplay(entry.id, entry.coverImage, entry.updatedAt),
  };
}

export interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array;
}

export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return null;

  const mimeType = match[1] || 'application/octet-stream';
  const payload = match[3] ?? '';

  try {
    if (match[2]) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { mimeType, bytes };
    }
    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    return null;
  }
}
