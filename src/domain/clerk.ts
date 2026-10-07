import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { logActivity } from '@/domain/activity-log';
import { domainDb, setDomainDb, type DbClient } from '@/domain/db-context';
import {
  addMediaQuoteForUser,
  createMediaEntryForUser,
  deleteMediaEntryForUser,
  deleteMediaQuoteForUser,
  togglePriorityQueueForUser,
  updateMediaProgressForUser,
} from '@/domain/media';
import {
  CLERK_ALREADY,
  CLERK_CATALOG_MANY,
  CLERK_CATALOG_NONE,
  CLERK_EMPTY,
  CLERK_EXPIRED,
  CLERK_MISSING,
  CLERK_MIXED,
  CLERK_NOT_IN_ARCHIVE,
  CLERK_NOTHING,
  CLERK_READ_ERROR,
  CLERK_RESTING,
  CLERK_SAVED,
  CLERK_SAVE_FAILED,
  CLERK_TOO_LONG,
  CLERK_UNAVAILABLE,
  CLERK_UNDONE,
  CLERK_UNDO_FAILED,
  candidatesForModel,
  chipsFor,
  classifyProposal,
  cleanEdits,
  emptyBeforeImage,
  isPendingActions,
  prepareConfirm,
  readBeforeImage,
  readChips,
  readClarification,
  summarizePlan,
  undoUpdates,
  type StoredBeforeImage,
} from '@/domain/clerk-confirm';
import {
  authorizeCall,
  crossedFleetAlert,
  pageBudget,
  reconcileUsage,
  utcUsageDay,
} from '@/domain/clerk-quota';
import { callWasBilled, parseResponsesOutput, readUsage } from '@/domain/clerk-response';
import {
  ASSISTANT_FLEET_USER_ID,
  assistantEvents,
  assistantProposals,
  assistantUsage,
  mediaEntries,
} from '@/db/schema';
import { db } from '@/lib/db';
import { applyPlan, isClerkStatus, type ApplyEntry, type ClerkDiffLine } from '@/lib/clerk/apply';
import { parseGrammar } from '@/lib/clerk/grammar';
import {
  MAX_CANDIDATES,
  MAX_MESSAGE_CHARS,
  MODEL_ID,
  PROPOSAL_TTL_MS,
  estimateCallMicros,
  estimateTextTokens,
} from '@/lib/clerk/limits';
import { rankTitles } from '@/lib/clerk/match';
import { parseModelPlan, parseStoredPlan } from '@/lib/clerk/plan';
import { buildResponsesBody, type ResponsesBody } from '@/lib/clerk/prompt';
import { stripHiddenCharacters } from '@/lib/clerk/sanitize';
import type {
  CatalogHit,
  ClerkAction,
  ClerkCatalogRow,
  ClerkCategory,
  ClerkStatus,
} from '@/lib/clerk/types';
import { MAX_TITLE_LENGTH } from '@/lib/constants';
import { searchAnimeAndManga } from '@/lib/services/anime';
import { searchBooks } from '@/lib/services/openlibrary';
import { searchTmdbMovies } from '@/lib/services/tmdb';
import { searchTvmazeShows } from '@/lib/services/tvmaze';
import type { SearchResult } from '@/types/search';

const RESPONSE_URL = 'https://api.openai.com/v1/responses';
const RESPONSE_TIMEOUT_MS = 25_000;
const SAFE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const TOO_WIDE = 'That sentence reaches too much of the archive to read.';

export type ClerkServiceTurn =
  | {
      kind: 'proposal';
      proposal: { id: string; summary: string; lines: ClerkDiffLine[] };
      remaining: number;
    }
  | {
      kind: 'chips';
      prompt: string;
      chips: { id: string; title: string; category: string; status: string }[];
      remaining: number;
    }
  | { kind: 'message'; text: string; remaining: number }
  | { kind: 'resting'; text: string; remaining: number };

interface ProposalRecord {
  id: string;
  userId: string;
  clientMessageId: string;
  actions: unknown;
  beforeImage: unknown;
  summary: string;
  expiresAt: Date;
  appliedAt: Date | null;
  undoneAt: Date | null;
}

class ClerkTurnError extends Error {
  constructor(readonly text: string) {
    super(text);
    this.name = 'ClerkTurnError';
  }
}

function message(text: string, remaining: number): ClerkServiceTurn {
  return { kind: 'message', text, remaining };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isCategory(value: string): value is ClerkCategory {
  return (
    value === 'show' ||
    value === 'movie' ||
    value === 'book' ||
    value === 'anime' ||
    value === 'manga'
  );
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function quoteIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const id = asRecord(item)?.id;
    return typeof id === 'string' ? [id] : [];
  });
}

