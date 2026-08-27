export interface SeasonRef {
  number: number;
}

/**
 * Normalize and sort an entry's season/volume structure by unit number.
 * Filters out malformed entries so callers can trust the result.
 */
export function sortedSeasonStructure(structure: unknown): SeasonRef[] {
  if (!Array.isArray(structure)) return [];
  return (structure as SeasonRef[])
    .filter((s) => s && typeof s === 'object' && typeof s.number === 'number')
    .sort((a, b) => a.number - b.number);
}

/**
 * Next season/volume number strictly above `current`.
 *
 * Structure-aware: with e.g. seasons [1, 3], `getNextSeason(1)` returns 3
 * instead of the phantom 2. Without a structure, falls back to linear
 * stepping bounded by `total`.
 */
export function getNextSeason(
  current: number,
  structure: SeasonRef[],
  total: number,
): number | null {
  if (structure.length > 0) {
    const next = structure.find((s) => s.number > current);
    return next ? next.number : null;
  }
  const linear = current + 1;
  return linear <= total ? linear : null;
}

/**
 * Previous season/volume number strictly below `current`, or null when none.
 */
export function getPrevSeason(
  current: number,
  structure: SeasonRef[],
  total: number,
): number | null {
  if (structure.length > 0) {
    const prev = [...structure].reverse().find((s) => s.number < current);
    return prev ? prev.number : null;
  }
  const linear = current - 1;
  return linear >= 1 ? linear : null;
}
