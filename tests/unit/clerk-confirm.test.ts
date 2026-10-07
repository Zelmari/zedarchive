import { describe, expect, it } from 'vitest';
import {
  CLERK_ALREADY,
  CLERK_CATALOG_NONE,
  CLERK_EXPIRED,
  CLERK_MISSING,
  CLERK_NARROW,
  CLERK_NOT_IN_ARCHIVE,
  candidatesForModel,
  classifyProposal,
  confirmSnapshot,
  prepareConfirm,
  readBeforeImage,
  undoUpdates,
  type StoredProposal,
} from '@/domain/clerk-confirm';
import type { ApplyEntry } from '@/lib/clerk/apply';
import type { ClerkAction } from '@/lib/clerk/types';

function entry(partial: Partial<ApplyEntry> = {}): ApplyEntry {
  return {
    id: 'lh',
    title: 'The Left Hand of Darkness',
    category: 'book',
    status: 'in_progress',
    primaryUnitCurrent: 1,
    primaryUnitTotal: 1,
    secondaryUnitCurrent: 40,
    secondaryUnitTotal: 200,
    secondaryUnitKind: 'chapter',
    rating: null,
    notes: null,
    tags: [],
    queued: false,
    priorityIndex: null,
    dropReason: null,
    startedAt: null,
    completedAt: null,
    ...partial,
  };
}

function row(partial: Partial<StoredProposal> = {}): StoredProposal {
  return {
    id: 'plan-1',
    actions: {
      actions: [{ type: 'increment_secondary', entryId: 'lh', amount: 3, unit: 'chapter' }],
    },
    beforeImage: { entries: {}, lines: [], createdIds: [], addedQuoteIds: [] },
    summary: 'Add 3 chapters.',
    expiresAt: new Date('2026-10-07T12:15:00.000Z'),
    appliedAt: null,
    ...partial,
  };
}

const now = new Date('2026-10-07T12:00:00.000Z');

describe('classifyProposal', () => {
  it('does not apply an expired, saved, missing, or question row', () => {
    expect(classifyProposal(null, now).kind).toBe('missing');
    expect(classifyProposal(row({ expiresAt: new Date('2026-10-07T11:00:00.000Z') }), now)).toEqual(
      {
        kind: 'expired',
      },
    );
    expect(classifyProposal(row({ appliedAt: now }), now)).toEqual({ kind: 'already' });
    expect(classifyProposal(row({ actions: { clarification: 'Which title?' } }), now)).toEqual({
      kind: 'clarification',
      text: 'Which title?',
    });
    expect(classifyProposal(row({ actions: { pending: true } }), now).kind).toBe('pending');
  });

  it('prefers already saved over expiry', () => {
    const decision = classifyProposal(
      row({ appliedAt: now, expiresAt: new Date('2026-10-07T11:00:00.000Z') }),
      now,
    );
    expect(decision.kind).toBe('already');
  });
});

