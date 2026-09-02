/**
 * Normalize external cover URLs for secure image loading.
 */
export function httpsCover(url: string | null | undefined): string | null {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url ?? null;
}

/**
 * Derive up-to-two leading initials from a display name or title.
 *
 * @param name - Display name or title.
 * @param fallback - Returned when name is empty/blank.
 */
export function getInitials(name: string | null | undefined, fallback = '??'): string {
  if (!name) return fallback;
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase() || fallback;
  const first = words[0]?.charAt(0) ?? '';
  const second = words[1]?.charAt(0) ?? '';
  return (first + second).toUpperCase() || fallback;
}

/**
 * First two characters of a title, uppercased — used for cover-art fallback
 * tiles where the raw leading characters are preferred over word initials.
 */
export function getTileInitials(title: string | null | undefined, fallback = '??'): string {
  return title ? title.trim().slice(0, 2).toUpperCase() || fallback : fallback;
}

/**
 * Compact humanized age of an ISO timestamp ("just now", "4m ago", "6d ago").
 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return 'just now';
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a YYYY-MM-DD airdate string into a short date string ("Aug 30").
 */
export function formatAirdate(airdate: string): string {
  if (!airdate) return '';
  const parts = airdate.split('-');
  if (parts.length < 3) return airdate;
  const monthIdx = parseInt(parts[1] ?? '', 10) - 1;
  const day = parseInt(parts[2] ?? '', 10);
  if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
    return `${MONTHS[monthIdx]} ${day}`;
  }
  return airdate;
}

/**
 * Format an ISO date for display, falling back to "Present".
 */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return 'Present';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Present';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a date as "Aug 2026" — used for membership tenure on public profiles.
 */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Converts a raw page count to an exact percentage (0 - 100).
 */
export function pageToPercent(current: number, total: number | null | undefined): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

/**
 * Converts a percentage (0 - 100) to the corresponding page number.
 */
export function percentToPage(percent: number, total: number | null | undefined): number {
  if (!total || total <= 0) return 0;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  return Math.min(total, Math.max(0, Math.round((clampedPercent / 100) * total)));
}
