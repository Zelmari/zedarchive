import type { SearchResult } from '@/types/search';
import type { MediaCategory } from '@/types/media';
import type { MediaDraft } from '../drafts';

export type CatalogDraftFields = Omit<
  MediaDraft,
  'draftId' | 'createdAt' | 'expiresAt' | 'userId' | 'discordUserId'
>;

/**
 * Prefill an in-memory /add draft from a catalog SearchResult.
 * Mirrors AddMediaModal.handleSelectResult defaults (without fetching covers).
 */
export function catalogDraftFieldsFromHit(
  hit: SearchResult,
  category: MediaCategory,
): CatalogDraftFields {
  const isMovie = category === 'movie';
  const rawPrimaryTot = hit.primaryUnitTotal != null ? hit.primaryUnitTotal : 1;
  const primaryUnitTotal = Number.isFinite(rawPrimaryTot) ? Math.max(1, rawPrimaryTot) : 1;
  const primaryUnitCurrent = isMovie ? 0 : 1;

  let secondaryUnitTotal: number | null = null;
  if (hit.secondaryUnitTotal != null && Number.isFinite(hit.secondaryUnitTotal)) {
    secondaryUnitTotal = Math.max(0, hit.secondaryUnitTotal);
  }

  const coverUrl = hit.coverUrl && hit.coverUrl.startsWith('https://') ? hit.coverUrl : null;

  return {
    title: hit.title,
    category,
    sourceId: hit.sourceId || null,
    structure: Array.isArray(hit.structure) ? hit.structure : [],
    primaryUnitCurrent,
    primaryUnitTotal,
    secondaryUnitCurrent: 0,
    secondaryUnitTotal,
    status: 'in_progress',
    rating: null,
    coverUrl,
    notes: null,
  };
}
