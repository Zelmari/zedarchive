import { describe, it, expect } from 'vitest';
import { createDraft, getDraft, updateDraft, deleteDraft } from '../../bot/src/drafts';

describe('bot draft store', () => {
  it('creates and retrieves a draft', () => {
    const draft = createDraft({
      userId: 'user-123',
      discordUserId: 'disc-456',
      title: "Frieren: Beyond Journey's End",
      category: 'anime',
      sourceId: null,
      structure: [],
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: 28,
      status: 'in_progress',
      rating: null,
      coverUrl: null,
      notes: null,
    });

    expect(draft.draftId).toBeDefined();
    expect(draft.title).toBe("Frieren: Beyond Journey's End");
    expect(draft.expiresAt).toBeGreaterThan(Date.now());

    const retrieved = getDraft(draft.draftId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Frieren: Beyond Journey's End");
  });

  it('updates draft fields', () => {
    const draft = createDraft({
      userId: 'user-123',
      discordUserId: 'disc-456',
      title: 'Initial Title',
      category: 'show',
      sourceId: null,
      structure: [],
      primaryUnitCurrent: 1,
      primaryUnitTotal: null,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: null,
      status: 'in_progress',
      rating: null,
      coverUrl: null,
      notes: null,
    });

    const updated = updateDraft(draft.draftId, {
      title: 'Updated Title',
      rating: 9,
    });

    expect(updated?.title).toBe('Updated Title');
    expect(updated?.rating).toBe(9);
    expect(getDraft(draft.draftId)?.rating).toBe(9);
  });

  it('deletes draft', () => {
    const draft = createDraft({
      userId: 'user-123',
      discordUserId: 'disc-456',
      title: 'Delete Me',
      category: 'movie',
      sourceId: null,
      structure: [],
      primaryUnitCurrent: 1,
      primaryUnitTotal: 1,
      secondaryUnitCurrent: 0,
      secondaryUnitTotal: 120,
      status: 'in_progress',
      rating: null,
      coverUrl: null,
      notes: null,
    });

    expect(deleteDraft(draft.draftId)).toBe(true);
    expect(getDraft(draft.draftId)).toBeNull();
  });
});
