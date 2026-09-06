import type { MediaCategory } from '@/types/media';

export interface ProgressFormatInput {
  category: MediaCategory;
  primaryUnitCurrent?: number | null;
  primaryUnitTotal?: number | null;
  secondaryUnitCurrent?: number | null;
  secondaryUnitTotal?: number | null;
  status?: string | null;
}

/**
 * Formats an entry's progress according to ZedArchive Discord conventions:
 * - show/anime: S{primary}E{secondary} (/ {total})
 * - manga: Vol {primary} Ch {secondary}
 * - book: Vol {primary} p.{secondary}
 * - movie: {secondary} min, or 'watched' if completed
 */
export function formatProgressString(entry: ProgressFormatInput): string {
  const p = entry.primaryUnitCurrent ?? 1;
  const s = entry.secondaryUnitCurrent ?? 0;
  const sTotal = entry.secondaryUnitTotal;

  switch (entry.category) {
    case 'show':
    case 'anime': {
      let str = `S${p}E${s}`;
      if (sTotal && sTotal > 0) {
        str += ` / ${sTotal}`;
      }
      return str;
    }
    case 'manga': {
      let str = `Vol ${p} Ch ${s}`;
      if (sTotal && sTotal > 0) {
        str += ` / ${sTotal}`;
      }
      return str;
    }
    case 'book': {
      let str = `Vol ${p} p.${s}`;
      if (sTotal && sTotal > 0) {
        str += ` / ${sTotal}`;
      }
      return str;
    }
    case 'movie': {
      if (entry.status === 'completed') {
        return 'watched';
      }
      return s > 0 ? `${s} min` : 'unwatched';
    }
    default:
      return `${p} / ${s}`;
  }
}

/** Fraction complete when a total is known; otherwise null (no unicode bar). */
export function progressFraction(entry: ProgressFormatInput): number | null {
  const s = entry.secondaryUnitCurrent ?? 0;
  const sTotal = entry.secondaryUnitTotal;
  const p = entry.primaryUnitCurrent ?? 0;
  const pTotal = entry.primaryUnitTotal;

  if (entry.category === 'movie') {
    if (entry.status === 'completed') return 1;
    if (sTotal && sTotal > 0) return clampFraction(s / sTotal);
    return s > 0 ? null : 0;
  }

  if (sTotal && sTotal > 0) return clampFraction(s / sTotal);
  if (pTotal && pTotal > 1) return clampFraction(p / pTotal);
  return null;
}

export function formatProgressBar(fraction: number, ticks = 5): string {
  const clamped = clampFraction(fraction);
  const filled = Math.round(clamped * ticks);
  return '▰'.repeat(filled) + '▱'.repeat(ticks - filled);
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
