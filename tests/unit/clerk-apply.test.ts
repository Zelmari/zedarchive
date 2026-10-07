import { describe, expect, it } from 'vitest';
import { applyNumberEdits, applyPlan, type ApplyEntry } from '@/lib/clerk/apply';
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
    queued: true,
    priorityIndex: 2,
    dropReason: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    ...partial,
  };
}

describe('applyPlan', () => {
  it('adds the increment to the stored chapter, not a total supplied beside it', () => {
    const action: ClerkAction = {
      type: 'increment_secondary',
      entryId: 'lh',
      amount: 3,
      unit: 'chapter',
    };
    const result = applyPlan([entry()], [action]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patches).toEqual([{ entryId: 'lh', updates: { secondaryUnitCurrent: 43 } }]);
    expect(result.beforeImage.lh?.secondaryUnitCurrent).toBe(40);
    expect(result.lines[0]?.label).toContain('40 → 43');
    expect(result.lines[0]?.editable).toEqual({ value: 3, min: 1, max: 50 });
  });

  it('does not increment when the stored unit is missing or disagrees', () => {
    const action: ClerkAction = {
      type: 'increment_secondary',
      entryId: 'lh',
      amount: 3,
      unit: 'chapter',
    };
    expect(applyPlan([entry({ secondaryUnitKind: null })], [action]).ok).toBe(false);
    const disagreed = applyPlan([entry({ secondaryUnitKind: 'page' })], [action]);
    expect(disagreed.ok).toBe(false);
    if (!disagreed.ok) expect(disagreed.reason).toBe('unit');
  });

  it('asks instead of rolling past the current volume', () => {
    const action: ClerkAction = {
      type: 'increment_secondary',
      entryId: 'lh',
      amount: 3,
      unit: 'chapter',
    };
    const result = applyPlan(
      [entry({ secondaryUnitCurrent: 11, secondaryUnitTotal: 12 })],
      [action],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('overflow');
  });

  it('clears Up Next on completion unless the plan also queues the title', () => {
    const done: ClerkAction = {
      type: 'set_status',
      entryId: 'lh',
      status: 'completed',
      dropReason: null,
    };
    const cleared = applyPlan([entry()], [done]);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.patches[0]?.updates.priorityIndex).toBeNull();
      expect(cleared.beforeImage.lh?.queued).toBe(true);
      expect(cleared.beforeImage.lh?.priorityIndex).toBe(2);
    }

    const kept = applyPlan([entry()], [done, { type: 'set_queued', entryId: 'lh', queued: true }]);
    expect(kept.ok).toBe(true);
    if (kept.ok) {
      expect(kept.patches.some((patch) => patch.updates.priorityIndex === null)).toBe(false);
    }
  });

  it('appends a note without replacing the stored one', () => {
    const result = applyPlan(
      [entry({ notes: 'Earlier thought' })],
      [{ type: 'append_note', entryId: 'lh', text: 'The cold is a character.' }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patches[0]?.updates.notes).toBe('Earlier thought\nThe cold is a character.');
    expect(result.beforeImage.lh?.notes).toBe('Earlier thought');
  });
});

describe('applyNumberEdits', () => {
  const actions: ClerkAction[] = [
    { type: 'increment_secondary', entryId: 'lh', amount: 3, unit: 'chapter' },
  ];

  it('accepts an edited number inside the Zod bounds', () => {
    const edited = applyNumberEdits(actions, [{ lineIndex: 0, value: 10 }]);
    expect(edited.ok).toBe(true);
    if (edited.ok && edited.actions[0]?.type === 'increment_secondary') {
      expect(edited.actions[0].amount).toBe(10);
    }
  });

  it('rejects an edited number outside the bounds', () => {
    expect(applyNumberEdits(actions, [{ lineIndex: 0, value: 51 }]).ok).toBe(false);
    expect(applyNumberEdits(actions, [{ lineIndex: 0, value: 0 }]).ok).toBe(false);
  });
});