function entryIdsIn(actions: unknown): string[] {
  const list = asRecord(actions)?.actions;
  if (!Array.isArray(list)) return [];
  const ids = new Set<string>();
  for (const action of list) {
    const entryId = asRecord(action)?.entryId;
    if (typeof entryId === 'string') ids.add(entryId);
  }
  return [...ids].sort();
}

const entrySelection = {
  id: mediaEntries.id,
  title: mediaEntries.title,
  category: mediaEntries.category,
  status: mediaEntries.status,
  primaryUnitCurrent: mediaEntries.primaryUnitCurrent,
  primaryUnitTotal: mediaEntries.primaryUnitTotal,
  secondaryUnitCurrent: mediaEntries.secondaryUnitCurrent,
  secondaryUnitTotal: mediaEntries.secondaryUnitTotal,
  secondaryUnitKind: mediaEntries.secondaryUnitKind,
  rating: mediaEntries.rating,
  priorityIndex: mediaEntries.priorityIndex,
  notes: mediaEntries.notes,
  tags: mediaEntries.tags,
  dropReason: mediaEntries.dropReason,
  startedAt: mediaEntries.startedAt,
  completedAt: mediaEntries.completedAt,
};

function mapEntry(row: {
  id: string;
  title: string;
  category: string;
  status: string;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  secondaryUnitKind: string | null;
  rating: number | null;
  priorityIndex: number | null;
  notes: string | null;
  tags: unknown;
  dropReason: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
}): ApplyEntry | null {
  if (!isCategory(row.category) || !isClerkStatus(row.status)) return null;
  const kind =
    row.secondaryUnitKind === 'chapter' || row.secondaryUnitKind === 'page'
      ? row.secondaryUnitKind
      : null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    primaryUnitCurrent: row.primaryUnitCurrent,
    primaryUnitTotal: row.primaryUnitTotal,
    secondaryUnitCurrent: row.secondaryUnitCurrent,
    secondaryUnitTotal: row.secondaryUnitTotal,
    secondaryUnitKind: kind,
    rating: row.rating,
    notes: row.notes,
    tags: stringList(row.tags),
    queued: row.priorityIndex != null,
    priorityIndex: row.priorityIndex,
    dropReason: row.dropReason,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
  };
}

function toCatalog(entry: ApplyEntry): ClerkCatalogRow {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category as ClerkCategory,
    status: entry.status as ClerkStatus,
    primaryUnitCurrent: entry.primaryUnitCurrent,
    primaryUnitTotal: entry.primaryUnitTotal,
    secondaryUnitCurrent: entry.secondaryUnitCurrent,
    secondaryUnitTotal: entry.secondaryUnitTotal,
    secondaryUnitKind: entry.secondaryUnitKind,
    rating: entry.rating,
    queued: entry.queued,
  };
}

async function loadEntries(userId: string, tx?: DbClient, ids?: string[]): Promise<ApplyEntry[]> {
  const client = tx ?? db;
  const filters = [eq(mediaEntries.userId, userId)];
  if (ids) {
    if (ids.length === 0) return [];
    filters.push(inArray(mediaEntries.id, ids));
  }
  const query = client
    .select(entrySelection)
    .from(mediaEntries)
    .where(and(...filters))
    .orderBy(asc(mediaEntries.id));
  const rows = tx ? await query.for('update') : await query;
  return rows.flatMap((row) => {
    const mapped = mapEntry(row);
    return mapped ? [mapped] : [];
  });
}

async function remainingFor(userId: string, now = new Date()): Promise<number> {
  const budget = await clerkPageBudget(userId, now);
  return budget.remaining;
}

export async function clerkPageBudget(
  userId: string,
  now = new Date(),
): Promise<{ remaining: number; resting: boolean }> {
  const usageDay = utcUsageDay(now);
  const [user] = await db
    .select({ calls: assistantUsage.calls })
    .from(assistantUsage)
    .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDay, usageDay)))
    .limit(1);
  const [fleet] = await db
    .select({
      spentMicros: assistantUsage.spentMicros,
      reservedMicros: assistantUsage.reservedMicros,
    })
    .from(assistantUsage)
    .where(
      and(
        eq(assistantUsage.userId, ASSISTANT_FLEET_USER_ID),
        eq(assistantUsage.usageDay, usageDay),
      ),
    )
    .limit(1);
  return pageBudget({
    calls: user?.calls ?? 0,
    fleetSpentMicros: fleet?.spentMicros ?? 0,
    fleetReservedMicros: fleet?.reservedMicros ?? 0,
  });
}

