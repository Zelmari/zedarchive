import { groupMembers, mediaEntries } from '@/db/schema';
import { eq, and, desc, isNotNull, ne, asc, isNull, ilike, sql } from 'drizzle-orm';
import {
  VALID_CATEGORIES,
  VALID_STATUSES,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_DROP_REASON_LENGTH,
  MAX_SYNOPSIS_LENGTH,
  MAX_SOURCE_ID_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  MAX_STRUCTURE_LENGTH,
  MAX_RATING,
} from '@/lib/constants';
import type {
  MediaEntry,
  StructureItem,
  MediaCycle,
  MediaCycleInput,
  MediaQuote,
} from '@/types/media';
import { serializeEntry, stableMediaChildDate, stableMediaChildId } from '@/lib/serialize';
import { logActivity } from '@/domain/activity-log';
import { domainDb, type DbClient } from '@/domain/db-context';
import { createMediaSchema, updateMediaSchema } from '@/lib/validations/media';
import { escapeIlikePattern, ilikeContainsPattern } from '@/lib/ilike';
import { OFFLINE_CONFLICT_MESSAGE } from '@/lib/offline/conflict';

export type MediaRow = typeof mediaEntries.$inferSelect;
export type MediaPayload = Omit<
  typeof mediaEntries.$inferInsert,
  'id' | 'userId' | 'createdAt' | 'groupId' | 'isPrivate'
>;

export function toInt(value: unknown, fallback: number): number;
export function toInt(value: unknown, fallback: null): number | null;
export function toInt(value: unknown, fallback: number | null): number | null {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isInList(list: readonly string[], value: unknown): value is string {
  return typeof value === 'string' && list.includes(value);
}

export function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sanitizeStructure(structure: unknown): StructureItem[] {
  if (!Array.isArray(structure)) return [];
  return (structure as Record<string, unknown>[])
    .slice(0, MAX_STRUCTURE_LENGTH)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const number = toInt(item.number, null);
      const total =
        item.total === null || item.total === undefined || item.total === ''
          ? null
          : toInt(item.total, null);
      return number === null
        ? null
        : { number, name: String(item.name ?? `Season ${number}`).slice(0, 100), total };
    })
    .filter((item): item is StructureItem => item !== null);
}

export function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .slice(0, 50)
    .map((t) =>
      String(t || '')
        .trim()
        .toLowerCase()
        .slice(0, 50),
    )
    .filter(Boolean);
}

export function sanitizeRating(rating: unknown): number | null {
  if (rating === null || rating === undefined || rating === '') return null;
  const parsed = parseInt(String(rating), 10);
  if (isNaN(parsed)) return null;
  return Math.min(MAX_RATING, Math.max(1, parsed));
}

export function sanitizeStatus(status: unknown): string {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return isInList(VALID_STATUSES, normalized) ? normalized : 'in_progress';
}

export function sanitizeCycles(
  cycles: unknown,
  fallbackStart?: Date | string | null,
  fallbackEnd?: Date | string | null,
  mediaId = '',
): MediaCycle[] {
  if (Array.isArray(cycles) && cycles.length > 0) {
    const list = (cycles as Record<string, unknown>[])
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => {
        const id =
          typeof c.id === 'string' && c.id ? c.id : stableMediaChildId('cycle', mediaId, i, c);
        const cycleNumber = typeof c.cycleNumber === 'number' ? c.cycleNumber : i + 1;
        const startedAt = toDateOrNull(c.startedAt);
        const completedAt = toDateOrNull(c.completedAt);
        const rating = sanitizeRating(c.rating);
        const notes =
          typeof c.notes === 'string' ? c.notes.trim().slice(0, MAX_NOTES_LENGTH) : null;
        return {
          id,
          cycleNumber,
          startedAt: startedAt ? startedAt.toISOString() : null,
          completedAt: completedAt ? completedAt.toISOString() : null,
          rating,
          notes,
        };
      });
    if (list.length > 0) return list;
  }

  const fallbackSeed = {
    cycleNumber: 1,
    startedAt:
      fallbackStart instanceof Date ? fallbackStart.toISOString() : (fallbackStart ?? null),
    completedAt: fallbackEnd instanceof Date ? fallbackEnd.toISOString() : (fallbackEnd ?? null),
    rating: null,
    notes: null,
  };
  const startIso = fallbackStart
    ? (toDateOrNull(fallbackStart)?.toISOString() ?? null)
    : new Date().toISOString();
  const endIso = fallbackEnd ? (toDateOrNull(fallbackEnd)?.toISOString() ?? null) : null;
  return [
    {
      id: stableMediaChildId('cycle', mediaId, 0, fallbackSeed),
      ...fallbackSeed,
      startedAt: startIso,
      completedAt: endIso,
    },
  ];
}

export function sanitizeQuotes(quotes: unknown, mediaId: string): MediaQuote[] {
  if (!Array.isArray(quotes)) return [];

  return quotes.map((rawQuote, index) => {
    const quote =
      rawQuote && typeof rawQuote === 'object' ? (rawQuote as Record<string, unknown>) : {};
    return {
      id:
        typeof quote.id === 'string' && quote.id
          ? quote.id
          : stableMediaChildId('quote', mediaId, index, quote),
      text: typeof quote.text === 'string' ? quote.text : '',
      speaker: typeof quote.speaker === 'string' ? quote.speaker : null,
      citation: typeof quote.citation === 'string' ? quote.citation : null,
      isFavorite: Boolean(quote.isFavorite),
      createdAt: stableMediaChildDate(quote.createdAt),
    };
  });
}