describe('prepareConfirm', () => {
  const actions = {
    actions: [
      { type: 'increment_secondary', entryId: 'lh', amount: 3, unit: 'chapter' },
    ] satisfies ClerkAction[],
  };

  it('keeps an edit from 3 to 10 and adds it to the stored chapter', () => {
    const prepared = prepareConfirm({
      actions,
      entries: [entry()],
      edits: [{ lineIndex: 0, value: 10 }],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.actions[0]).toMatchObject({ amount: 10 });
    expect(prepared.applied.patches).toEqual([
      { entryId: 'lh', updates: { secondaryUnitCurrent: 50 } },
    ]);
  });

  it('rejects an edit of 51 or 0 and does not describe a write', () => {
    expect(
      prepareConfirm({ actions, entries: [entry()], edits: [{ lineIndex: 0, value: 51 }] }).ok,
    ).toBe(false);
    expect(
      prepareConfirm({ actions, entries: [entry()], edits: [{ lineIndex: 0, value: 0 }] }).ok,
    ).toBe(false);
  });

  it('rejects an entry the person does not own', () => {
    const prepared = prepareConfirm({
      actions: {
        actions: [{ type: 'set_rating', entryId: 'someone-else', rating: 8 }],
      },
      entries: [entry()],
      edits: [],
    });
    expect(prepared).toEqual({ ok: false, text: CLERK_NOT_IN_ARCHIVE });
  });

  it('does not apply a create until a catalog hit is attached', () => {
    const prepared = prepareConfirm({
      actions: {
        actions: [
          {
            type: 'create_from_catalog',
            category: 'book',
            query: 'Dune',
            author: null,
            year: null,
            hit: null,
          },
        ],
      },
      entries: [],
      edits: [],
    });
    expect(prepared).toEqual({ ok: false, text: CLERK_CATALOG_NONE });
  });
});

describe('candidatesForModel', () => {
  const entries = Array.from({ length: 41 }, (_, index) => ({ id: `id-${index}` }));

  it('narrows past eight hits, and narrows an empty match in a large library', () => {
    expect(
      candidatesForModel(
        entries,
        entries.slice(0, 9).map((entry) => entry.id),
      ),
    ).toEqual({
      kind: 'narrow',
      text: CLERK_NARROW,
    });
    expect(candidatesForModel(entries, [])).toEqual({ kind: 'narrow', text: CLERK_NARROW });
  });

  it('sends the whole library when it is small and nothing matched', () => {
    const small = entries.slice(0, 10);
    expect(candidatesForModel(small, [])).toEqual({ kind: 'rows', rows: small });
  });
});

describe('readBeforeImage', () => {
  it('rejects a payload that is not a snapshot', () => {
    expect(readBeforeImage({ entries: { lh: { status: 'nope' } } })).toBeNull();
  });

  it('reads the snapshot undo will write back', () => {
    const image = readBeforeImage({
      entries: {
        lh: {
          status: 'in_progress',
          rating: null,
          notes: null,
          tags: [],
          queued: false,
          priorityIndex: null,
          primaryUnitCurrent: 1,
          primaryUnitTotal: 1,
          secondaryUnitCurrent: 40,
          secondaryUnitTotal: 200,
          secondaryUnitKind: 'chapter',
          dropReason: null,
          startedAt: null,
          completedAt: null,
        },
      },
      lines: [],
      createdIds: ['created-1'],
      addedQuoteIds: [{ entryId: 'lh', quoteId: 'quote-1' }],
    });
    expect(image?.createdIds).toEqual(['created-1']);
    expect(image?.entries.lh?.secondaryUnitCurrent).toBe(40);
    expect(image?.queueRanks).toEqual([]);
    expect(image?.entries.lh?.cycles).toBeUndefined();
  });

  it('keeps cycles and queued ranks from a saved plan', () => {
    const cycle = { id: 'cycle-1', cycleNumber: 1, completedAt: null };
    const image = readBeforeImage({
      entries: {
        lh: {
          status: 'in_progress',
          rating: null,
          notes: null,
          tags: [],
          queued: true,
          priorityIndex: 1,
          primaryUnitCurrent: 1,
          primaryUnitTotal: 1,
          secondaryUnitCurrent: 40,
          secondaryUnitTotal: 200,
          secondaryUnitKind: 'chapter',
          dropReason: null,
          startedAt: null,
          completedAt: null,
          cycles: [cycle],
        },
      },
      lines: [],
      createdIds: [],
      addedQuoteIds: [],
      queueRanks: [
        { id: 'other', priorityIndex: 2 },
        { id: 'lh', priorityIndex: 1 },
      ],
    });
    expect(image?.queueRanks).toEqual([
      { id: 'other', priorityIndex: 2 },
      { id: 'lh', priorityIndex: 1 },
    ]);
    const fields = image?.entries.lh;
    expect(fields?.cycles).toEqual([cycle]);
    if (!fields) return;
    expect(undoUpdates(fields).cycles).toEqual([cycle]);
  });

  it('rejects a queue rank that is not a whole number', () => {
    expect(
      readBeforeImage({
        entries: {},
        lines: [],
        createdIds: [],
        addedQuoteIds: [],
        queueRanks: [{ id: 'lh', priorityIndex: 1.5 }],
      }),
    ).toBeNull();
  });
});

describe('confirmSnapshot', () => {
  it('stores cycles for the touched title and every queued rank', () => {
    const before = {
      lh: {
        status: 'in_progress',
        rating: null,
        notes: null,
        tags: [],
        queued: true,
        priorityIndex: 2,
        primaryUnitCurrent: 1,
        primaryUnitTotal: null,
        secondaryUnitCurrent: 1,
        secondaryUnitTotal: null,
        secondaryUnitKind: 'chapter' as const,
        dropReason: null,
        startedAt: null,
        completedAt: null,
      },
    };
    const snapshot = confirmSnapshot(before, [
      { id: 'zz', cycles: [], priorityIndex: 1 },
      {
        id: 'lh',
        cycles: [{ id: 'cycle-1', completedAt: null }],
        priorityIndex: 2,
      },
      { id: 'idle', cycles: [{ id: 'nope' }], priorityIndex: null },
    ]);
    expect(snapshot.entries.lh?.cycles).toEqual([{ id: 'cycle-1', completedAt: null }]);
    expect(snapshot.entries.zz).toBeUndefined();
    expect(snapshot.queueRanks).toEqual([
      { id: 'lh', priorityIndex: 2 },
      { id: 'zz', priorityIndex: 1 },
    ]);
  });
});

describe('confirm copy', () => {
  it('uses the sentences the page shows', () => {
    expect(CLERK_EXPIRED).toBe('That plan expired.');
    expect(CLERK_MISSING).toBe('That plan is no longer here.');
    expect(CLERK_ALREADY).toBe('Already saved.');
  });
});
