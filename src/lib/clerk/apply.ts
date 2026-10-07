import { MAX_NOTES_LENGTH } from '@/lib/constants';
import { INCREMENT_PRIMARY_MAX, INCREMENT_SECONDARY_MAX } from './limits';
import type { ClerkAction, ClerkStatus, SecondaryUnit } from './types';

export interface ApplyEntry {
  id: string;
  title: string;
  category: string;
  status: string;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  secondaryUnitKind: SecondaryUnit | null;
  rating: number | null;
  notes: string | null;
  tags: string[];
  queued: boolean;
  priorityIndex: number | null;
  dropReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** Previous field values for one entry. Undo writes these back. */
export interface BeforeFields {
  status: string;
  rating: number | null;
  notes: string | null;
  tags: string[];
  queued: boolean;
  priorityIndex: number | null;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  secondaryUnitKind: SecondaryUnit | null;
  dropReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ClerkDiffLine {
  title: string;
  category: string;
  status: string;
  label: string;
  editable: { value: number; min: number; max: number } | null;
}

export interface EntryPatch {
  entryId: string;
  updates: Record<string, unknown>;
}

export type ApplyResult =
  | {
      ok: true;
      beforeImage: Record<string, BeforeFields>;
      patches: EntryPatch[];
      lines: ClerkDiffLine[];
      quoteAdds: {
        entryId: string;
        text: string;
        speaker: string | null;
        citation: string | null;
      }[];
      creates: Extract<ClerkAction, { type: 'create_from_catalog' }>[];
      /** Entries that should be placed on Up Next. The server uses the existing queue helper. */
      queueOn: string[];
    }
  | {
      ok: false;
      reason: 'missing' | 'unit' | 'overflow' | 'bounds' | 'catalog_miss' | 'note';
      text: string;
      entryId?: string;
      spoken?: SecondaryUnit;
    };

function snapshot(entry: ApplyEntry): BeforeFields {
  return {
    status: entry.status,
    rating: entry.rating,
    notes: entry.notes,
    tags: [...entry.tags],
    queued: entry.queued,
    priorityIndex: entry.priorityIndex,
    primaryUnitCurrent: entry.primaryUnitCurrent,
    primaryUnitTotal: entry.primaryUnitTotal,
    secondaryUnitCurrent: entry.secondaryUnitCurrent,
    secondaryUnitTotal: entry.secondaryUnitTotal,
    secondaryUnitKind: entry.secondaryUnitKind,
    dropReason: entry.dropReason,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
  };
}

function noun(unit: SecondaryUnit | 'episode' | null, amount: number): string {
  const plural = amount === 1 ? '' : 's';
  if (unit === 'page') return `page${plural}`;
  if (unit === 'episode') return `episode${plural}`;
  if (unit === 'chapter') return `chapter${plural}`;
  return amount === 1 ? 'unit' : 'units';
}

function gateUnit(entry: ApplyEntry, unit: SecondaryUnit | 'episode' | null): ApplyResult | null {
  if (unit !== 'chapter' && unit !== 'page') {
    if (
      (entry.category === 'book' || entry.category === 'manga') &&
      entry.secondaryUnitKind == null
    ) {
      return {
        ok: false,
        reason: 'unit',
        entryId: entry.id,
        text: `Are those chapters or pages of ${entry.title}?`,
      };
    }
    return null;
  }
  if (entry.secondaryUnitKind !== unit) {
    return {
      ok: false,
      reason: 'unit',
      entryId: entry.id,
      spoken: unit,
      text: `${entry.title} is not stored as ${unit}s yet.`,
    };
  }
  return null;
}

function editable(
  value: number,
  min: number,
  max: number,
): { value: number; min: number; max: number } {
  return { value, min, max };
}

/**
 * Pure arithmetic. Increments add to the stored number. They do not trust a total from the model.
 * Overflow past the current season or volume is a clarification, not a rollover.
 */
export function applyPlan(
  entries: readonly ApplyEntry[],
  actions: readonly ClerkAction[],
): ApplyResult {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const beforeImage: Record<string, BeforeFields> = {};
  const working = new Map<string, ApplyEntry>();
  const patches = new Map<string, Record<string, unknown>>();
  const lines: ClerkDiffLine[] = [];
  const quoteAdds: Extract<ApplyResult, { ok: true }>['quoteAdds'] = [];
  const creates: Extract<ClerkAction, { type: 'create_from_catalog' }>[] = [];
  const queueOn: string[] = [];

  const touch = (entry: ApplyEntry): ApplyEntry => {
    if (!beforeImage[entry.id]) beforeImage[entry.id] = snapshot(entry);
    const copy = working.get(entry.id) ?? { ...entry, tags: [...entry.tags] };
    working.set(entry.id, copy);
    return copy;
  };

  const remember = (entryId: string, updates: Record<string, unknown>) => {
    patches.set(entryId, { ...patches.get(entryId), ...updates });
  };

  for (const action of actions) {
    if (action.type === 'create_from_catalog') {
      if (!action.hit) {
        return {
          ok: false,
          reason: 'catalog_miss',
          text: 'I could not find that in the catalog. Add an author or a year.',
        };
      }
      creates.push(action);
      lines.push({
        title: action.hit.title,
        category: action.hit.category,
        status: 'planning',
        label: 'Add this catalog hit',
        editable: null,
      });
      continue;
    }

    const entry = byId.get(action.entryId);
    if (!entry)
      return {
        ok: false,
        reason: 'missing',
        text: 'That title is not in this archive.',
        entryId: action.entryId,
      };
    const current = touch(entry);

    if (action.type === 'increment_secondary') {
      const blocked = gateUnit(current, action.unit);
      if (blocked) return blocked;
      const next = current.secondaryUnitCurrent + action.amount;
      if (current.secondaryUnitTotal != null && next > current.secondaryUnitTotal) {
        return {
          ok: false,
          reason: 'overflow',
          entryId: current.id,
          text: `${current.title} would pass the end of this ${current.category === 'book' || current.category === 'manga' ? 'volume' : 'season'}. Say if it should roll over.`,
        };
      }
      current.secondaryUnitCurrent = next;
      remember(current.id, { secondaryUnitCurrent: next });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: `${noun(action.unit ?? current.secondaryUnitKind, action.amount)} ${entry.secondaryUnitCurrent} → ${next}`,
        editable: editable(action.amount, 1, INCREMENT_SECONDARY_MAX),
      });
      continue;
    }

