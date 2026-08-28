'use server';

import { db } from '@/lib/db';
import { mediaEntries } from '@/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
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
import type { MediaEntry, StructureItem, MediaCycle, MediaCycleInput } from '@/types/media';
import { serializeEntry } from '@/lib/serialize';
import { getAuthUser, logActivity } from './internal';

type MediaRow = typeof mediaEntries.$inferSelect;

function toInt(value: unknown, fallback: number): number;
function toInt(value: unknown, fallback: null): number | null;
function toInt(value: unknown, fallback: number | null): number | null {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isInList(list: readonly string[], value: unknown): value is string {
  return typeof value === 'string' && list.includes(value);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeStructure(structure: unknown): StructureItem[] {
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

function sanitizeTags(tags: unknown): string[] {
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

function sanitizeRating(rating: unknown): number | null {
  if (rating === null || rating === undefined || rating === '') return null;
  const parsed = parseInt(String(rating), 10);
  if (isNaN(parsed)) return null;
  return Math.min(MAX_RATING, Math.max(1, parsed));
}

function sanitizeStatus(status: unknown): string {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return isInList(VALID_STATUSES, normalized) ? normalized : 'in_progress';
}

function sanitizeCycles(
  cycles: unknown,
  fallbackStart?: Date | string | null,
  fallbackEnd?: Date | string | null,
): MediaCycle[] {
  if (Array.isArray(cycles) && cycles.length > 0) {
    const list = (cycles as Record<string, unknown>[])
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => {
        const id = typeof c.id === 'string' && c.id ? c.id : crypto.randomUUID();
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

  const startIso = fallbackStart
    ? (toDateOrNull(fallbackStart)?.toISOString() ?? null)
    : new Date().toISOString();
  const endIso = fallbackEnd ? (toDateOrNull(fallbackEnd)?.toISOString() ?? null) : null;
  return [
    {
      id: crypto.randomUUID(),
      cycleNumber: 1,
      startedAt: startIso,
      completedAt: endIso,
      rating: null,
      notes: null,
    },
  ];
}

import { getMediaEntriesByUserId } from './queries/media';

export async function getMediaEntries(): Promise<MediaEntry[]> {
  const user = await getAuthUser();
  return getMediaEntriesByUserId(user.id);
}

export async function createMediaEntry(data: Record<string, unknown>): Promise<MediaEntry> {
  const user = await getAuthUser();

  const title = String(data.title || '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  if (!title) {
    throw new Error('Title is required');
  }

  const id = crypto.randomUUID();
  const category = (
    isInList(VALID_CATEGORIES, data.category)
      ? data.category
      : data.type === 'book'
        ? 'book'
        : 'show'
  ) as MediaRow['category'];

  const primaryUnitCurrent =
    category === 'movie'
      ? Math.max(0, toInt(data.primaryUnitCurrent, data.status === 'completed' ? 1 : 0))
      : Math.max(1, toInt(data.primaryUnitCurrent, 1));
  const primaryUnitTotal =
    data.primaryUnitTotal !== undefined &&
    data.primaryUnitTotal !== null &&
    data.primaryUnitTotal !== ''
      ? Math.max(1, toInt(data.primaryUnitTotal, 1))
      : null;

  const secondaryUnitCurrent = Math.max(0, toInt(data.secondaryUnitCurrent, 0));
  const secondaryUnitTotal =
    data.secondaryUnitTotal !== undefined &&
    data.secondaryUnitTotal !== null &&
    data.secondaryUnitTotal !== ''
      ? Math.max(0, toInt(data.secondaryUnitTotal, 0))
      : null;

  const structure = sanitizeStructure(data.structure);
  const status = sanitizeStatus(data.status);
  const rating = sanitizeRating(data.rating);
  const tags = sanitizeTags(data.tags);
  const genres = Array.isArray(data.genres) ? (data.genres as string[]).slice(0, 20) : [];
  const synopsis = data.synopsis
    ? String(data.synopsis).trim().slice(0, MAX_SYNOPSIS_LENGTH)
    : null;
  const startedAt = toDateOrNull(data.startedAt) ?? new Date();
  const completedAt =
    status === 'completed' ? (toDateOrNull(data.completedAt) ?? new Date()) : null;
  const droppedAt = status === 'dropped' ? (toDateOrNull(data.droppedAt) ?? new Date()) : null;
  const dropReason =
    status === 'dropped' && data.dropReason
      ? String(data.dropReason).trim().slice(0, MAX_DROP_REASON_LENGTH)
      : null;
  const droppedProgressPrimary =
    status === 'dropped'
      ? primaryUnitTotal !== null
        ? Math.min(primaryUnitCurrent, primaryUnitTotal)
        : primaryUnitCurrent
      : null;
  const droppedProgressSecondary =
    status === 'dropped'
      ? secondaryUnitTotal !== null
        ? Math.min(secondaryUnitCurrent, secondaryUnitTotal)
        : secondaryUnitCurrent
      : null;

  const cycles = sanitizeCycles(data.cycles, startedAt, completedAt);

  const coverImage =
    typeof data.coverImage === 'string' && data.coverImage.length <= MAX_COVER_IMAGE_LENGTH
      ? data.coverImage
      : null;
  const sourceId =
    typeof data.sourceId === 'string' ? data.sourceId.slice(0, MAX_SOURCE_ID_LENGTH) : null;
  const notes = data.notes ? String(data.notes).trim().slice(0, MAX_NOTES_LENGTH) : null;

  const newEntry = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(mediaEntries)
      .values({
        id,
        userId: user.id,
        title,
        category,
        status,
        dropReason,
        droppedAt,
        droppedProgressPrimary,
        droppedProgressSecondary,
        completedAt,
        startedAt,
        rewatchCount: Math.max(0, cycles.length - 1),
        cycles,
        rating,
        tags,
        genres,
        synopsis,
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
        structure,
        coverImage,
        sourceId,
        notes,
        updatedAt: new Date(),
      })
      .returning();

    await logActivity(
      {
        userId: user.id,
        mediaId: id,
        actionType: 'created',
        details: {
          title,
          category,
          status,
          ...(status === 'dropped' ? { dropReason, droppedAt } : {}),
        },
      },
      tx,
    );

    return inserted;
  });

  revalidatePath('/dashboard');
  return serializeEntry(newEntry) as MediaEntry;
}

export async function updateMediaProgress(
  id: string,
  updates: Record<string, unknown>,
): Promise<MediaEntry> {
  const user = await getAuthUser();

  const updateFields: Partial<MediaRow> = {
    updatedAt: new Date(),
  };

  if (updates.title !== undefined) {
    const title = String(updates.title).trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      throw new Error('Title is required');
    }
    updateFields.title = title;
  }

  if (updates.category !== undefined) {
    if (!isInList(VALID_CATEGORIES, updates.category)) {
      throw new Error('Invalid category');
    }
    updateFields.category = updates.category as MediaRow['category'];
  }

  if (updates.status !== undefined) {
    const status = sanitizeStatus(updates.status);
    updateFields.status = status;
    if (status === 'completed') {
      updateFields.completedAt = toDateOrNull(updates.completedAt) ?? new Date();
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
    } else if (status === 'dropped') {
      updateFields.completedAt = null;
      updateFields.droppedAt = toDateOrNull(updates.droppedAt) ?? new Date();
      if (updates.dropReason !== undefined) {
        updateFields.dropReason = updates.dropReason
          ? String(updates.dropReason).trim().slice(0, MAX_DROP_REASON_LENGTH)
          : null;
      }
      if (updates.droppedProgressPrimary !== undefined) {
        updateFields.droppedProgressPrimary =
          updates.droppedProgressPrimary !== null
            ? toInt(updates.droppedProgressPrimary, null)
            : null;
      }
      if (updates.droppedProgressSecondary !== undefined) {
        updateFields.droppedProgressSecondary =
          updates.droppedProgressSecondary !== null
            ? toInt(updates.droppedProgressSecondary, null)
            : null;
      }
    } else {
      updateFields.completedAt = null;
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
    }
  } else if (updates.dropReason !== undefined) {
    updateFields.dropReason = updates.dropReason
      ? String(updates.dropReason).trim().slice(0, MAX_DROP_REASON_LENGTH)
      : null;
  }

  if (updates.rating !== undefined) {
    updateFields.rating = sanitizeRating(updates.rating);
  }

  if (updates.cycles !== undefined) {
    updateFields.cycles = sanitizeCycles(updates.cycles);
  }
  if (updates.tags !== undefined) {
    updateFields.tags = sanitizeTags(updates.tags);
  }
  if (updates.synopsis !== undefined) {
    updateFields.synopsis = updates.synopsis
      ? String(updates.synopsis).trim().slice(0, MAX_SYNOPSIS_LENGTH)
      : null;
  }
  if (updates.genres !== undefined) {
    updateFields.genres = Array.isArray(updates.genres)
      ? (updates.genres as string[]).slice(0, 20)
      : [];
  }
  if (updates.startedAt !== undefined) {
    updateFields.startedAt = toDateOrNull(updates.startedAt);
  }
  if (updates.rewatchCount !== undefined) {
    updateFields.rewatchCount = Math.max(0, toInt(updates.rewatchCount, 0));
  }

  if (updates.primaryUnitCurrent !== undefined) {
    updateFields.primaryUnitCurrent = Math.max(0, toInt(updates.primaryUnitCurrent, 0));
  }
  if (updates.primaryUnitTotal !== undefined) {
    updateFields.primaryUnitTotal =
      updates.primaryUnitTotal !== null && updates.primaryUnitTotal !== ''
        ? Math.max(1, toInt(updates.primaryUnitTotal, 1))
        : null;
  }
  if (updates.secondaryUnitCurrent !== undefined) {
    updateFields.secondaryUnitCurrent = Math.max(0, toInt(updates.secondaryUnitCurrent, 0));
  }
  if (updates.secondaryUnitTotal !== undefined) {
    updateFields.secondaryUnitTotal =
      updates.secondaryUnitTotal !== null && updates.secondaryUnitTotal !== ''
        ? Math.max(0, toInt(updates.secondaryUnitTotal, 0))
        : null;
  }

  if (updates.structure !== undefined) {
    updateFields.structure = sanitizeStructure(updates.structure);
  }
  if (updates.coverImage !== undefined) {
    updateFields.coverImage =
      typeof updates.coverImage === 'string' && updates.coverImage.length <= MAX_COVER_IMAGE_LENGTH
        ? updates.coverImage
        : null;
  }
  if (updates.sourceId !== undefined) {
    updateFields.sourceId =
      typeof updates.sourceId === 'string' ? updates.sourceId.slice(0, MAX_SOURCE_ID_LENGTH) : null;
  }
  if (updates.notes !== undefined) {
    updateFields.notes =
      updates.notes == null ? null : String(updates.notes).trim().slice(0, MAX_NOTES_LENGTH);
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, user.id)));

    if (!existing) {
      throw new Error('Entry not found');
    }

    if (updates.rewatch === true) {
      const existingCycles = sanitizeCycles(
        existing.cycles,
        existing.startedAt,
        existing.completedAt,
      );
      const nextCycleNumber = existingCycles.length + 1;
      const newCycle: MediaCycle = {
        id: crypto.randomUUID(),
        cycleNumber: nextCycleNumber,
        startedAt: new Date().toISOString(),
        completedAt: null,
        rating: null,
        notes: null,
      };
      updateFields.cycles = [...existingCycles, newCycle];
      updateFields.rewatchCount = Math.max(0, (existing.rewatchCount || 0) + 1);
      updateFields.status = 'in_progress';
      updateFields.completedAt = null;
      updateFields.droppedAt = null;
      updateFields.dropReason = null;
      updateFields.droppedProgressPrimary = null;
      updateFields.droppedProgressSecondary = null;
      updateFields.primaryUnitCurrent = 1;
      updateFields.secondaryUnitCurrent = 0;
    } else if (updateFields.status === 'completed') {
      const currentCycles =
        updateFields.cycles ??
        sanitizeCycles(existing.cycles, existing.startedAt, existing.completedAt);
      const latestCycle = currentCycles[currentCycles.length - 1];
      if (latestCycle && !latestCycle.completedAt) {
        latestCycle.completedAt = (updateFields.completedAt ?? new Date()).toISOString();
        updateFields.cycles = [...currentCycles];
      }
    }

    // Bidirectional invariant: current <= total whenever the total is known.
    // Combine the sanitized update fields with the stored row so updates that
    // only touch one side still clamp against the other side's DB value.
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

    const [row] = await tx
      .update(mediaEntries)
      .set(updateFields)
      .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, user.id)))
      .returning();

    if (!row) {
      throw new Error('Entry not found');
    }

    let actionType: 'progress_update' | 'completed' | 'rewatch' | 'rating' | 'status_change' =
      'progress_update';
    if (updates.rewatch === true || updates.rewatchCount !== undefined) actionType = 'rewatch';
    else if (updates.status === 'completed') actionType = 'completed';
    else if (
      updates.status === 'dropped' ||
      (updates.status !== undefined && updates.status !== existing.status)
    )
      actionType = 'status_change';
    else if (updates.rating !== undefined) actionType = 'rating';

    await logActivity(
      {
        userId: user.id,
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

  revalidatePath('/dashboard');
  return serializeEntry(updated) as MediaEntry;
}

interface BulkImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export async function bulkImportMediaEntries(
  items: unknown,
  conflictStrategy = 'skip',
): Promise<BulkImportResult> {
  const user = await getAuthUser();
  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  // Serverless guard: cap batch size to protect Worker CPU/memory limits.
  const MAX_IMPORT_ITEMS = 1000;
  const batch = (items as unknown[]).slice(0, MAX_IMPORT_ITEMS);

  const existing = await db.select().from(mediaEntries).where(eq(mediaEntries.userId, user.id));

  const existingBySourceOrTitle = new Map<string, Pick<MediaRow, 'id'>>();
  existing.forEach((e) => {
    if (e.sourceId) existingBySourceOrTitle.set(e.sourceId.toLowerCase(), e);
    existingBySourceOrTitle.set(`${e.category}:${e.title.toLowerCase()}`, e);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const rawItem of batch) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const title = String(item.title || '')
      .trim()
      .slice(0, MAX_TITLE_LENGTH);
    if (!title) continue;

    const category = (
      isInList(VALID_CATEGORIES, item.category) ? item.category : 'show'
    ) as MediaRow['category'];
    const sourceKey = typeof item.sourceId === 'string' ? item.sourceId.toLowerCase() : null;
    const titleKey = `${category}:${title.toLowerCase()}`;

    const match =
      (sourceKey && existingBySourceOrTitle.get(sourceKey)) ||
      existingBySourceOrTitle.get(titleKey);

    if (match && conflictStrategy === 'skip') {
      skipped++;
      continue;
    }

    const rawPrimaryCurrent = Math.max(1, toInt(item.primaryUnitCurrent, 1));
    const rawPrimaryTotal =
      item.primaryUnitTotal != null ? Math.max(1, toInt(item.primaryUnitTotal, 1)) : null;
    const rawSecondaryCurrent = Math.max(0, toInt(item.secondaryUnitCurrent, 0));
    const rawSecondaryTotal =
      item.secondaryUnitTotal != null ? Math.max(0, toInt(item.secondaryUnitTotal, 0)) : null;

    const status = sanitizeStatus(item.status);
    const dropReason =
      status === 'dropped' && item.dropReason
        ? String(item.dropReason).trim().slice(0, MAX_DROP_REASON_LENGTH)
        : null;
    const droppedAt = status === 'dropped' ? (toDateOrNull(item.droppedAt) ?? new Date()) : null;
    const droppedProgressPrimary =
      status === 'dropped'
        ? item.droppedProgressPrimary != null
          ? toInt(item.droppedProgressPrimary, null)
          : rawPrimaryTotal !== null
            ? Math.min(rawPrimaryCurrent, rawPrimaryTotal)
            : rawPrimaryCurrent
        : null;
    const droppedProgressSecondary =
      status === 'dropped'
        ? item.droppedProgressSecondary != null
          ? toInt(item.droppedProgressSecondary, null)
          : rawSecondaryTotal !== null
            ? Math.min(rawSecondaryCurrent, rawSecondaryTotal)
            : rawSecondaryCurrent
        : null;
    const startedAt = toDateOrNull(item.startedAt);
    const completedAt =
      status === 'completed' ? (toDateOrNull(item.completedAt) ?? new Date()) : null;
    const cycles = sanitizeCycles(item.cycles, startedAt, completedAt);
    const rewatchCount =
      item.rewatchCount != null
        ? Math.max(0, toInt(item.rewatchCount, 0))
        : Math.max(0, cycles.length - 1);

    const payload = {
      title,
      category,
      status,
      dropReason,
      droppedAt,
      droppedProgressPrimary,
      droppedProgressSecondary,
      rating: sanitizeRating(item.rating),
      tags: sanitizeTags(item.tags),
      completedAt,
      startedAt,
      rewatchCount,
      cycles,
      synopsis: item.synopsis ? String(item.synopsis).trim().slice(0, MAX_SYNOPSIS_LENGTH) : null,
      genres: Array.isArray(item.genres) ? (item.genres as string[]).slice(0, 20) : [],
      primaryUnitCurrent:
        rawPrimaryTotal !== null ? Math.min(rawPrimaryCurrent, rawPrimaryTotal) : rawPrimaryCurrent,
      primaryUnitTotal: rawPrimaryTotal,
      secondaryUnitCurrent:
        rawSecondaryTotal !== null
          ? Math.min(rawSecondaryCurrent, rawSecondaryTotal)
          : rawSecondaryCurrent,
      secondaryUnitTotal: rawSecondaryTotal,
      structure: sanitizeStructure(item.structure),
      coverImage:
        typeof item.coverImage === 'string' && item.coverImage.length <= MAX_COVER_IMAGE_LENGTH
          ? item.coverImage
          : null,
      sourceId:
        typeof item.sourceId === 'string' ? item.sourceId.slice(0, MAX_SOURCE_ID_LENGTH) : null,
      notes: item.notes ? String(item.notes).trim().slice(0, MAX_NOTES_LENGTH) : null,
      updatedAt: new Date(),
    };

    if (match && conflictStrategy === 'overwrite') {
      await db.update(mediaEntries).set(payload).where(eq(mediaEntries.id, match.id));
      if (sourceKey) existingBySourceOrTitle.set(sourceKey, match);
      existingBySourceOrTitle.set(titleKey, match);
      updated++;
    } else {
      const newId = crypto.randomUUID();
      await db.insert(mediaEntries).values({
        ...payload,
        id: newId,
        userId: user.id,
        createdAt: toDateOrNull(item.createdAt) ?? new Date(),
      });
      const inserted = { id: newId };
      if (sourceKey) existingBySourceOrTitle.set(sourceKey, inserted);
      existingBySourceOrTitle.set(titleKey, inserted);
      added++;
    }
  }

  revalidatePath('/dashboard');
  return { added, updated, skipped };
}

export async function addMediaCycle(mediaId: string, input: MediaCycleInput): Promise<MediaEntry> {
  const user = await getAuthUser();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)));

    if (!existing) {
      throw new Error('Entry not found');
    }

    const existingCycles = sanitizeCycles(
      existing.cycles,
      existing.startedAt,
      existing.completedAt,
    );
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

    const newCycles = [...existingCycles, newCycle];
    const newRewatchCount = Math.max(0, newCycles.length - 1);

    const [row] = await tx
      .update(mediaEntries)
      .set({
        cycles: newCycles,
        rewatchCount: newRewatchCount,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)))
      .returning();

    return row;
  });

  revalidatePath('/dashboard');
  return serializeEntry(updated) as MediaEntry;
}

