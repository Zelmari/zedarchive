import { HANDLE_SANITIZE_PATTERN, MAX_USERNAME_LENGTH } from './constants';

/**
 * Normalize free text into a valid profile handle: lowercase, restricted to
 * [a-z0-9_-], capped at MAX_USERNAME_LENGTH characters.
 */
export function normalizeHandle(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(HANDLE_SANITIZE_PATTERN, '')
    .slice(0, MAX_USERNAME_LENGTH);
}