export async function assertCanWriteMedia(
  mediaId: string,
  userId: string,
  tx?: DbClient,
): Promise<MediaRow> {
  const client = tx ?? domainDb();
  const [entry] = await client
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.id, mediaId))
    .limit(1);

  if (!entry) {
    throw new Error('Entry not found');
  }

  if (!entry.groupId) {
    if (entry.userId !== userId) {
      throw new Error('Entry not found');
    }
    return entry;
  }

  const [membership] = await client
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, entry.groupId), eq(groupMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw new Error('Entry not found');
  }

  return entry;
}

export async function compactPriorityQueue(
  tx: DbClient,
  userId: string,
  excludeId: string,
): Promise<void> {
  const remaining = await tx
    .select({ id: mediaEntries.id, priorityIndex: mediaEntries.priorityIndex })
    .from(mediaEntries)
    .where(
      and(
        eq(mediaEntries.userId, userId),
        isNotNull(mediaEntries.priorityIndex),
        ne(mediaEntries.id, excludeId),
      ),
    )
    .orderBy(asc(mediaEntries.priorityIndex));

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i]!;
    if (item.priorityIndex != null && item.priorityIndex !== i + 1) {
      await tx
        .update(mediaEntries)
        .set({ priorityIndex: i + 1 })
        .where(eq(mediaEntries.id, item.id));
    }
  }
}

export async function mutateQuotes(
  mediaId: string,
  userId: string,
  fn: (quotes: MediaQuote[]) => MediaQuote[],
): Promise<MediaRow> {
  return await domainDb().transaction(async (tx) => {
    const existing = await assertCanWriteMedia(mediaId, userId, tx);
    const quotes = sanitizeQuotes(existing.quotes, existing.id);
    const [row] = await tx
      .update(mediaEntries)
      .set({
        quotes: fn(quotes),
        updatedAt: new Date(),
      })
      .where(eq(mediaEntries.id, mediaId))
      .returning();

    if (!row) {
      throw new Error('Entry not found');
    }
    return row;
  });
}

export interface CycleMutationOptions {
  recalculateRewatchCount?: boolean;
  getAdditionalFields?: () => Partial<MediaRow>;
}

export async function mutateCycles(
  mediaId: string,
  userId: string,
  fn: (cycles: MediaCycle[], existing: MediaRow) => MediaCycle[],
  options: CycleMutationOptions = {},
): Promise<MediaRow> {
  return await domainDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(
        and(
          eq(mediaEntries.id, mediaId),
          eq(mediaEntries.userId, userId),
          isNull(mediaEntries.groupId),
        ),
      )
      .limit(1);

    if (!existing || existing.groupId || existing.userId !== userId) {
      throw new Error('Entry not found');
    }

    const cycles = fn(
      sanitizeCycles(existing.cycles, existing.startedAt, existing.completedAt, existing.id),
      existing,
    );
    const setFields: Partial<MediaRow> = {
      cycles,
      updatedAt: new Date(),
      ...(options.getAdditionalFields?.() ?? {}),
    };
    if (options.recalculateRewatchCount) {
      setFields.rewatchCount = Math.max(0, cycles.length - 1);
    }

    const [row] = await tx
      .update(mediaEntries)
      .set(setFields)
      .where(
        and(
          eq(mediaEntries.id, mediaId),
          eq(mediaEntries.userId, userId),
          isNull(mediaEntries.groupId),
        ),
      )
      .returning();

    if (!row) {
      throw new Error('Entry not found');
    }
    return row;
  });
}

