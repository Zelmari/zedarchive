import type { MediaEntry } from '@/types/media';

export interface MatchedTitle {
  title: string;
  category: string;
  ratingA: number | null;
  ratingB: number | null;
  statusA: string;
  statusB: string;
  coverImage?: string | null;
}

export interface TasteMatchResult {
  sharedCount: number;
  sharedPercentage: number;
  ratingSimilarity: number | null; // 0 to 100%
  sharedMasterworks: MatchedTitle[];
  sharedTitles: MatchedTitle[];
  topSharedGenres: Array<{ genre: string; count: number }>;
}

export function calculateTasteMatch(
  entriesA: MediaEntry[],
  entriesB: MediaEntry[],
): TasteMatchResult {
  const mapB = new Map<string, MediaEntry>();

  for (const b of entriesB) {
    if (b.sourceId) {
      mapB.set(b.sourceId.toLowerCase(), b);
    }
    mapB.set(`${b.category}:${b.title.toLowerCase().trim()}`, b);
  }

  const sharedTitles: MatchedTitle[] = [];
  const sharedMasterworks: MatchedTitle[] = [];
  const genreCounts = new Map<string, number>();

  let ratingDiffSum = 0;
  let ratedTogetherCount = 0;

  for (const a of entriesA) {
    const keySource = a.sourceId ? a.sourceId.toLowerCase() : null;
    const keyTitle = `${a.category}:${a.title.toLowerCase().trim()}`;

    const matchB = (keySource && mapB.get(keySource)) || mapB.get(keyTitle);

    if (matchB) {
      const matchObj: MatchedTitle = {
        title: a.title,
        category: a.category,
        ratingA: a.rating ?? null,
        ratingB: matchB.rating ?? null,
        statusA: a.status,
        statusB: matchB.status,
        coverImage: a.coverImage || matchB.coverImage,
      };

      sharedTitles.push(matchObj);

      if ((a.rating === 9 || a.rating === 10) && (matchB.rating === 9 || matchB.rating === 10)) {
        sharedMasterworks.push(matchObj);
      }

      if (a.rating && matchB.rating) {
        ratingDiffSum += Math.abs(a.rating - matchB.rating);
        ratedTogetherCount++;
      }

      if (Array.isArray(a.genres)) {
        for (const g of a.genres) {
          const normG = g.trim().toLowerCase();
          if (normG) {
            genreCounts.set(normG, (genreCounts.get(normG) || 0) + 1);
          }
        }
      }
    }
  }

  const minTotal = Math.min(entriesA.length, entriesB.length);
  const sharedPercentage = minTotal > 0 ? Math.round((sharedTitles.length / minTotal) * 100) : 0;

  let ratingSimilarity: number | null = null;
  if (ratedTogetherCount > 0) {
    // 0 difference = 100%, max 9 difference = 0%
    const avgDiff = ratingDiffSum / ratedTogetherCount;
    ratingSimilarity = Math.max(0, Math.round(100 - (avgDiff / 9) * 100));
  }

  const topSharedGenres = Array.from(genreCounts.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    sharedCount: sharedTitles.length,
    sharedPercentage,
    ratingSimilarity,
    sharedMasterworks,
    sharedTitles,
    topSharedGenres,
  };
}
