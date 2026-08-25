/**
 * Derive up-to-two leading initials from a display name or title.
 *
 * @param {string} name
 * @param {string} [fallback] Returned when name is empty/blank.
 */
export function getInitials(name, fallback = '??') {
  if (!name) return fallback;
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * First two characters of a title, uppercased — used for cover-art fallback
 * tiles where the raw leading characters are preferred over word initials.
 */
export function getTileInitials(title, fallback = '??') {
  return title ? title.trim().slice(0, 2).toUpperCase() || fallback : fallback;
}

/**
 * Compact humanized age of an ISO timestamp ("just now", "4m ago", "6d ago").
 */
export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return 'just now';
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