export function buildMediaPayload(
  input: Record<string, unknown>,
  {
    category,
    title,
    mode,
  }: {
    category: MediaRow['category'];
    title: string;
    mode: 'create' | 'bulk';
  },
): MediaPayload {
  const status = sanitizeStatus(input.status);
  const primaryUnitCurrent =
    mode === 'create'
      ? category === 'movie'
        ? Math.max(0, toInt(input.primaryUnitCurrent, status === 'completed' ? 1 : 0))
        : Math.max(1, toInt(input.primaryUnitCurrent, 1))
      : Math.max(1, toInt(input.primaryUnitCurrent, 1));
  const primaryUnitTotal =
    input.primaryUnitTotal !== undefined && input.primaryUnitTotal !== null
      ? Math.max(1, toInt(input.primaryUnitTotal, 1))
      : null;
  const secondaryUnitCurrent = Math.max(0, toInt(input.secondaryUnitCurrent, 0));
  const secondaryUnitTotal =
    input.secondaryUnitTotal !== undefined && input.secondaryUnitTotal !== null
      ? Math.max(0, toInt(input.secondaryUnitTotal, 0))
      : null;
  const startedAt =
    mode === 'create'
      ? (toDateOrNull(input.startedAt) ?? new Date())
      : toDateOrNull(input.startedAt);
  const completedAt =
    status === 'completed' ? (toDateOrNull(input.completedAt) ?? new Date()) : null;
  const droppedAt = status === 'dropped' ? (toDateOrNull(input.droppedAt) ?? new Date()) : null;
  const trimMaybeCap = (value: string, maxLength: number) =>
    mode === 'bulk' ? value.trim().slice(0, maxLength) : value.trim();
  const dropReason =
    status === 'dropped' && input.dropReason
      ? trimMaybeCap(String(input.dropReason), MAX_DROP_REASON_LENGTH)
      : null;
  const cycles = sanitizeCycles(
    input.cycles,
    startedAt,
    completedAt,
    typeof input.id === 'string' ? input.id : '',
  );
  const droppedProgressPrimary =
    status === 'dropped'
      ? mode === 'bulk' && input.droppedProgressPrimary != null
        ? toInt(input.droppedProgressPrimary, null)
        : primaryUnitTotal !== null
          ? Math.min(primaryUnitCurrent, primaryUnitTotal)
          : primaryUnitCurrent
      : null;
  const droppedProgressSecondary =
    status === 'dropped'
      ? mode === 'bulk' && input.droppedProgressSecondary != null
        ? toInt(input.droppedProgressSecondary, null)
        : secondaryUnitTotal !== null
          ? Math.min(secondaryUnitCurrent, secondaryUnitTotal)
          : secondaryUnitCurrent
      : null;
  const rewatchCount =
    input.rewatchCount != null
      ? Math.max(0, toInt(input.rewatchCount, 0))
      : Math.max(0, cycles.length - 1);

  return {
    title,
    category,
    status,
    dropReason,
    droppedAt,
    droppedProgressPrimary,
    droppedProgressSecondary,
    rating: sanitizeRating(input.rating),
    tags:
      mode === 'create' && Array.isArray(input.tags)
        ? (input.tags as string[])
        : sanitizeTags(input.tags),
    completedAt,
    startedAt,
    rewatchCount,
    cycles,
    synopsis: input.synopsis ? trimMaybeCap(String(input.synopsis), MAX_SYNOPSIS_LENGTH) : null,
    genres: Array.isArray(input.genres) ? (input.genres as string[]).slice(0, 20) : [],
    primaryUnitCurrent:
      primaryUnitTotal !== null
        ? Math.min(primaryUnitCurrent, primaryUnitTotal)
        : primaryUnitCurrent,
    primaryUnitTotal,
    secondaryUnitCurrent:
      secondaryUnitTotal !== null
        ? Math.min(secondaryUnitCurrent, secondaryUnitTotal)
        : secondaryUnitCurrent,
    secondaryUnitTotal,
    structure: sanitizeStructure(input.structure),
    coverImage:
      typeof input.coverImage === 'string' &&
      (mode === 'create' || input.coverImage.length <= MAX_COVER_IMAGE_LENGTH)
        ? input.coverImage
        : null,
    sourceId:
      typeof input.sourceId === 'string'
        ? trimMaybeCap(input.sourceId, MAX_SOURCE_ID_LENGTH)
        : null,
    notes: input.notes ? trimMaybeCap(String(input.notes), MAX_NOTES_LENGTH) : null,
    quotes: sanitizeQuotes(input.quotes, typeof input.id === 'string' ? input.id : ''),
    priorityIndex:
      input.priorityIndex != null && input.priorityIndex !== ''
        ? Math.max(1, toInt(input.priorityIndex, 1))
        : null,
    updatedAt: new Date(),
  };
}

export async function createMediaEntryForUser(
  userId: string,
  data: Record<string, unknown> & { groupId?: string | null },
): Promise<MediaEntry> {
  const parsed = createMediaSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid input data');
  }

  const zodData = parsed.data;
  const title = zodData.title;
  if (!title) {
    throw new Error('Title is required');
  }

  const id = crypto.randomUUID();
  const category = zodData.category as MediaRow['category'];
  const payload = buildMediaPayload(
    { ...zodData, id },
    {
      category,
      title,
      mode: 'create',
    },
  );
  const rawIsPrivate = Boolean(zodData.isPrivate);

  const rawGroupId = (data as Record<string, unknown>).groupId;
  const groupId = typeof rawGroupId === 'string' && rawGroupId.trim() ? rawGroupId.trim() : null;
  if (groupId) {
    const [membership] = await domainDb()
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (!membership) throw new Error('You are not a member of this group');
  }
  const isPrivate = groupId ? false : rawIsPrivate;

  const newEntry = await domainDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(mediaEntries)
      .values({
        id,
        userId,
        ...payload,
        isPrivate,
        groupId,
      })
      .returning();

    await logActivity(
      {
        userId,
        mediaId: id,
        actionType: 'created',
        details: {
          title,
          category,
          status: payload.status,
          ...(payload.status === 'dropped'
            ? { dropReason: payload.dropReason, droppedAt: payload.droppedAt }
            : {}),
        },
      },
      tx,
    );

    return inserted;
  });

  return serializeEntry(newEntry) as MediaEntry;
}