async function findByMessage(
  userId: string,
  clientMessageId: string,
): Promise<ProposalRecord | null> {
  const [row] = await db
    .select()
    .from(assistantProposals)
    .where(
      and(
        eq(assistantProposals.userId, userId),
        eq(assistantProposals.clientMessageId, clientMessageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findById(userId: string, proposalId: string): Promise<ProposalRecord | null> {
  const [row] = await db
    .select()
    .from(assistantProposals)
    .where(and(eq(assistantProposals.id, proposalId), eq(assistantProposals.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function insertProposal(input: {
  userId: string;
  clientMessageId: string;
  actions: unknown;
  beforeImage: StoredBeforeImage;
  summary: string;
}): Promise<ProposalRecord> {
  const [row] = await db
    .insert(assistantProposals)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      actions: input.actions,
      beforeImage: input.beforeImage,
      summary: input.summary,
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    })
    .returning();
  if (!row) throw new Error('Clerk proposal was not stored');
  return row;
}

async function replay(
  userId: string,
  row: ProposalRecord,
  remaining: number,
): Promise<ClerkServiceTurn> {
  if (row.appliedAt) return message(CLERK_ALREADY, remaining);
  if (!isPendingActions(row.actions) && row.expiresAt.getTime() <= Date.now()) {
    return message(CLERK_EXPIRED, remaining);
  }
  if (isPendingActions(row.actions)) return message(CLERK_READ_ERROR, remaining);
  const clarification = readClarification(row.actions);
  if (clarification) return message(clarification, remaining);
  const chips = readChips(row.actions);
  if (chips) {
    const entries = await loadEntries(userId);
    const view = chipsFor(chips.ids, entries);
    if (view.length === 0) return message(CLERK_NOT_IN_ARCHIVE, remaining);
    return { kind: 'chips', prompt: chips.prompt, chips: view, remaining };
  }
  const image = readBeforeImage(row.beforeImage);
  if (!image) return message(CLERK_MISSING, remaining);
  return {
    kind: 'proposal',
    proposal: { id: row.id, summary: row.summary, lines: image.lines },
    remaining,
  };
}

async function remember(input: {
  userId: string;
  clientMessageId: string;
  actions: unknown;
  beforeImage: StoredBeforeImage;
  summary: string;
  lines?: ClerkDiffLine[];
  chips?: { id: string; title: string; category: string; status: string }[];
  prompt?: string;
  text?: string;
}): Promise<ClerkServiceTurn> {
  const remaining = await remainingFor(input.userId);
  try {
    const row = await insertProposal(input);
    if (input.lines) {
      return {
        kind: 'proposal',
        proposal: { id: row.id, summary: input.summary, lines: input.lines },
        remaining,
      };
    }
    if (input.chips && input.prompt) {
      return { kind: 'chips', prompt: input.prompt, chips: input.chips, remaining };
    }
    return message(input.text ?? input.summary, remaining);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await findByMessage(input.userId, input.clientMessageId);
    if (!existing) return message(CLERK_READ_ERROR, remaining);
    return replay(input.userId, existing, remaining);
  }
}

async function ensureUsageRow(tx: DbClient, userId: string, usageDay: string): Promise<void> {
  await tx
    .insert(assistantUsage)
    .values({
      id: crypto.randomUUID(),
      userId,
      usageDay,
      calls: 0,
      reservedMicros: 0,
      spentMicros: 0,
    })
    .onConflictDoNothing({ target: [assistantUsage.userId, assistantUsage.usageDay] });
}

async function reserveCall(userId: string, estimate: number, now: Date): Promise<boolean> {
  const usageDay = utcUsageDay(now);
  return db.transaction(async (tx) => {
    await ensureUsageRow(tx, ASSISTANT_FLEET_USER_ID, usageDay);
    await ensureUsageRow(tx, userId, usageDay);
    const [fleet] = await tx
      .select()
      .from(assistantUsage)
      .where(
        and(
          eq(assistantUsage.userId, ASSISTANT_FLEET_USER_ID),
          eq(assistantUsage.usageDay, usageDay),
        ),
      )
      .for('update');
    const [user] = await tx
      .select()
      .from(assistantUsage)
      .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDay, usageDay)))
      .for('update');
    if (!fleet || !user) return false;
    const allowed = authorizeCall({
      calls: user.calls,
      fleetSpentMicros: fleet.spentMicros,
      fleetReservedMicros: fleet.reservedMicros,
      estimateMicros: estimate,
    });
    if (!allowed) return false;
    await tx
      .update(assistantUsage)
      .set({ reservedMicros: sql`${assistantUsage.reservedMicros} + ${estimate}` })
      .where(eq(assistantUsage.id, fleet.id));
    await tx
      .update(assistantUsage)
      .set({ reservedMicros: sql`${assistantUsage.reservedMicros} + ${estimate}` })
      .where(eq(assistantUsage.id, user.id));
    return true;
  });
}

async function settleCall(input: {
  userId: string;
  estimate: number;
  accepted: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  now: Date;
}): Promise<number> {
  const usageDay = utcUsageDay(input.now);
  const delta = reconcileUsage(input);
  try {
    return await db.transaction(async (tx) => {
      const [fleet] = await tx
        .select()
        .from(assistantUsage)
        .where(
          and(
            eq(assistantUsage.userId, ASSISTANT_FLEET_USER_ID),
            eq(assistantUsage.usageDay, usageDay),
          ),
        )
        .for('update');
      const [user] = await tx
        .select()
        .from(assistantUsage)
        .where(and(eq(assistantUsage.userId, input.userId), eq(assistantUsage.usageDay, usageDay)))
        .for('update');
      if (!fleet || !user) return 0;
      const afterSpent = fleet.spentMicros + delta.spentDelta;
      await tx
        .update(assistantUsage)
        .set({
          reservedMicros: sql`greatest(${assistantUsage.reservedMicros} + ${delta.reservedDelta}, 0)`,
          spentMicros: sql`${assistantUsage.spentMicros} + ${delta.spentDelta}`,
        })
        .where(eq(assistantUsage.id, fleet.id));
      await tx
        .update(assistantUsage)
        .set({
          reservedMicros: sql`greatest(${assistantUsage.reservedMicros} + ${delta.reservedDelta}, 0)`,
          spentMicros: sql`${assistantUsage.spentMicros} + ${delta.spentDelta}`,
          calls: sql`${assistantUsage.calls} + ${delta.callsDelta}`,
        })
        .where(eq(assistantUsage.id, user.id));
      const alert = crossedFleetAlert(fleet.spentMicros, afterSpent);
      if (alert != null) {
        console.warn(`Clerk fleet spend reached ${alert} microdollars on ${usageDay}.`);
      }
      return pageBudget({
        calls: user.calls + delta.callsDelta,
        fleetSpentMicros: afterSpent,
        fleetReservedMicros: Math.max(0, fleet.reservedMicros + delta.reservedDelta),
      }).remaining;
    });
  } catch {
    console.warn('Clerk usage could not be settled');
    return remainingFor(input.userId, input.now);
  }
}

async function recordEvent(input: {
  userId: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  outcome: string;
}): Promise<void> {
  try {
    await db.insert(assistantEvents).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      modelId: MODEL_ID,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      outcome: input.outcome,
    });
  } catch {
    console.warn('Clerk event was not stored');
  }
}

async function callProvider(requestBody: ResponsesBody): Promise<{
  networkError: boolean;
  httpStatus: number;
  json: unknown | null;
}> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { networkError: true, httpStatus: 0, json: null };
  try {
    const response = await fetch(RESPONSE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
    });
    const text = await response.text();
    if (text.length > 1_000_000) {
      return { networkError: false, httpStatus: response.status, json: null };
    }
    try {
      return {
        networkError: false,
        httpStatus: response.status,
        json: JSON.parse(text) as unknown,
      };
    } catch {
      return { networkError: false, httpStatus: response.status, json: null };
    }
  } catch {
    return { networkError: true, httpStatus: 0, json: null };
  }
}

