/**
 * Same-origin relative path only. Rejects protocol-relative URLs, backslashes,
 * and control characters that some browsers normalize into an open redirect.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (raw.includes('\\') || /[\u0000-\u001F\u007F]/.test(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
