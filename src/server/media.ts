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
  MAX_SYNOPSIS_LENGTH,
  MAX_SOURCE_ID_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  MAX_STRUCTURE_LENGTH,
  MAX_RATING,
} from '@/lib/constants';
import type { MediaEntry, StructureItem } from '@/types/media';
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

export async function getMediaEntries(): Promise<MediaEntry[]> {
  const user = await getAuthUser();

  const entries = await db
    .select()
    .from(mediaEntries)
    .where(eq(mediaEntries.userId, user.id))
    .orderBy(desc(mediaEntries.updatedAt));

  return entries.map(serializeEntry).filter((entry): entry is MediaEntry => entry !== null);
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

  const primaryUnitCurrent = Math.max(1, toInt(data.primaryUnitCurrent, 1));
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
        completedAt,
        startedAt,
        rewatchCount: 0,
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
        details: { title, category, status },
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
    } else {
      updateFields.completedAt = null;
    }
  }

  if (updates.rating !== undefined) {
    updateFields.rating = sanitizeRating(updates.rating);
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
    updateFields.primaryUnitCurrent = Math.max(1, toInt(updates.primaryUnitCurrent, 1));
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

    const [row] = await tx
      .update(mediaEntries)
      .set(updateFields)
      .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, user.id)))
      .returning();

    if (!row) {
      throw new Error('Entry not found');
    }

    let actionType: 'progress_update' | 'completed' | 'rewatch' | 'rating' = 'progress_update';
    if (updates.status === 'completed') actionType = 'completed';
    else if (updates.rewatchCount !== undefined) actionType = 'rewatch';
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

    const payload = {
      title,
      category,
      status,
      rating: sanitizeRating(item.rating),
      tags: sanitizeTags(item.tags),
      completedAt: status === 'completed' ? (toDateOrNull(item.completedAt) ?? new Date()) : null,
      startedAt: toDateOrNull(item.startedAt),
      rewatchCount: Math.max(0, toInt(item.rewatchCount, 0)),
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

export async function deleteMediaEntry(id: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();

  await db
    .delete(mediaEntries)
    .where(and(eq(mediaEntries.id, id), eq(mediaEntries.userId, user.id)));

  revalidatePath('/dashboard');
  return { success: true };
}
