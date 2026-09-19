const MIN_WRAPPED_YEAR = 2000;

export function parseWrappedYear(raw: string, now = new Date()): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  const maxYear = now.getFullYear() + 1;
  if (!Number.isInteger(year) || year < MIN_WRAPPED_YEAR || year > maxYear) {
    return null;
  }
  return year;
}