export async function updateMediaCycle(
  mediaId: string,
  cycleId: string,
  updates: MediaCycleInput,
): Promise<MediaEntry> {
  const user = await getAuthUser();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)));

    if (!existing) {
      throw new Error('Entry not found');
    }

    const existingCycles = sanitizeCycles(
      existing.cycles,
      existing.startedAt,
      existing.completedAt,
    );
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

    const setFields: Partial<MediaRow> = {
      cycles: existingCycles,
      updatedAt: new Date(),
    };

    // If cycle 1 startedAt changed, sync root startedAt
    if (cycleIndex === 0 && targetCycle.startedAt) {
      setFields.startedAt = new Date(targetCycle.startedAt);
    }
    // If latest cycle completedAt changed, sync root completedAt
    if (cycleIndex === existingCycles.length - 1 && targetCycle.completedAt) {
      setFields.completedAt = new Date(targetCycle.completedAt);
    }

    const [row] = await tx
      .update(mediaEntries)
      .set(setFields)
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)))
      .returning();

    return row;
  });

  revalidatePath('/dashboard');
  return serializeEntry(updated) as MediaEntry;
}

export async function deleteMediaCycle(mediaId: string, cycleId: string): Promise<MediaEntry> {
  const user = await getAuthUser();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(mediaEntries)
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)));

    if (!existing) {
      throw new Error('Entry not found');
    }

    const existingCycles = sanitizeCycles(
      existing.cycles,
      existing.startedAt,
      existing.completedAt,
    );
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

    const newRewatchCount = Math.max(0, renumberedCycles.length - 1);

    const [row] = await tx
      .update(mediaEntries)
      .set({
        cycles: renumberedCycles,
        rewatchCount: newRewatchCount,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaEntries.id, mediaId), eq(mediaEntries.userId, user.id)))
      .returning();

    return row;
  });

  revalidatePath('/dashboard');
  return serializeEntry(updated) as MediaEntry;
}

export async function deleteMediaEntry(id: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();

  await db
    .delete(mediaEntries)
    .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, user.id)));

  revalidatePath('/dashboard');
  return { success: true };
}
