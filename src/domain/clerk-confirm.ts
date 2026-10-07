import {
  applyNumberEdits,
  applyPlan,
  type ApplyEntry,
  type BeforeFields,
  type ClerkDiffLine,
} from '@/lib/clerk/apply';
import { MAX_CANDIDATES, SMALL_LIBRARY } from '@/lib/clerk/limits';
import { parseStoredPlan } from '@/lib/clerk/plan';
import type { ClerkAction } from '@/lib/clerk/types';

export const CLERK_UNAVAILABLE = 'The clerk is not available.';
export const CLERK_RESTING = 'The clerk is resting until 00:00 UTC.';
export const CLERK_READ_ERROR = 'The clerk could not read that. Try again.';
export const CLERK_EXPIRED = 'That plan expired.';
export const CLERK_MISSING = 'That plan is no longer here.';
export const CLERK_ALREADY = 'Already saved.';
export const CLERK_TOO_LONG = 'Keep that sentence under 1000 characters.';
export const CLERK_SAVED = 'Saved.';
export const CLERK_UNDONE = 'Undid the last saved plan.';
export const CLERK_NOTHING = 'There is nothing to undo.';
export const CLERK_SAVE_FAILED = 'That plan could not be saved.';
export const CLERK_UNDO_FAILED = 'That plan could not be undone.';
export const CLERK_NARROW = 'Name one title. The clerk does not update the whole archive at once.';
export const CLERK_NOT_IN_ARCHIVE = 'That title is not in this archive.';
export const CLERK_CATALOG_NONE = 'I could not find that in the catalog. Add an author or a year.';
export const CLERK_CATALOG_MANY = 'I found more than one match. Add an author or a year.';
export const CLERK_MIXED = 'The clerk can add a title or update the archive, not both in one plan.';
export const CLERK_EMPTY = 'Tell me what happened.';

const STATUSES = new Set(['in_progress', 'completed', 'planning', 'on_hold', 'dropped']);

export interface QueueRank {
  id: string;
  priorityIndex: number;
}

export interface StoredBeforeImage {
  entries: Record<string, BeforeFields>;
  lines: ClerkDiffLine[];
  createdIds: string[];
  addedQuoteIds: { entryId: string; quoteId: string }[];
  /** Every queued title's rank at confirm, including titles the plan did not name. */
  queueRanks: QueueRank[];
}

export interface StoredProposal {
  id: string;
  actions: unknown;
  beforeImage: unknown;
  summary: string;
  expiresAt: Date;
  appliedAt: Date | null;
}

export type ProposalDecision =
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'already' }
  | { kind: 'pending' }
  | { kind: 'clarification'; text: string }
  | { kind: 'chips'; prompt: string; ids: string[] }
  | { kind: 'apply' };

export function emptyBeforeImage(): StoredBeforeImage {
  return { entries: {}, lines: [], createdIds: [], addedQuoteIds: [], queueRanks: [] };
}