function catalogQuery(action: Extract<ClerkAction, { type: 'create_from_catalog' }>): string {
  return [action.query, action.author, action.year == null ? null : String(action.year)]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .slice(0, 300);
}

async function searchCategory(
  category: ClerkCategory,
  query: string,
): Promise<SearchResult[] | null> {
  if (category === 'show') return searchTvmazeShows(query);
  if (category === 'movie') return searchTmdbMovies(query);
  if (category === 'book') return searchBooks(query);
  if (category === 'anime') return searchAnimeAndManga(query, false);
  return searchAnimeAndManga(query, true);
}

function toHit(
  action: Extract<ClerkAction, { type: 'create_from_catalog' }>,
  hit: SearchResult,
): CatalogHit | null {
  const sourceId = hit.sourceId.trim();
  const title = hit.title.trim();
  if (!sourceId || sourceId.length > 200 || !title || title.length > MAX_TITLE_LENGTH) return null;
  const authors = hit.authors?.trim() || null;
  const year = hit.year?.trim() || null;
  if ((authors && authors.length > 500) || (year && year.length > 20)) return null;
  return {
    sourceId,
    title,
    category: action.category,
    coverUrl: hit.coverUrl && hit.coverUrl.length <= 2000 ? hit.coverUrl : null,
    primaryUnitTotal: Number.isInteger(hit.primaryUnitTotal) ? hit.primaryUnitTotal : null,
    secondaryUnitTotal: Number.isInteger(hit.secondaryUnitTotal) ? hit.secondaryUnitTotal : null,
    authors,
    year,
  };
}