    if (action.type === 'increment_primary') {
      const next = current.primaryUnitCurrent + action.amount;
      if (current.primaryUnitTotal != null && next > current.primaryUnitTotal) {
        return {
          ok: false,
          reason: 'overflow',
          entryId: current.id,
          text: `${current.title} would pass the last season or volume. Say if it should roll over.`,
        };
      }
      current.primaryUnitCurrent = next;
      remember(current.id, { primaryUnitCurrent: next });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: `season or volume ${entry.primaryUnitCurrent} → ${next}`,
        editable: editable(action.amount, 1, INCREMENT_PRIMARY_MAX),
      });
      continue;
    }

    if (action.type === 'set_progress') {
      const blocked = gateUnit(current, action.unit);
      if (blocked && action.secondary != null) return blocked;
      if (action.secondary != null) {
        if (current.secondaryUnitTotal != null && action.secondary > current.secondaryUnitTotal) {
          return {
            ok: false,
            reason: 'overflow',
            entryId: current.id,
            text: `${current.title} does not have that many in this season or volume.`,
          };
        }
        current.secondaryUnitCurrent = action.secondary;
        remember(current.id, { secondaryUnitCurrent: action.secondary });
      }
      if (action.primary != null) {
        if (current.primaryUnitTotal != null && action.primary > current.primaryUnitTotal) {
          return {
            ok: false,
            reason: 'overflow',
            entryId: current.id,
            text: `${current.title} does not have that many seasons or volumes.`,
          };
        }
        current.primaryUnitCurrent = action.primary;
        remember(current.id, { primaryUnitCurrent: action.primary });
      }
      const value = action.secondary ?? action.primary ?? 0;
      const max =
        action.secondary != null
          ? (current.secondaryUnitTotal ?? 100000)
          : (current.primaryUnitTotal ?? 10000);
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label:
          action.secondary != null
            ? `${noun(action.unit ?? current.secondaryUnitKind, 2)} ${entry.secondaryUnitCurrent} → ${action.secondary}`
            : `season or volume ${entry.primaryUnitCurrent} → ${action.primary}`,
        editable: editable(value, 0, max),
      });
      continue;
    }

    if (action.type === 'set_status') {
      current.status = action.status;
      const updates: Record<string, unknown> = { status: action.status };
      if (action.status === 'dropped') updates.dropReason = action.dropReason;
      if (action.status === 'in_progress' && current.startedAt == null) {
        updates.startedAt = new Date().toISOString();
      }
      const alsoQueued = actions.some(
        (other) => other.type === 'set_queued' && other.entryId === current.id && other.queued,
      );
      if (action.status === 'completed' && !alsoQueued) {
        current.queued = false;
        current.priorityIndex = null;
        updates.priorityIndex = null;
      } else if (action.status === 'completed' && entry.priorityIndex != null) {
        // The domain clears Up Next when a completion omits priorityIndex.
        // Repeating the current rank keeps it when this plan also queues the title.
        updates.priorityIndex = entry.priorityIndex;
      }
      remember(current.id, updates);
      lines.push({
        title: current.title,
        category: current.category,
        status: entry.status,
        label: `status ${entry.status.replaceAll('_', ' ')} → ${action.status.replaceAll('_', ' ')}`,
        editable: null,
      });
      continue;
    }

    if (action.type === 'set_rating') {
      current.rating = action.rating;
      remember(current.id, { rating: action.rating });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: `rating ${entry.rating ?? 'none'} → ${action.rating}`,
        editable: editable(action.rating, 1, 10),
      });
      continue;
    }

    if (action.type === 'append_note') {
      const next = current.notes ? `${current.notes}\n${action.text}` : action.text;
      if (next.length > MAX_NOTES_LENGTH) {
        return {
          ok: false,
          reason: 'note',
          entryId: current.id,
          text: 'That note does not fit on this title.',
        };
      }
      current.notes = next;
      remember(current.id, { notes: next });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: 'Append the note you wrote',
        editable: null,
      });
      continue;
    }

    if (action.type === 'add_quote') {
      quoteAdds.push({
        entryId: current.id,
        text: action.text,
        speaker: action.speaker,
        citation: action.citation,
      });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: 'Add the quote you wrote',
        editable: null,
      });
      continue;
    }

    if (action.type === 'add_tags' || action.type === 'remove_tags') {
      const have = new Set(current.tags.map((tag) => tag.toLowerCase()));
      if (action.type === 'add_tags') {
        for (const tag of action.tags) have.add(tag.toLowerCase());
      } else {
        for (const tag of action.tags) have.delete(tag.toLowerCase());
      }
      const tags = [...have];
      if (tags.length > 50) {
        return {
          ok: false,
          reason: 'bounds',
          entryId: current.id,
          text: 'A title can hold 50 tags.',
        };
      }
      current.tags = tags;
      remember(current.id, { tags });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label:
          action.type === 'add_tags'
            ? `Add tags ${action.tags.join(', ')}`
            : `Remove tags ${action.tags.join(', ')}`,
        editable: null,
      });
      continue;
    }

    if (action.type === 'set_queued') {
      current.queued = action.queued;
      if (!action.queued) {
        current.priorityIndex = null;
        remember(current.id, { priorityIndex: null });
      } else if (entry.priorityIndex == null) {
        queueOn.push(current.id);
      }
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: action.queued ? 'Put it on Up Next' : 'Take it off Up Next',
        editable: null,
      });
      continue;
    }

    if (action.type === 'set_unit') {
      if (current.category !== 'book' && current.category !== 'manga') {
        return {
          ok: false,
          reason: 'unit',
          entryId: current.id,
          text: 'Only a book or manga stores chapters or pages.',
        };
      }
      current.secondaryUnitKind = action.unit;
      remember(current.id, { secondaryUnitKind: action.unit });
      lines.push({
        title: current.title,
        category: current.category,
        status: current.status,
        label: `Store the secondary unit as ${action.unit}s`,
        editable: null,
      });
    }
  }

  return {
    ok: true,
    beforeImage,
    patches: [...patches.entries()].map(([entryId, updates]) => ({ entryId, updates })),
    lines,
    quoteAdds,
    creates,
    queueOn,
  };
}