export async function updateMediaProgressForUser(
  userId: string,
  id: string,
  updates: Record<string, unknown> & { groupId?: string | null },
): Promise<MediaEntry> {
  const parsed = updateMediaSchema.safeParse(updates);
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const validatedUpdates = parsed.data;

  const updateFields: Partial<MediaRow> = {
    updatedAt: new Date(),
  };

  if (validatedUpdates.title !== undefined) {
    const title = validatedUpdates.title;
    if (!title) {
      throw new Error('Title is required');
    }
    updateFields.title = title;
  }

  if (validatedUpdates.category !== undefined) {
    if (!isInList(VALID_CATEGORIES, validatedUpdates.category)) {
      throw new Error('Invalid category');
    }
    updateFields.category = validatedUpdates.category as MediaRow['category'];
  }

  if (validatedUpdates.status !== undefined) {
    const status = validatedUpdates.status;
    updateFields.status = status;
    if (status === 'completed') {
      updateFields.completedAt = toDateOrNull(validatedUpdates.completedAt) ?? new Date();
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
    } else if (status === 'dropped') {
      updateFields.completedAt = null;
      updateFields.droppedAt = toDateOrNull(validatedUpdates.droppedAt) ?? new Date();
      if (validatedUpdates.dropReason !== undefined) {
        updateFields.dropReason = validatedUpdates.dropReason ? validatedUpdates.dropReason : null;
      }
      if (validatedUpdates.droppedProgressPrimary !== undefined) {
        updateFields.droppedProgressPrimary = validatedUpdates.droppedProgressPrimary;
      }
      if (validatedUpdates.droppedProgressSecondary !== undefined) {
        updateFields.droppedProgressSecondary = validatedUpdates.droppedProgressSecondary;
      }
    } else {
      updateFields.completedAt = null;
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
    }
  } else if (validatedUpdates.dropReason !== undefined) {
    updateFields.dropReason = validatedUpdates.dropReason ? validatedUpdates.dropReason : null;
  }

  if (validatedUpdates.rating !== undefined) {
    updateFields.rating = validatedUpdates.rating;
  }

  if (validatedUpdates.cycles !== undefined) {
    updateFields.cycles = sanitizeCycles(validatedUpdates.cycles, undefined, undefined, id);
    updateFields.rewatchCount = Math.max(0, updateFields.cycles.length - 1);
  }
  if (validatedUpdates.tags !== undefined) {
    updateFields.tags = validatedUpdates.tags;
  }
  if (validatedUpdates.synopsis !== undefined) {
    updateFields.synopsis = validatedUpdates.synopsis ? validatedUpdates.synopsis.trim() : null;
  }
  if (validatedUpdates.genres !== undefined) {
    updateFields.genres = Array.isArray(validatedUpdates.genres)
      ? (validatedUpdates.genres as string[]).slice(0, 20)
      : [];
  }
  if (validatedUpdates.startedAt !== undefined) {
    updateFields.startedAt = toDateOrNull(validatedUpdates.startedAt);
  }

  if (validatedUpdates.primaryUnitCurrent !== undefined) {
    updateFields.primaryUnitCurrent =
      validatedUpdates.primaryUnitCurrent !== null
        ? Math.max(0, validatedUpdates.primaryUnitCurrent)
        : 0;
  }
  if (validatedUpdates.primaryUnitTotal !== undefined) {
    updateFields.primaryUnitTotal =
      validatedUpdates.primaryUnitTotal !== null
        ? Math.max(1, validatedUpdates.primaryUnitTotal)
        : null;
  }
  if (validatedUpdates.secondaryUnitCurrent !== undefined) {
    updateFields.secondaryUnitCurrent =
      validatedUpdates.secondaryUnitCurrent !== null
        ? Math.max(0, validatedUpdates.secondaryUnitCurrent)
        : 0;
  }
  if (validatedUpdates.secondaryUnitTotal !== undefined) {
    updateFields.secondaryUnitTotal =
      validatedUpdates.secondaryUnitTotal !== null
        ? Math.max(0, validatedUpdates.secondaryUnitTotal)
        : null;
  }

  if (validatedUpdates.structure !== undefined) {
    updateFields.structure = sanitizeStructure(validatedUpdates.structure);
  }
  if (validatedUpdates.coverImage !== undefined) {
    updateFields.coverImage =
      validatedUpdates.coverImage === null ? null : validatedUpdates.coverImage;
  }
  if (validatedUpdates.sourceId !== undefined) {
    updateFields.sourceId =
      typeof validatedUpdates.sourceId === 'string' ? validatedUpdates.sourceId.trim() : null;
  }
  if (validatedUpdates.priorityIndex !== undefined) {
    updateFields.priorityIndex =
      validatedUpdates.priorityIndex !== null ? Math.max(1, validatedUpdates.priorityIndex) : null;
  }
  if (validatedUpdates.notes !== undefined) {
    updateFields.notes = validatedUpdates.notes == null ? null : validatedUpdates.notes.trim();
  }
  const incomingGroupId = validatedUpdates.groupId;
  if (validatedUpdates.isPrivate !== undefined && !incomingGroupId) {
    updateFields.isPrivate = Boolean(validatedUpdates.isPrivate);
  }

  const updated = await domainDb().transaction(async (tx) => {
    const existing = await assertCanWriteMedia(id, userId, tx);

    if (validatedUpdates._offlineUpdatedAt) {
      if (new Date(existing.updatedAt) > new Date(validatedUpdates._offlineUpdatedAt)) {
        throw new Error(OFFLINE_CONFLICT_MESSAGE);
      }
    }

    const isGroupEntry = Boolean(existing.groupId);
    if (
      isGroupEntry &&
      (validatedUpdates.rewatch === true || validatedUpdates.cycles !== undefined)
    ) {
      throw new Error('Entry not found');
    }
    if (isGroupEntry) {
      updateFields.isPrivate = false;
      if (incomingGroupId && incomingGroupId !== existing.groupId) {
        throw new Error('Cannot change groupId of an entry');
      }
    } else {
      if (existing.userId !== userId) throw new Error('Entry not found');
      if (incomingGroupId) throw new Error('Cannot move personal entry to group via update');
      if (existing.groupId) throw new Error('Unexpected groupId');
    }

    if (updateFields.status === 'completed' && validatedUpdates.priorityIndex === undefined) {
      updateFields.priorityIndex = null;
    }

    if (existing.priorityIndex != null && updateFields.priorityIndex === null) {
      await compactPriorityQueue(tx, userId, id);
    }

    if (validatedUpdates.rewatch === true) {
      const existingCycles = sanitizeCycles(
        existing.cycles,
        existing.startedAt,
        existing.completedAt,
        existing.id,
      );
      const nextCycleNumber = existingCycles.length + 1;
      const isMovie = existing.category === 'movie';
      const newCycle: MediaCycle = {
        id: crypto.randomUUID(),
        cycleNumber: nextCycleNumber,
        startedAt: new Date().toISOString(),
        completedAt: isMovie ? new Date().toISOString() : null,
        rating: null,
        notes: null,
      };
      updateFields.cycles = [...existingCycles, newCycle];
      updateFields.rewatchCount = Math.max(0, (existing.rewatchCount || 0) + 1);
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
      if (isMovie) {
        updateFields.status = 'completed';
        updateFields.completedAt = new Date();
        updateFields.primaryUnitCurrent = Math.max(1, (existing.primaryUnitCurrent || 0) + 1);
      } else {
        updateFields.status = 'in_progress';
        updateFields.completedAt = null;
        updateFields.primaryUnitCurrent = 1;
        updateFields.secondaryUnitCurrent = 0;
      }
    } else if (updateFields.status === 'completed') {
      const currentCycles =
        updateFields.cycles ??
        sanitizeCycles(existing.cycles, existing.startedAt, existing.completedAt, existing.id);
      const latestCycle = currentCycles[currentCycles.length - 1];
      if (latestCycle && !latestCycle.completedAt) {
        latestCycle.completedAt = (updateFields.completedAt ?? new Date()).toISOString();
        updateFields.cycles = [...currentCycles];
      }
    }

    const effectivePrimaryTotal =
      updateFields.primaryUnitTotal !== undefined
        ? updateFields.primaryUnitTotal
        : existing.primaryUnitTotal;
    const rawPrimaryCurrent =
      updateFields.primaryUnitCurrent !== undefined
        ? updateFields.primaryUnitCurrent
        : existing.primaryUnitCurrent;
    updateFields.primaryUnitCurrent =
      effectivePrimaryTotal !== null
        ? Math.min(rawPrimaryCurrent, effectivePrimaryTotal)
        : rawPrimaryCurrent;

    const effectiveSecondaryTotal =
      updateFields.secondaryUnitTotal !== undefined
        ? updateFields.secondaryUnitTotal
        : existing.secondaryUnitTotal;
    const rawSecondaryCurrent =
      updateFields.secondaryUnitCurrent !== undefined
        ? updateFields.secondaryUnitCurrent
        : existing.secondaryUnitCurrent;
    updateFields.secondaryUnitCurrent =
      effectiveSecondaryTotal !== null
        ? Math.min(rawSecondaryCurrent, effectiveSecondaryTotal)
        : rawSecondaryCurrent;

    if (updateFields.status === 'dropped') {
      if (
        updateFields.droppedProgressPrimary === undefined ||
        updateFields.droppedProgressPrimary === null
      ) {
        updateFields.droppedProgressPrimary = updateFields.primaryUnitCurrent;
      }
      if (
        updateFields.droppedProgressSecondary === undefined ||
        updateFields.droppedProgressSecondary === null
      ) {
        updateFields.droppedProgressSecondary = updateFields.secondaryUnitCurrent;
      }
      if (updateFields.dropReason === undefined) {
        updateFields.dropReason = existing.dropReason ?? null;
      }
    }

    const whereCond = isGroupEntry
      ? eq(mediaEntries.id, id)
      : and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId));
    const [row] = await tx.update(mediaEntries).set(updateFields).where(whereCond).returning();

    if (!row) {
      throw new Error('Entry not found');
    }

    let actionType: 'progress_update' | 'completed' | 'rewatch' | 'rating' | 'status_change' =
      'progress_update';
    if (validatedUpdates.rewatch === true) actionType = 'rewatch';
    else if (validatedUpdates.status === 'completed') actionType = 'completed';
    else if (
      validatedUpdates.status === 'dropped' ||
      (validatedUpdates.status !== undefined && validatedUpdates.status !== existing.status)
    )
      actionType = 'status_change';
    else if (validatedUpdates.rating !== undefined) actionType = 'rating';

    await logActivity(
      {
        userId,
        mediaId: id,
        actionType,
        details: {
          title: row.title,
          category: row.category,
          season: row.primaryUnitCurrent,
          progress: row.secondaryUnitCurrent,
          total: row.secondaryUnitTotal,
          status: row.status,
          rating: row.rating,
          dropReason: row.dropReason,
          droppedAt: row.droppedAt,
        },
      },
      tx,
    );

    return row;
  });

  return serializeEntry(updated) as MediaEntry;
}

