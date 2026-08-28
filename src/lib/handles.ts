import { HANDLE_SANITIZE_PATTERN, MAX_USERNAME_LENGTH, RESERVED_HANDLES } from './constants';

/**
 * Normalize free text into a valid profile handle: lowercase, restricted to
 * [a-z0-9_-], capped at MAX_USERNAME_LENGTH characters.
 */
export function normalizeHandle(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(HANDLE_SANITIZE_PATTERN, '')
    .slice(0, MAX_USERNAME_LENGTH);
}

/**
 * Check if a handle is reserved by the system to avoid collision with routes.
 */
export function isReservedHandle(handle: string): boolean {
  const normalized = normalizeHandle(handle);
  return (RESERVED_HANDLES as readonly string[]).includes(normalized);
}