function cycleList(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => !!item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Attach the locked cycles to the entries this plan will change, and list
 * every rank that was queued before the write.
 */
export function confirmSnapshot(
  before: Record<string, BeforeFields>,
  locked: readonly { id: string; cycles: unknown; priorityIndex: number | null }[],
): { entries: Record<string, BeforeFields>; queueRanks: QueueRank[] } {
  const byId = new Map(locked.map((row) => [row.id, row]));
  const entries: Record<string, BeforeFields> = {};
  for (const [id, fields] of Object.entries(before)) {
    entries[id] = { ...fields, cycles: cycleList(byId.get(id)?.cycles) };
  }
  const queueRanks = locked
    .filter(
      (row): row is { id: string; cycles: unknown; priorityIndex: number } =>
        typeof row.priorityIndex === 'number',
    )
    .map((row) => ({ id: row.id, priorityIndex: row.priorityIndex }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, queueRanks };
}

/** Ranks this confirm changed. The stored number is the rank from before the write. */
export function changedQueueRanks(
  before: readonly { id: string; priorityIndex: number | null }[],
  after: readonly { id: string; priorityIndex: number | null }[],
): QueueRank[] {
  const afterById = new Map(after.map((row) => [row.id, row.priorityIndex]));
  const ranks: QueueRank[] = [];
  for (const row of before) {
    if (typeof row.priorityIndex !== 'number') continue;
    if ((afterById.get(row.id) ?? null) === row.priorityIndex) continue;
    ranks.push({ id: row.id, priorityIndex: row.priorityIndex });
  }
  return ranks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Ranks to write after undo. Changed titles go back to the stored rank.
 * A title queued later keeps its rank when that number is free, and otherwise
 * takes the next free one. Titles that already have the right rank are omitted.
 */
export function queueRestoreWrites(input: {
  changed: readonly QueueRank[];
  current: readonly QueueRank[];
}): QueueRank[] {
  const changedIds = new Set(input.changed.map((rank) => rank.id));
  const desired = new Map(input.changed.map((rank) => [rank.id, rank.priorityIndex]));
  const taken = new Set(input.changed.map((rank) => rank.priorityIndex));
  const extras = input.current
    .filter((rank) => !changedIds.has(rank.id))
    .sort((a, b) => a.priorityIndex - b.priorityIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const extra of extras) {
    if (!taken.has(extra.priorityIndex)) {
      taken.add(extra.priorityIndex);
      continue;
    }
    let free = 1;
    while (taken.has(free)) free += 1;
    taken.add(free);
    desired.set(extra.id, free);
  }
  const currentById = new Map(input.current.map((rank) => [rank.id, rank.priorityIndex]));
  return [...desired.entries()]
    .filter(([id, priorityIndex]) => currentById.get(id) !== priorityIndex)
    .map(([id, priorityIndex]) => ({ id, priorityIndex }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readClarification(actions: unknown): string | null {
  const text = asRecord(actions)?.clarification;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readChips(actions: unknown): { prompt: string; ids: string[] } | null {
  const chips = asRecord(asRecord(actions)?.chips);
  if (!chips || typeof chips.prompt !== 'string' || !Array.isArray(chips.ids)) return null;
  const ids = chips.ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return null;
  return { prompt: chips.prompt, ids: ids.slice(0, 3) };
}

export function isPendingActions(actions: unknown): boolean {
  return asRecord(actions)?.pending === true;
}

export function classifyProposal(row: StoredProposal | null, now: Date): ProposalDecision {
  if (!row) return { kind: 'missing' };
  if (row.appliedAt) return { kind: 'already' };
  if (row.expiresAt.getTime() <= now.getTime()) return { kind: 'expired' };
  if (isPendingActions(row.actions)) return { kind: 'pending' };
  const clarification = readClarification(row.actions);
  if (clarification) return { kind: 'clarification', text: clarification };
  const chips = readChips(row.actions);
  if (chips) return { kind: 'chips', prompt: chips.prompt, ids: chips.ids };
  return { kind: 'apply' };
}

function isDiffLine(value: unknown): value is ClerkDiffLine {
  const line = asRecord(value);
  if (!line) return false;
  if (
    typeof line.title !== 'string' ||
    typeof line.category !== 'string' ||
    typeof line.status !== 'string' ||
    typeof line.label !== 'string'
  ) {
    return false;
  }
  if (line.editable == null) return true;
  const editable = asRecord(line.editable);
  return (
    !!editable &&
    typeof editable.value === 'number' &&
    typeof editable.min === 'number' &&
    typeof editable.max === 'number'
  );
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function readBeforeFields(value: unknown): BeforeFields | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (typeof raw.status !== 'string' || !STATUSES.has(raw.status)) return null;
  if (!isNumberOrNull(raw.rating) || !isStringOrNull(raw.notes)) return null;
  if (!Array.isArray(raw.tags) || !raw.tags.every((tag) => typeof tag === 'string')) return null;
  if (typeof raw.queued !== 'boolean' || !isNumberOrNull(raw.priorityIndex)) return null;
  if (typeof raw.primaryUnitCurrent !== 'number' || !isNumberOrNull(raw.primaryUnitTotal)) {
    return null;
  }
  if (typeof raw.secondaryUnitCurrent !== 'number' || !isNumberOrNull(raw.secondaryUnitTotal)) {
    return null;
  }
  if (
    raw.secondaryUnitKind !== null &&
    raw.secondaryUnitKind !== 'chapter' &&
    raw.secondaryUnitKind !== 'page'
  ) {
    return null;
  }
  if (!isStringOrNull(raw.dropReason) || !isStringOrNull(raw.startedAt)) return null;
  if (!isStringOrNull(raw.completedAt)) return null;
  let cycles: unknown[] | undefined;
  if (raw.cycles !== undefined) {
    if (!Array.isArray(raw.cycles) || raw.cycles.some((item) => !asRecord(item))) return null;
    cycles = raw.cycles;
  }
  return {
    status: raw.status,
    rating: raw.rating,
    notes: raw.notes,
    tags: raw.tags,
    queued: raw.queued,
    priorityIndex: raw.priorityIndex,
    primaryUnitCurrent: raw.primaryUnitCurrent,
    primaryUnitTotal: raw.primaryUnitTotal,
    secondaryUnitCurrent: raw.secondaryUnitCurrent,
    secondaryUnitTotal: raw.secondaryUnitTotal,
    secondaryUnitKind: raw.secondaryUnitKind,
    dropReason: raw.dropReason,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    ...(cycles !== undefined ? { cycles } : {}),
  };
}

export function readBeforeImage(value: unknown): StoredBeforeImage | null {
  const record = asRecord(value);
  const entriesRaw = asRecord(record?.entries);
  if (!record || !entriesRaw) return null;
  if (!Array.isArray(record.lines) || !record.lines.every(isDiffLine)) return null;
  if (!Array.isArray(record.createdIds) || record.createdIds.some((id) => typeof id !== 'string')) {
    return null;
  }
  if (!Array.isArray(record.addedQuoteIds)) return null;

  const entries: Record<string, BeforeFields> = {};
  for (const [id, raw] of Object.entries(entriesRaw)) {
    const fields = readBeforeFields(raw);
    if (!fields) return null;
    entries[id] = fields;
  }

  const addedQuoteIds: { entryId: string; quoteId: string }[] = [];
  for (const item of record.addedQuoteIds) {
    const pair = asRecord(item);
    if (!pair || typeof pair.entryId !== 'string' || typeof pair.quoteId !== 'string') return null;
    addedQuoteIds.push({ entryId: pair.entryId, quoteId: pair.quoteId });
  }

  const queueRanks: QueueRank[] = [];
  if (record.queueRanks !== undefined) {
    if (!Array.isArray(record.queueRanks)) return null;
    for (const item of record.queueRanks) {
      const pair = asRecord(item);
      if (!pair || typeof pair.id !== 'string') return null;
      if (typeof pair.priorityIndex !== 'number' || !Number.isInteger(pair.priorityIndex))
        return null;
      queueRanks.push({ id: pair.id, priorityIndex: pair.priorityIndex });
    }
  }

  return {
    entries,
    lines: record.lines as ClerkDiffLine[],
    createdIds: record.createdIds as string[],
    addedQuoteIds,
    queueRanks,
  };
}

/** Fields the domain update understands. priorityIndex is always present so a completion cannot clear Up Next by omission. */
export function undoUpdates(fields: BeforeFields): Record<string, unknown> {
  return {
    status: fields.status,
    rating: fields.rating,
    notes: fields.notes,
    tags: fields.tags,
    priorityIndex: fields.priorityIndex,
    primaryUnitCurrent: fields.primaryUnitCurrent,
    primaryUnitTotal: fields.primaryUnitTotal,
    secondaryUnitCurrent: fields.secondaryUnitCurrent,
    secondaryUnitTotal: fields.secondaryUnitTotal,
    secondaryUnitKind: fields.secondaryUnitKind,
    dropReason: fields.dropReason,
    startedAt: fields.startedAt,
    completedAt: fields.completedAt,
    ...(fields.cycles !== undefined ? { cycles: fields.cycles } : {}),
  };
}

export function cleanEdits(edits: unknown): { lineIndex: number; value: number }[] {
  if (!Array.isArray(edits)) return [];
  const cleaned: { lineIndex: number; value: number }[] = [];
  for (const edit of edits.slice(0, 5)) {
    const record = asRecord(edit);
    if (!record) continue;
    const lineIndex = record.lineIndex;
    const value = record.value;
    if (typeof lineIndex !== 'number' || typeof value !== 'number') continue;
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || !Number.isFinite(value)) continue;
    cleaned.push({ lineIndex, value });
  }
  return cleaned;
}

export function prepareConfirm(input: {
  actions: unknown;
  entries: readonly ApplyEntry[];
  edits: readonly { lineIndex: number; value: number }[];
}):
  | {
      ok: true;
      actions: ClerkAction[];
      applied: Extract<ReturnType<typeof applyPlan>, { ok: true }>;
    }
  | { ok: false; text: string } {
  if (
    readClarification(input.actions) ||
    readChips(input.actions) ||
    isPendingActions(input.actions)
  ) {
    return { ok: false, text: CLERK_MISSING };
  }
  const ownedIds = input.entries.map((entry) => entry.id);
  const parsed = parseStoredPlan(input.actions, ownedIds);
  if (!parsed.ok) {
    if (parsed.reason === 'unknown_id') return { ok: false, text: CLERK_NOT_IN_ARCHIVE };
    if (parsed.reason === 'mixed_create') return { ok: false, text: CLERK_MIXED };
    return { ok: false, text: CLERK_MISSING };
  }
  const edited = applyNumberEdits(parsed.plan.actions, input.edits);
  if (!edited.ok) return edited;
  const applied = applyPlan(input.entries, edited.actions);
  if (!applied.ok) return { ok: false, text: applied.text };
  const create = applied.creates.find((action) => action.hit == null);
  if (create) return { ok: false, text: CLERK_CATALOG_NONE };
  return { ok: true, actions: edited.actions, applied };
}

export function candidatesForModel<T extends { id: string }>(
  entries: readonly T[],
  rankedIds: readonly string[],
): { kind: 'narrow'; text: string } | { kind: 'rows'; rows: T[] } {
  if (rankedIds.length > MAX_CANDIDATES) return { kind: 'narrow', text: CLERK_NARROW };
  if (rankedIds.length === 0) {
    if (entries.length > SMALL_LIBRARY) return { kind: 'narrow', text: CLERK_NARROW };
    return { kind: 'rows', rows: [...entries] };
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows = rankedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return { kind: 'rows', rows };
}

export function chipsFor(
  ids: readonly string[],
  entries: readonly { id: string; title: string; category: string; status: string }[],
): { id: string; title: string; category: string; status: string }[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.slice(0, 3).flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

export function summarizePlan(
  actions: readonly ClerkAction[],
  titles: ReadonlyMap<string, string>,
): string {
  if (actions.length !== 1) return `Apply ${actions.length} changes.`;
  const action = actions[0]!;
  const title = 'entryId' in action ? (titles.get(action.entryId) ?? 'that title') : '';
  switch (action.type) {
    case 'increment_secondary': {
      const noun =
        action.unit === 'page'
          ? 'pages'
          : action.unit === 'episode'
            ? 'episodes'
            : action.unit === 'chapter'
              ? 'chapters'
              : 'units';
      return `Add ${action.amount} ${noun} to ${title}.`;
    }
    case 'increment_primary':
      return `Add ${action.amount} to the season or volume of ${title}.`;
    case 'set_progress':
      return `Set the position on ${title}.`;
    case 'set_status':
      return `Mark ${title} ${action.status.replaceAll('_', ' ')}.`;
    case 'set_rating':
      return `Rate ${title} ${action.rating} out of 10.`;
    case 'append_note':
      return `Append a note on ${title}.`;
    case 'add_quote':
      return `Add a quote on ${title}.`;
    case 'add_tags':
      return `Add tags on ${title}.`;
    case 'remove_tags':
      return `Remove tags on ${title}.`;
    case 'set_queued':
      return action.queued ? `Put ${title} on Up Next.` : `Take ${title} off Up Next.`;
    case 'create_from_catalog':
      return `Add ${action.hit?.title ?? action.query} from the catalog.`;
    case 'set_unit':
      return `Store ${title} in ${action.unit}s.`;
  }
}
