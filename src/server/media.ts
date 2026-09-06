'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { setDomainDb } from '@/domain/db-context';

setDomainDb(db);
import type { MediaEntry, MediaCycleInput, MediaQuote } from '@/types/media';
import { getAuthUser } from './internal';
import { getMediaEntriesByUserId } from './queries/media';
import {
  createMediaEntryForUser,
  updateMediaProgressForUser,
  deleteMediaEntryForUser,
  bulkImportMediaEntriesForUser,
  addMediaCycleForUser,
  updateMediaCycleForUser,
  deleteMediaCycleForUser,
  togglePriorityQueueForUser,
  reorderPriorityQueueForUser,
  addMediaQuoteForUser,
  updateMediaQuoteForUser,
  deleteMediaQuoteForUser,
  type BulkImportResult,
} from '@/domain/media';

export async function getMediaEntries(): Promise<MediaEntry[]> {
  const user = await getAuthUser();
  return getMediaEntriesByUserId(user.id);
}

export async function createMediaEntry(
  data: Record<string, unknown> & { groupId?: string | null },
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await createMediaEntryForUser(user.id, data);
  revalidatePath('/dashboard');
  if (entry.groupId) revalidatePath(`/groups/${entry.groupId}`);
  return entry;
}

export async function updateMediaProgress(
  id: string,
  updates: Record<string, unknown> & { groupId?: string | null },
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await updateMediaProgressForUser(user.id, id, updates);
  revalidatePath('/dashboard');
  if (entry.groupId) revalidatePath(`/groups/${entry.groupId}`);
  return entry;
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

export async function addMediaCycle(mediaId: string, input: MediaCycleInput): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await addMediaCycleForUser(user.id, mediaId, input);
  revalidatePath('/dashboard');
  return entry;
}

export async function updateMediaCycle(
  mediaId: string,
  cycleId: string,
  updates: MediaCycleInput,
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await updateMediaCycleForUser(user.id, mediaId, cycleId, updates);
  revalidatePath('/dashboard');
  return entry;
}

export async function deleteMediaCycle(mediaId: string, cycleId: string): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await deleteMediaCycleForUser(user.id, mediaId, cycleId);
  revalidatePath('/dashboard');
  return entry;
}

export async function togglePriorityQueue(id: string): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await togglePriorityQueueForUser(user.id, id);
  revalidatePath('/dashboard');
  return entry;
}

export async function reorderPriorityQueue(orderedIds: string[]): Promise<void> {
  const user = await getAuthUser();
  await reorderPriorityQueueForUser(user.id, orderedIds);
  revalidatePath('/dashboard');
}

export async function deleteMediaEntry(id: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  const result = await deleteMediaEntryForUser(user.id, id);
  revalidatePath('/dashboard');
  if (result.groupId) revalidatePath(`/groups/${result.groupId}`);
  return { success: true };
}

export async function addMediaQuote(
  mediaId: string,
  quote: { text: string; speaker?: string | null; citation?: string | null; isFavorite?: boolean },
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await addMediaQuoteForUser(user.id, mediaId, quote);
  revalidatePath('/dashboard');
  if (entry.groupId) revalidatePath(`/groups/${entry.groupId}`);
  return entry;
}

export async function updateMediaQuote(
  mediaId: string,
  quoteId: string,
  updates: Partial<MediaQuote>,
): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await updateMediaQuoteForUser(user.id, mediaId, quoteId, updates);
  revalidatePath('/dashboard');
  if (entry.groupId) revalidatePath(`/groups/${entry.groupId}`);
  return entry;
}

export async function deleteMediaQuote(mediaId: string, quoteId: string): Promise<MediaEntry> {
  const user = await getAuthUser();
  const entry = await deleteMediaQuoteForUser(user.id, mediaId, quoteId);
  revalidatePath('/dashboard');
  if (entry.groupId) revalidatePath(`/groups/${entry.groupId}`);
  return entry;
}
