const PRODUCTION_ORIGIN = 'https://zedarchive.com';

function isDevRuntime(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

/**
 * Canonical browsing origin for share links and public feeds.
 * Never derived from the request Host header.
 */
export function getCanonicalOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      // Fall through to the environment default.
    }
  }
  return isDevRuntime() ? 'http://localhost:3000' : PRODUCTION_ORIGIN;
}

export function getCanonicalProfileUrl(username: string): string {
  return `${getCanonicalOrigin()}/u/${encodeURIComponent(username)}`;
}
