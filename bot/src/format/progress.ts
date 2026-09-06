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