async function resolveCreates(
  actions: readonly ClerkAction[],
): Promise<{ ok: true; actions: ClerkAction[] } | { ok: false; text: string }> {
  const next: ClerkAction[] = [];
  for (const action of actions) {
    if (action.type !== 'create_from_catalog') {
      next.push(action);
      continue;
    }
    let results: SearchResult[] | null = null;
    try {
      results = await searchCategory(action.category, catalogQuery(action));
    } catch {
      return { ok: false, text: CLERK_CATALOG_NONE };
    }
    const list = results ?? [];
    if (list.length !== 1) {
      return { ok: false, text: list.length === 0 ? CLERK_CATALOG_NONE : CLERK_CATALOG_MANY };
    }
    const mapped = toHit(action, list[0]!);
    if (!mapped) return { ok: false, text: CLERK_CATALOG_NONE };
    next.push({ ...action, hit: mapped });
  }
  return { ok: true, actions: next };
}

function planFailureText(reason: 'invalid' | 'unknown_id' | 'mixed_create'): string {
  if (reason === 'unknown_id') return CLERK_NOT_IN_ARCHIVE;
  if (reason === 'mixed_create') return CLERK_MIXED;
  return CLERK_READ_ERROR;
}

async function finishLocalPlan(input: {
  userId: string;
  clientMessageId: string;
  entries: readonly ApplyEntry[];
  actions: ClerkAction[];
  summary: string;
}): Promise<ClerkServiceTurn> {
  const applied = applyPlan(input.entries, input.actions);
  if (!applied.ok) {
    return remember({
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      actions: { clarification: applied.text },
      beforeImage: emptyBeforeImage(),
      summary: applied.text,
      text: applied.text,
    });
  }
  return remember({
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    actions: { actions: input.actions },
    beforeImage: {
      entries: applied.beforeImage,
      lines: applied.lines,
      createdIds: [],
      addedQuoteIds: [],
    },
    summary: input.summary,
    lines: applied.lines,
  });
}

async function askModel(input: {
  userId: string;
  clientMessageId: string;
  message: string;
  entries: ApplyEntry[];
  now: Date;
}): Promise<ClerkServiceTurn> {
  const ranked = rankTitles(input.message, input.entries.map(toCatalog), MAX_CANDIDATES + 1);
  const choice = candidatesForModel(
    input.entries,
    ranked.map((entry) => entry.id),
  );
  if (choice.kind === 'narrow') {
    return remember({
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      actions: { clarification: choice.text },
      beforeImage: emptyBeforeImage(),
      summary: choice.text,
      text: choice.text,
    });
  }

  const catalog = choice.rows.map(toCatalog);
  const candidateIds = catalog.map((row) => row.id);
  const built = buildResponsesBody({
    message: input.message,
    catalog,
    candidateIds,
  });
  if (!built.ok) {
    return remember({
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      actions: { clarification: TOO_WIDE },
      beforeImage: emptyBeforeImage(),
      summary: TOO_WIDE,
      text: TOO_WIDE,
    });
  }
  if (!process.env.OPENAI_API_KEY) {
    return message(CLERK_UNAVAILABLE, await remainingFor(input.userId, input.now));
  }

  const estimate = estimateCallMicros(
    estimateTextTokens(built.body.input.map((item) => item.content).join('\n')),
  );
  const reserved = await reserveCall(input.userId, estimate, input.now);
  if (!reserved) {
    return { kind: 'resting', text: CLERK_RESTING, remaining: 0 };
  }

  let settled = false;
  const finish = async (
    accepted: boolean,
    usage: { inputTokens: number; outputTokens: number } | null,
  ) => {
    if (settled) return remainingFor(input.userId, input.now);
    settled = true;
    return settleCall({
      userId: input.userId,
      estimate,
      accepted,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      now: input.now,
    });
  };

  let pendingId: string;
  try {
    const pending = await insertProposal({
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      actions: { pending: true },
      beforeImage: emptyBeforeImage(),
      summary: '',
    });
    pendingId = pending.id;
  } catch (err) {
    const remaining = await finish(false, null);
    if (isUniqueViolation(err)) {
      const existing = await findByMessage(input.userId, input.clientMessageId);
      if (!existing) return message(CLERK_READ_ERROR, remaining);
      return replay(input.userId, existing, remaining);
    }
    console.warn('Clerk proposal could not be stored');
    return message(CLERK_READ_ERROR, remaining);
  }

  // The reserve transaction has already committed. This call must not hold a pooled connection.
  const started = Date.now();
  const provider = await callProvider(built.body);
  const usage = readUsage(provider.json);
  const accepted = callWasBilled({
    networkError: provider.networkError,
    httpStatus: provider.httpStatus,
    hasUsage: usage != null,
  });
  const remaining = await finish(accepted, usage);

  const interpreted = await interpretModel({
    json: provider.json,
    networkError: provider.networkError,
    accepted,
    entries: input.entries,
    candidateIds,
  });
  await recordEvent({
    userId: input.userId,
    latencyMs: Date.now() - started,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    outcome: interpreted.outcome,
  });

  await db
    .update(assistantProposals)
    .set({
      actions: interpreted.actions,
      beforeImage: interpreted.beforeImage,
      summary: interpreted.summary,
    })
    .where(and(eq(assistantProposals.id, pendingId), eq(assistantProposals.userId, input.userId)));

  if (interpreted.lines) {
    return {
      kind: 'proposal',
      proposal: { id: pendingId, summary: interpreted.summary, lines: interpreted.lines },
      remaining,
    };
  }
  return message(interpreted.summary, remaining);
}

