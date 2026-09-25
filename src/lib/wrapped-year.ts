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

/** The nearest older and newer editions around `year`, from any-order `years`. */
export function adjacentWrappedYears(
  years: number[],
  year: number,
): { older: number | null; newer: number | null } {
  let older: number | null = null;
  let newer: number | null = null;
  for (const y of years) {
    if (y < year && (older === null || y > older)) older = y;
    if (y > year && (newer === null || y < newer)) newer = y;
  }
  return { older, newer };
}
