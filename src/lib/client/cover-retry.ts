const COVER_BASE = 'http://cover.local';

/** One automatic retry for relative `/api/covers/` URLs. Null means stop. */
export function nextCoverSrc(src: string): string | null {
  if (!src || src.startsWith('data:')) return null;

  let url: URL;
  try {
    url = new URL(src, COVER_BASE);
  } catch {
    return null;
  }

  // Absolute and protocol-relative URLs keep their own origin. Only app-relative cover paths retry.
  if (url.origin !== COVER_BASE) return null;
  if (!url.pathname.startsWith('/api/covers/')) return null;
  if (url.searchParams.get('retry') === '1') return null;

  url.searchParams.set('retry', '1');
  return `${url.pathname}${url.search}`;
}