/**
 * Status-only completion helper.
 * Changes shelf status to 'completed' without filling in remaining episodes,
 * chapters, or runtime minutes.
 */
export async function completeMediaEntryForUser(userId: string, id: string): Promise<MediaEntry> {
  return updateMediaProgressForUser(userId, id, { status: 'completed' });
}

export async function deleteMediaEntryForUser(
  userId: string,
  id: string,
): Promise<{ success: boolean; groupId?: string | null }> {
  const existing = await assertCanWriteMedia(id, userId);
  if (existing.groupId) {
    await domainDb().delete(mediaEntries).where(eq(mediaEntries.id, id));
    return { success: true, groupId: existing.groupId };
  } else {
    await domainDb()
      .delete(mediaEntries)
      .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId)));
    return { success: true, groupId: null };
  }
}

export interface BulkImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export async function bulkImportMediaEntriesForUser(
  userId: string,
  items: unknown,
  conflictStrategy = 'skip',
): Promise<BulkImportResult> {
  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  const MAX_IMPORT_ITEMS = 1000;
  const batch = (items as unknown[]).slice(0, MAX_IMPORT_ITEMS);

  const existingRows = await domainDb()
    .select()
    .from(mediaEntries)
    .where(and(eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId)));
  const listed = Array.isArray(existingRows) ? existingRows : [];
  const existing = listed.filter((e) => e && !e.groupId);

  const existingBySourceOrTitle = new Map<string, Pick<MediaRow, 'id'>>();
  existing.forEach((e) => {
    if (e.sourceId) existingBySourceOrTitle.set(e.sourceId.toLowerCase(), e);
    existingBySourceOrTitle.set(`${e.category}:${e.title.toLowerCase()}`, e);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  const strategy = conflictStrategy === 'overwrite' ? 'overwrite' : 'skip';
  if (conflictStrategy !== 'skip' && conflictStrategy !== 'overwrite') {
    throw new Error('Invalid conflict strategy. Use "skip" or "overwrite".');
  }

  for (const rawItem of batch) {
    if (!rawItem || typeof rawItem !== 'object') {
      skipped++;
      continue;
    }
    const item = rawItem as Record<string, unknown>;
    const title = String(item.title || '')
      .trim()
      .slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      skipped++;
      continue;
    }

    try {
      const category = (
        isInList(VALID_CATEGORIES, item.category) ? item.category : 'show'
      ) as MediaRow['category'];
      const sourceKey = typeof item.sourceId === 'string' ? item.sourceId.toLowerCase() : null;
      const titleKey = `${category}:${title.toLowerCase()}`;

      const match =
        (sourceKey && existingBySourceOrTitle.get(sourceKey)) ||
        existingBySourceOrTitle.get(titleKey);

      if (match && strategy === 'skip') {
        skipped++;
        continue;
      }

      const rowId = match && strategy === 'overwrite' ? match.id : crypto.randomUUID();
      const payload = buildMediaPayload(
        { ...item, id: rowId },
        {
          category,
          title,
          mode: 'bulk',
        },
      );
      const isPrivate = Boolean(item.isPrivate);

      if (match && strategy === 'overwrite') {
        await domainDb()
          .update(mediaEntries)
          .set({ ...payload, isPrivate })
          .where(
            and(
              eq(mediaEntries.id, match.id),
              eq(mediaEntries.userId, userId),
              isNull(mediaEntries.groupId),
            ),
          );
        if (sourceKey) existingBySourceOrTitle.set(sourceKey, match);
        existingBySourceOrTitle.set(titleKey, match);
        updated++;
      } else {
        await domainDb()
          .insert(mediaEntries)
          .values({
            ...payload,
            id: rowId,
            userId,
            createdAt: toDateOrNull(item.createdAt) ?? new Date(),
            isPrivate,
          });
        const inserted = { id: rowId };
        if (sourceKey) existingBySourceOrTitle.set(sourceKey, inserted);
        existingBySourceOrTitle.set(titleKey, inserted);
        added++;
      }
    } catch {
      skipped++;
    }
  }

  return { added, updated, skipped };
}

