import type { MediaCategory, StructureItem } from '@/types/media';
import { allocCompactId } from './compact-id';

const DRAFT_TTL_MS = 14 * 60 * 1000; // 14 minutes (Discord tokens expire at 15m)

export interface MediaDraft {
  draftId: string;
  userId: string;
  discordUserId: string;
  title: string;
  category: MediaCategory;
  sourceId: string | null;
  structure: StructureItem[];
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  status: string;
  rating: number | null;
  coverUrl: string | null;
  notes: string | null;
  dropReason?: string | null;
  createdAt: number;
  expiresAt: number;
}

const draftStore = new Map<string, MediaDraft>();

// Periodic cleanup of expired drafts every 5 minutes
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [id, draft] of draftStore.entries()) {
      if (now >= draft.expiresAt) {
        draftStore.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

export function createDraft(
  data: Omit<MediaDraft, 'draftId' | 'createdAt' | 'expiresAt'>,
): MediaDraft {
  const draftId = allocCompactId(draftStore);
  const now = Date.now();
  const draft: MediaDraft = {
    ...data,
    draftId,
    createdAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  };
  draftStore.set(draftId, draft);
  return draft;
}

export function getDraft(draftId: string): MediaDraft | null {
  const draft = draftStore.get(draftId);
  if (!draft) return null;
  if (Date.now() >= draft.expiresAt) {
    draftStore.delete(draftId);
    return null;
  }
  return draft;
}

export function updateDraft(draftId: string, updates: Partial<MediaDraft>): MediaDraft | null {
  const existing = getDraft(draftId);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  draftStore.set(draftId, updated);
  return updated;
}

export function deleteDraft(draftId: string): boolean {
  return draftStore.delete(draftId);
}