/** Replace editable numbers on a stored plan. Out-of-range edits do not write. */
export function applyNumberEdits(
  actions: readonly ClerkAction[],
  edits: readonly { lineIndex: number; value: number }[],
): { ok: true; actions: ClerkAction[] } | { ok: false; text: string } {
  const next = actions.map((action) => ({ ...action })) as ClerkAction[];
  for (const edit of edits) {
    const action = next[edit.lineIndex];
    if (!action) return { ok: false, text: 'That line is not on this plan.' };
    if (!Number.isInteger(edit.value))
      return { ok: false, text: 'That number has to be a whole number.' };
    if (action.type === 'increment_secondary') {
      if (edit.value < 1 || edit.value > INCREMENT_SECONDARY_MAX) {
        return { ok: false, text: `Use a number from 1 to ${INCREMENT_SECONDARY_MAX}.` };
      }
      action.amount = edit.value;
      continue;
    }
    if (action.type === 'increment_primary') {
      if (edit.value < 1 || edit.value > INCREMENT_PRIMARY_MAX) {
        return { ok: false, text: `Use a number from 1 to ${INCREMENT_PRIMARY_MAX}.` };
      }
      action.amount = edit.value;
      continue;
    }
    if (action.type === 'set_rating') {
      if (edit.value < 1 || edit.value > 10)
        return { ok: false, text: 'Ratings are a whole number from 1 to 10.' };
      action.rating = edit.value;
      continue;
    }
    if (action.type === 'set_progress') {
      if (edit.value < 0) return { ok: false, text: 'That number cannot be negative.' };
      if (action.secondary != null) action.secondary = edit.value;
      else action.primary = edit.value;
      continue;
    }
    return { ok: false, text: 'That line does not have an editable number.' };
  }
  return { ok: true, actions: next };
}

export function isClerkStatus(value: string): value is ClerkStatus {
  return (
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'planning' ||
    value === 'on_hold' ||
    value === 'dropped'
  );
}