async function interpretModel(input: {
  json: unknown | null;
  networkError: boolean;
  accepted: boolean;
  entries: ApplyEntry[];
  candidateIds: string[];
}): Promise<{
  actions: unknown;
  beforeImage: StoredBeforeImage;
  summary: string;
  lines?: ClerkDiffLine[];
  outcome: string;
}> {
  const clarification = (text: string, outcome: string) => ({
    actions: { clarification: text },
    beforeImage: emptyBeforeImage(),
    summary: text,
    outcome,
  });
  if (input.networkError || !input.accepted) {
    return clarification(CLERK_READ_ERROR, input.networkError ? 'network' : 'http');
  }
  const turn = parseResponsesOutput(input.json);
  if (turn.kind === 'invalid') return clarification(CLERK_READ_ERROR, 'invalid');
  if (turn.kind === 'clarify') return clarification(turn.question, 'clarify');

  const parsed = parseModelPlan(turn.arguments, input.candidateIds);
  if (!parsed.ok) return clarification(planFailureText(parsed.reason), 'invalid');
  const resolved = await resolveCreates(parsed.plan.actions);
  if (!resolved.ok) return clarification(resolved.text, 'clarify');
  const checked = parseStoredPlan({ actions: resolved.actions }, input.candidateIds);
  if (!checked.ok) return clarification(planFailureText(checked.reason), 'invalid');
  const applied = applyPlan(input.entries, checked.plan.actions);
  if (!applied.ok) return clarification(applied.text, 'clarify');
  const titles = new Map(input.entries.map((entry) => [entry.id, entry.title]));
  return {
    actions: { actions: checked.plan.actions },
    beforeImage: {
      entries: applied.beforeImage,
      lines: applied.lines,
      createdIds: [],
      addedQuoteIds: [],
    },
    summary: summarizePlan(checked.plan.actions, titles),
    lines: applied.lines,
    outcome: 'plan',
  };
}

export async function submitClerk(
  userId: string,
  messageText: unknown,
  clientMessageId: unknown,
  entryId?: unknown,
): Promise<ClerkServiceTurn> {
  const now = new Date();
  if (typeof messageText !== 'string' || typeof clientMessageId !== 'string') {
    return message(CLERK_READ_ERROR, await remainingFor(userId, now));
  }
  if (!SAFE_ID.test(clientMessageId)) {
    return message(CLERK_READ_ERROR, await remainingFor(userId, now));
  }
  const stripped = stripHiddenCharacters(messageText);
  if (stripped.length > MAX_MESSAGE_CHARS) {
    return message(CLERK_TOO_LONG, await remainingFor(userId, now));
  }
  const text = stripped.replace(/\s+/g, ' ').trim();
  if (!text) return message(CLERK_EMPTY, await remainingFor(userId, now));

  const existing = await findByMessage(userId, clientMessageId);
  if (existing) return replay(userId, existing, await remainingFor(userId, now));

  const library = await loadEntries(userId);
  let entries = library;
  if (typeof entryId === 'string') {
    if (!SAFE_ID.test(entryId))
      return message(CLERK_NOT_IN_ARCHIVE, await remainingFor(userId, now));
    entries = library.filter((entry) => entry.id === entryId);
    if (entries.length === 0) {
      return message(CLERK_NOT_IN_ARCHIVE, await remainingFor(userId, now));
    }
  }

  const grammar = parseGrammar(text, entries.map(toCatalog));
  if (grammar.kind === 'refuse' || grammar.kind === 'clarify' || grammar.kind === 'narrow') {
    return remember({
      userId,
      clientMessageId,
      actions: { clarification: grammar.text },
      beforeImage: emptyBeforeImage(),
      summary: grammar.text,
      text: grammar.text,
    });
  }
  if (grammar.kind === 'chips') {
    const chips = chipsFor(grammar.ids, entries);
    if (chips.length === 0) {
      return message(CLERK_NOT_IN_ARCHIVE, await remainingFor(userId, now));
    }
    return remember({
      userId,
      clientMessageId,
      actions: { chips: { prompt: grammar.prompt, ids: grammar.ids } },
      beforeImage: emptyBeforeImage(),
      summary: grammar.prompt,
      chips,
      prompt: grammar.prompt,
      text: grammar.prompt,
    });
  }
  if (grammar.kind === 'unit') {
    return finishLocalPlan({
      userId,
      clientMessageId,
      entries,
      actions: [{ type: 'set_unit', entryId: grammar.entryId, unit: grammar.spoken }],
      summary: `Store ${grammar.title} in ${grammar.spoken}s.`,
    });
  }
  if (grammar.kind === 'plan') {
    return finishLocalPlan({
      userId,
      clientMessageId,
      entries,
      actions: grammar.actions,
      summary: grammar.summary,
    });
  }
  return askModel({ userId, clientMessageId, message: text, entries, now });
}