export async function addMediaCycleForUser(
  userId: string,
  mediaId: string,
  input: MediaCycleInput,
): Promise<MediaEntry> {
  const updated = await mutateCycles(
    mediaId,
    userId,
    (existingCycles) => {
      const cycleNumber = existingCycles.length + 1;
      const startedAt = input.startedAt ? toDateOrNull(input.startedAt) : new Date();
      const completedAt = input.completedAt ? toDateOrNull(input.completedAt) : null;
      const rating = sanitizeRating(input.rating);
      const notes = input.notes ? String(input.notes).trim().slice(0, MAX_NOTES_LENGTH) : null;

      const newCycle: MediaCycle = {
        id: crypto.randomUUID(),
        cycleNumber,
        startedAt: startedAt ? startedAt.toISOString() : null,
        completedAt: completedAt ? completedAt.toISOString() : null,
        rating,
        notes,
      };

      return [...existingCycles, newCycle];
    },
    { recalculateRewatchCount: true },
  );
  return serializeEntry(updated) as MediaEntry;
}

export async function updateMediaCycleForUser(
  userId: string,
  mediaId: string,
  cycleId: string,
  updates: MediaCycleInput,
): Promise<MediaEntry> {
  const additionalFields: Partial<MediaRow> = {};
  const updated = await mutateCycles(
    mediaId,
    userId,
    (existingCycles) => {
      const cycleIndex = existingCycles.findIndex((c) => c.id === cycleId);
      if (cycleIndex === -1) {
        throw new Error('Cycle not found');
      }

      const targetCycle = existingCycles[cycleIndex]!;
      if (updates.startedAt !== undefined) {
        const parsed = toDateOrNull(updates.startedAt);
        targetCycle.startedAt = parsed ? parsed.toISOString() : null;
      }
      if (updates.completedAt !== undefined) {
        const parsed = toDateOrNull(updates.completedAt);
        targetCycle.completedAt = parsed ? parsed.toISOString() : null;
      }
      if (updates.rating !== undefined) {
        targetCycle.rating = sanitizeRating(updates.rating);
      }
      if (updates.notes !== undefined) {
        targetCycle.notes =
          updates.notes == null ? null : String(updates.notes).trim().slice(0, MAX_NOTES_LENGTH);
      }

      if (cycleIndex === 0 && targetCycle.startedAt) {
        additionalFields.startedAt = new Date(targetCycle.startedAt);
      }
      if (cycleIndex === existingCycles.length - 1 && targetCycle.completedAt) {
        additionalFields.completedAt = new Date(targetCycle.completedAt);
      }

      return existingCycles;
    },
    { getAdditionalFields: () => additionalFields },
  );
  return serializeEntry(updated) as MediaEntry;
}

