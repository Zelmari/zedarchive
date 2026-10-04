'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { setDomainDb } from '@/domain/db-context';

setDomainDb(db);
import type { MediaEntry, MediaQuote } from '@/types/media';
import { toClientEntry } from '@/lib/covers';
import { getAuthUser } from './internal';
import { getMediaEntriesByUserId, getRawMediaEntriesByUserId } from './queries/media';
import {
  createMediaEntryForUser,
  updateMediaProgressForUser,
  deleteMediaEntryForUser,
  bulkImportMediaEntriesForUser,
  togglePriorityQueueForUser,
  addMediaQuoteForUser,
  updateMediaQuoteForUser,
  deleteMediaQuoteForUser,
  type BulkImportResult,
} from '@/domain/media';

export async function getMediaEntries(): Promise<MediaEntry[]> {
  const user = await getAuthUser();
  return getMediaEntriesByUserId(user.id);
}

/**
 * Full entries including stored cover blobs, used by the JSON backup export.
 * Everything else receives display cover URLs from the lean list query.
 */
export async function getMediaEntriesForExport(): Promise<MediaEntry[]> {
  const user = await getAuthUser();
  return getRawMediaEntriesByUserId(user.id);
}

export async function createMediaEntry(data: Record<string, unknown>): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await createMediaEntryForUser(user.id, data);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}

export async function updateMediaProgress(
  id: string,
  updates: Record<string, unknown>,
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await updateMediaProgressForUser(user.id, id, updates);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}

export async function bulkImportMediaEntries(
  items: unknown,
  conflictStrategy = 'skip',
): Promise<BulkImportResult> {
  const user = await getAuthUser();
  const result = await bulkImportMediaEntriesForUser(user.id, items, conflictStrategy);
  revalidatePath('/dashboard');
  return result;
}

export async function togglePriorityQueue(id: string): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await togglePriorityQueueForUser(user.id, id);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}

export async function deleteMediaEntry(id: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  await deleteMediaEntryForUser(user.id, id);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function addMediaQuote(
  mediaId: string,
  quote: { text: string; speaker?: string | null; citation?: string | null; isFavorite?: boolean },
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await addMediaQuoteForUser(user.id, mediaId, quote);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}

export async function updateMediaQuote(
  mediaId: string,
  quoteId: string,
  updates: Partial<MediaQuote>,
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await updateMediaQuoteForUser(user.id, mediaId, quoteId, updates);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}

export async function deleteMediaQuote(mediaId: string, quoteId: string): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await deleteMediaQuoteForUser(user.id, mediaId, quoteId);
  revalidatePath('/dashboard');
  return toClientEntry(entry);
}