async function withDomainTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  // Media writes open a transaction on the process-wide domain client. Point that
  // client at this transaction so completion timestamps commit with applied_at.
  return db.transaction(async (tx) => {
    const previous = domainDb();
    setDomainDb(tx);
    try {
      return await fn(tx);
    } finally {
      setDomainDb(previous);
    }
  });
}

async function missingQuoteIds(
  tx: DbClient,
  userId: string,
  entryId: string,
  before: Set<string>,
): Promise<string[]> {
  const [row] = await tx
    .select({ quotes: mediaEntries.quotes })
    .from(mediaEntries)
    .where(and(eq(mediaEntries.id, entryId), eq(mediaEntries.userId, userId)))
    .limit(1);
  const current = new Set(quoteIdsOf(row?.quotes));
  return [...current].filter((id) => !before.has(id));
}

export async function confirmClerk(
  userId: string,
  proposalId: unknown,
  edits: unknown,
): Promise<ClerkServiceTurn> {
  const now = new Date();
  const remaining = () => remainingFor(userId, now);
  if (typeof proposalId !== 'string' || !SAFE_ID.test(proposalId)) {
    return message(CLERK_MISSING, await remaining());
  }
  const row = await findById(userId, proposalId);
  const decision = classifyProposal(row, now);
  if (decision.kind === 'missing' || !row) return message(CLERK_MISSING, await remaining());
  if (decision.kind === 'already') return message(CLERK_ALREADY, await remaining());
  if (decision.kind === 'expired') return message(CLERK_EXPIRED, await remaining());
  if (decision.kind === 'pending') return message(CLERK_READ_ERROR, await remaining());
  if (decision.kind === 'clarification') return message(decision.text, await remaining());
  if (decision.kind === 'chips') {
    const entries = await loadEntries(userId);
    const chips = chipsFor(decision.ids, entries);
    if (chips.length === 0) return message(CLERK_NOT_IN_ARCHIVE, await remaining());
    return { kind: 'chips', prompt: decision.prompt, chips, remaining: await remaining() };
  }

  try {
    await withDomainTransaction(async (tx) => {
      const [fresh] = await tx
        .select()
        .from(assistantProposals)
        .where(and(eq(assistantProposals.id, row.id), eq(assistantProposals.userId, userId)))
        .for('update');
      if (!fresh) throw new ClerkTurnError(CLERK_MISSING);
      if (fresh.appliedAt) throw new ClerkTurnError(CLERK_ALREADY);
      if (fresh.expiresAt.getTime() <= Date.now()) throw new ClerkTurnError(CLERK_EXPIRED);

      const ids = entryIdsIn(fresh.actions);
      const entries = await loadEntries(userId, tx, ids);
      const prepared = prepareConfirm({
        actions: fresh.actions,
        entries,
        edits: cleanEdits(edits),
      });
      if (!prepared.ok) throw new ClerkTurnError(prepared.text);

      const [claimed] = await tx
        .update(assistantProposals)
        .set({ appliedAt: new Date() })
        .where(and(eq(assistantProposals.id, fresh.id), isNull(assistantProposals.appliedAt)))
        .returning({ id: assistantProposals.id });
      if (!claimed) throw new ClerkTurnError(CLERK_ALREADY);

      for (const patch of prepared.applied.patches) {
        if (Object.keys(patch.updates).length === 0) continue;
        await updateMediaProgressForUser(userId, patch.entryId, patch.updates, { via: 'clerk' });
      }

      const addedQuoteIds: { entryId: string; quoteId: string }[] = [];
      const seenQuotes = new Map<string, Set<string>>();
      for (const quote of prepared.applied.quoteAdds) {
        if (!seenQuotes.has(quote.entryId)) {
          const [current] = await tx
            .select({ quotes: mediaEntries.quotes })
            .from(mediaEntries)
            .where(and(eq(mediaEntries.id, quote.entryId), eq(mediaEntries.userId, userId)))
            .limit(1);
          seenQuotes.set(quote.entryId, new Set(quoteIdsOf(current?.quotes)));
        }
        await addMediaQuoteForUser(userId, quote.entryId, {
          text: quote.text,
          speaker: quote.speaker,
          citation: quote.citation,
        });
        const before = seenQuotes.get(quote.entryId) ?? new Set<string>();
        const added = await missingQuoteIds(tx, userId, quote.entryId, before);
        for (const quoteId of added) addedQuoteIds.push({ entryId: quote.entryId, quoteId });
        seenQuotes.set(quote.entryId, new Set([...before, ...added]));
        await logActivity(
          {
            userId,
            mediaId: quote.entryId,
            actionType: 'progress_update',
            details: { via: 'clerk', kind: 'quote' },
          },
          tx,
        );
      }

      for (const entryId of [...new Set(prepared.applied.queueOn)]) {
        await togglePriorityQueueForUser(userId, entryId);
        await logActivity(
          {
            userId,
            mediaId: entryId,
            actionType: 'progress_update',
            details: { via: 'clerk', kind: 'queue' },
          },
          tx,
        );
      }

      const createdIds: string[] = [];
      for (const action of prepared.applied.creates) {
        if (!action.hit) throw new ClerkTurnError(CLERK_CATALOG_NONE);
        const created = await createMediaEntryForUser(
          userId,
          {
            title: action.hit.title,
            category: action.hit.category,
            status: 'planning',
            sourceId: action.hit.sourceId,
            coverImage: action.hit.coverUrl,
            primaryUnitTotal: action.hit.primaryUnitTotal,
            secondaryUnitTotal: action.hit.secondaryUnitTotal,
            isPrivate: false,
          },
          { via: 'clerk' },
        );
        createdIds.push(created.id);
      }

      const previous = readBeforeImage(fresh.beforeImage) ?? emptyBeforeImage();
      await tx
        .update(assistantProposals)
        .set({
          beforeImage: {
            entries: prepared.applied.beforeImage,
            lines: previous.lines,
            createdIds,
            addedQuoteIds,
          },
        })
        .where(eq(assistantProposals.id, fresh.id));
    });
  } catch (err) {
    if (err instanceof ClerkTurnError) return message(err.text, await remaining());
    console.warn('Clerk confirm failed');
    return message(CLERK_SAVE_FAILED, await remaining());
  }
  return message(CLERK_SAVED, await remaining());
}