export async function deleteMediaCycleForUser(
  userId: string,
  mediaId: string,
  cycleId: string,
): Promise<MediaEntry> {
  const updated = await mutateCycles(
    mediaId,
    userId,
    (existingCycles, existing) => {
      const filteredCycles = existingCycles.filter((c) => c.id !== cycleId);
      const renumberedCycles = (
        filteredCycles.length > 0
          ? filteredCycles
          : [
              {
                id: crypto.randomUUID(),
                cycleNumber: 1,
                startedAt: existing.startedAt
                  ? existing.startedAt.toISOString()
                  : new Date().toISOString(),
                completedAt: existing.completedAt ? existing.completedAt.toISOString() : null,
                rating: null,
                notes: null,
              },
            ]
      ).map((c, i) => ({
        ...c,
        cycleNumber: i + 1,
      }));

      return renumberedCycles;
    },
    { recalculateRewatchCount: true },
  );
  return serializeEntry(updated) as MediaEntry;
}

export async function togglePriorityQueueForUser(userId: string, id: string): Promise<MediaEntry> {
  const updated = await domainDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId)));

    if (!existing) {
      throw new Error('Entry not found');
    }

    if (existing.priorityIndex != null) {
      const [row] = await tx
        .update(mediaEntries)
        .set({ priorityIndex: null, updatedAt: new Date() })
        .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId)))
        .returning();

      await compactPriorityQueue(tx, userId, id);
      return row;
    } else {
      const queued = await tx
        .select({ priorityIndex: mediaEntries.priorityIndex })
        .from(mediaEntries)
        .where(and(eq(mediaEntries.userId, userId), isNotNull(mediaEntries.priorityIndex)))
        .orderBy(desc(mediaEntries.priorityIndex));

      const nextRank =
        queued.length > 0 && queued[0]?.priorityIndex != null ? queued[0].priorityIndex + 1 : 1;

      const [row] = await tx
        .update(mediaEntries)
        .set({ priorityIndex: nextRank, updatedAt: new Date() })
        .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, userId)))
        .returning();

      return row;
    }
  });

  return serializeEntry(updated) as MediaEntry;
}

export async function reorderPriorityQueueForUser(
  userId: string,
  orderedIds: string[],
): Promise<void> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  await domainDb().transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const mediaId = orderedIds[i]!;
      await tx
        .update(mediaEntries)
        .set({ priorityIndex: i + 1, updatedAt: new Date() })
        .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, userId)));
    }
  });
}

export async function addMediaQuoteForUser(
  userId: string,
  mediaId: string,
  quote: { text: string; speaker?: string | null; citation?: string | null; isFavorite?: boolean },
): Promise<MediaEntry> {
  const trimmedText = quote.text?.trim().slice(0, 2000);
  if (!trimmedText) {
    throw new Error('Quote text is required.');
  }

  const newQuote: MediaQuote = {
    id: crypto.randomUUID(),
    text: trimmedText,
    speaker: quote.speaker?.trim().slice(0, 100) || null,
    citation: quote.citation?.trim().slice(0, 100) || null,
    isFavorite: Boolean(quote.isFavorite),
    createdAt: new Date().toISOString(),
  };

  const updated = await mutateQuotes(mediaId, userId, (existingQuotes) => [
    ...existingQuotes,
    newQuote,
  ]);
  return serializeEntry(updated) as MediaEntry;
}

export async function updateMediaQuoteForUser(
  userId: string,
  mediaId: string,
  quoteId: string,
  updates: Partial<MediaQuote>,
): Promise<MediaEntry> {
  const updated = await mutateQuotes(mediaId, userId, (existingQuotes) =>
    existingQuotes.map((quote) => {
      if (quote.id !== quoteId) return quote;
      return {
        ...quote,
        text: updates.text !== undefined ? updates.text.trim().slice(0, 2000) : quote.text,
        speaker:
          updates.speaker !== undefined
            ? updates.speaker?.trim().slice(0, 100) || null
            : quote.speaker,
        citation:
          updates.citation !== undefined
            ? updates.citation?.trim().slice(0, 100) || null
            : quote.citation,
        isFavorite:
          updates.isFavorite !== undefined ? Boolean(updates.isFavorite) : quote.isFavorite,
      };
    }),
  );
  return serializeEntry(updated) as MediaEntry;
}

export async function deleteMediaQuoteForUser(
  userId: string,
  mediaId: string,
  quoteId: string,
): Promise<MediaEntry> {
  const updated = await mutateQuotes(mediaId, userId, (existingQuotes) =>
    existingQuotes.filter((quote) => quote.id !== quoteId),
  );
  return serializeEntry(updated) as MediaEntry;
}

export interface MediaLiteEntry {
  id: string;
  title: string;
  status: string;
  category: MediaRow['category'];
  rating: number | null;
  primaryUnitCurrent: number;
  primaryUnitTotal: number | null;
  secondaryUnitCurrent: number;
  secondaryUnitTotal: number | null;
  sourceId: string | null;
  isPrivate: boolean;
  notes: string | null;
  tags: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface ListPersonalLibraryLiteOptions {
  status?: string;
  category?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lightweight personal library query designed for Discord bot (/now, /library, autocomplete).
 * Excludes heavy coverImage base64 payloads to keep query latency and memory minimal.
 */
export async function listPersonalLibraryLite(
  userId: string,
  opts: ListPersonalLibraryLiteOptions = {},
): Promise<MediaLiteEntry[]> {
  const conditions = [eq(mediaEntries.userId, userId), isNull(mediaEntries.groupId)];

  if (opts.status && opts.status !== 'any') {
    conditions.push(eq(mediaEntries.status, opts.status));
  }
  if (opts.category && opts.category !== 'any') {
    conditions.push(eq(mediaEntries.category, opts.category as MediaRow['category']));
  }
  if (opts.query && opts.query.trim()) {
    conditions.push(ilike(mediaEntries.title, ilikeContainsPattern(opts.query.trim())));
  }

  const queryBuilder = domainDb()
    .select({
      id: mediaEntries.id,
      title: mediaEntries.title,
      status: mediaEntries.status,
      category: mediaEntries.category,
      rating: mediaEntries.rating,
      primaryUnitCurrent: mediaEntries.primaryUnitCurrent,
      primaryUnitTotal: mediaEntries.primaryUnitTotal,
      secondaryUnitCurrent: mediaEntries.secondaryUnitCurrent,
      secondaryUnitTotal: mediaEntries.secondaryUnitTotal,
      sourceId: mediaEntries.sourceId,
      isPrivate: mediaEntries.isPrivate,
      notes: mediaEntries.notes,
      tags: mediaEntries.tags,
      startedAt: mediaEntries.startedAt,
      completedAt: mediaEntries.completedAt,
      updatedAt: mediaEntries.updatedAt,
    })
    .from(mediaEntries)
    .where(and(...conditions))
    .orderBy(
      // Sort in_progress first when querying broadly
      sql`CASE WHEN ${mediaEntries.status} = 'in_progress' THEN 0 ELSE 1 END`,
      desc(mediaEntries.updatedAt),
    );

  if (opts.limit) {
    queryBuilder.limit(opts.limit);
  }
  if (opts.offset) {
    queryBuilder.offset(opts.offset);
  }

  const rows = await queryBuilder;

  return rows.map((r) => ({
    ...r,
    tags: (r.tags as string[] | null) ?? [],
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : new Date().toISOString(),
  }));
}

export async function findPersonalEntryBySourceId(
  userId: string,
  sourceId: string,
): Promise<{ id: string; title: string } | null> {
  const rows = await domainDb()
    .select({ id: mediaEntries.id, title: mediaEntries.title })
    .from(mediaEntries)
    .where(
      and(
        eq(mediaEntries.userId, userId),
        isNull(mediaEntries.groupId),
        eq(mediaEntries.sourceId, sourceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TitleResolutionResult {
  entry?: MediaRow;
  ambiguous?: MediaRow[];
  notFound?: boolean;
}

/**
 * Resolves a title option from a slash command or component interaction.
 * Supports exact UUIDs (from autocomplete) or fuzzy title matching.
 */
export async function resolvePersonalTitle(
  userId: string,
  queryOrId: string,
): Promise<TitleResolutionResult> {
  const trimmed = queryOrId.trim();
  if (!trimmed) {
    return { notFound: true };
  }

  // 1. Direct UUID lookup (standard autocomplete selection)
  if (UUID_REGEX.test(trimmed)) {
    const [entry] = await domainDb()
      .select()
      .from(mediaEntries)
      .where(
        and(
          eq(mediaEntries.id, trimmed),
          eq(mediaEntries.userId, userId),
          isNull(mediaEntries.groupId),
        ),
      )
      .limit(1);

    if (entry) {
      return { entry };
    }
  }

  // 2. Exact match (case-insensitive)
  const exactMatches = await domainDb()
    .select()
    .from(mediaEntries)
    .where(
      and(
        eq(mediaEntries.userId, userId),
        isNull(mediaEntries.groupId),
        ilike(mediaEntries.title, escapeIlikePattern(trimmed)),
      ),
    )
    .limit(2);

  if (exactMatches.length === 1) {
    return { entry: exactMatches[0] };
  }

  // 3. Substring match
  const substringMatches = await domainDb()
    .select()
    .from(mediaEntries)
    .where(
      and(
        eq(mediaEntries.userId, userId),
        isNull(mediaEntries.groupId),
        ilike(mediaEntries.title, ilikeContainsPattern(trimmed)),
      ),
    )
    .limit(25);

  if (substringMatches.length === 1) {
    return { entry: substringMatches[0] };
  }

  if (substringMatches.length > 1) {
    return { ambiguous: substringMatches };
  }

  return { notFound: true };
}