export async function cancelClerk(userId: string, proposalId: unknown): Promise<void> {
  if (typeof proposalId !== 'string' || !SAFE_ID.test(proposalId)) return;
  await db
    .update(assistantProposals)
    .set({ expiresAt: new Date() })
    .where(
      and(
        eq(assistantProposals.id, proposalId),
        eq(assistantProposals.userId, userId),
        isNull(assistantProposals.appliedAt),
      ),
    );
}

export async function undoClerk(userId: string): Promise<ClerkServiceTurn> {
  const now = new Date();
  const remaining = () => remainingFor(userId, now);
  const [row] = await db
    .select()
    .from(assistantProposals)
    .where(
      and(
        eq(assistantProposals.userId, userId),
        isNotNull(assistantProposals.appliedAt),
        isNull(assistantProposals.undoneAt),
      ),
    )
    .orderBy(sql`${assistantProposals.appliedAt} desc`, sql`${assistantProposals.createdAt} desc`)
    .limit(1);
  if (!row) return message(CLERK_NOTHING, await remaining());
  const image = readBeforeImage(row.beforeImage);
  if (!image) return message(CLERK_MISSING, await remaining());

  try {
    await withDomainTransaction(async (tx) => {
      const [claimed] = await tx
        .update(assistantProposals)
        .set({ undoneAt: new Date() })
        .where(and(eq(assistantProposals.id, row.id), isNull(assistantProposals.undoneAt)))
        .returning({ id: assistantProposals.id });
      if (!claimed) throw new ClerkTurnError(CLERK_NOTHING);

      const created = new Set(image.createdIds);
      const restoreIds = Object.keys(image.entries)
        .filter((id) => !created.has(id))
        .sort();
      if (restoreIds.length > 0) {
        await loadEntries(userId, tx, restoreIds);
      }
      for (const entryId of restoreIds) {
        const fields = image.entries[entryId];
        if (!fields) continue;
        await updateMediaProgressForUser(userId, entryId, undoUpdates(fields), { via: 'clerk' });
      }
      for (const quote of image.addedQuoteIds) {
        if (created.has(quote.entryId)) continue;
        try {
          await deleteMediaQuoteForUser(userId, quote.entryId, quote.quoteId);
        } catch (err) {
          if (!(err instanceof Error) || err.message !== 'Entry not found') throw err;
        }
      }
      for (const createdId of image.createdIds) {
        try {
          await deleteMediaEntryForUser(userId, createdId);
        } catch (err) {
          if (!(err instanceof Error) || err.message !== 'Entry not found') throw err;
        }
      }
    });
  } catch (err) {
    if (err instanceof ClerkTurnError) return message(err.text, await remaining());
    console.warn('Clerk undo failed');
    return message(CLERK_UNDO_FAILED, await remaining());
  }
  return message(CLERK_UNDONE, await remaining());
}
