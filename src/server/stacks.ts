'use server';

import { db } from '@/lib/db';
import { stacks, stackItems, mediaEntries, user as userTable } from '@/db/schema';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthUser, type DbClient, type SessionUser } from './internal';
import { serializeEntry } from '@/lib/serialize';
import type { MediaEntry } from '@/types/media';

export interface StackWithItems {
  id: string;
  userId: string;
  title: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    mediaId: string;
    orderIndex: number;
    annotation: string | null;
    media: MediaEntry | null;
  }>;
}

type StackItems = StackWithItems['items'];
type StackRow = typeof stacks.$inferSelect;
type StackItemRow = typeof stackItems.$inferSelect;

const MAX_STACK_TITLE_LENGTH = 200;
const MAX_STACK_TEXT_LENGTH = 2000;

function sanitizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = value.trim().slice(0, maxLength);
  return sanitized || null;
}

function sanitizeStackTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim().slice(0, MAX_STACK_TITLE_LENGTH) : '';
  if (!title) throw new Error('Stack title is required');
  return title;
}

async function getOwnedStack(
  stackId: string,
  userId: string,
  client: DbClient = db,
): Promise<StackRow> {
  const [stack] = await client
    .select()
    .from(stacks)
    .where(and(eq(stacks.id, stackId), eq(stacks.userId, userId)))
    .limit(1);

  if (!stack) throw new Error('Stack not found');
  return stack;
}

async function getUsername(user: SessionUser, client: DbClient = db): Promise<string | null> {
  const sessionUsername = typeof user.username === 'string' ? user.username.trim() : '';
  if (sessionUsername) return sessionUsername;

  const [dbUser] = await client
    .select({ username: userTable.username })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);

  return typeof dbUser?.username === 'string' ? dbUser.username.trim() || null : null;
}

async function revalidateStackPaths(
  stack: Pick<StackRow, 'slug' | 'isPublic'>,
  user: SessionUser,
  isPublic = stack.isPublic,
): Promise<void> {
  revalidatePath('/stacks');
  if (!isPublic) return;

  const username = await getUsername(user);
  if (username) revalidatePath(`/u/${username}/stacks/${stack.slug}`);
}

function isStackItemUniqueViolation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === '23505') return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('stack_items_stack_media_unique');
}

async function loadStackItems(
  stackId: string,
  options: { hidePrivate: boolean },
): Promise<StackItems>;
async function loadStackItems(
  stackIds: string[],
  options: { hidePrivate: boolean },
): Promise<Map<string, StackItems>>;
async function loadStackItems(
  stackIdOrIds: string | string[],
  { hidePrivate }: { hidePrivate: boolean },
): Promise<StackItems | Map<string, StackItems>> {
  const stackIds = Array.isArray(stackIdOrIds) ? stackIdOrIds : [stackIdOrIds];
  if (stackIds.length === 0) return new Map<string, StackItems>();

  const stackFilter = Array.isArray(stackIdOrIds)
    ? inArray(stackItems.stackId, stackIds)
    : eq(stackItems.stackId, stackIdOrIds);
  const rawItems = await db
    .select({
      item: stackItems,
      media: mediaEntries,
    })
    .from(stackItems)
    .leftJoin(mediaEntries, eq(stackItems.mediaId, mediaEntries.id))
    .where(hidePrivate ? and(stackFilter, eq(mediaEntries.isPrivate, false)) : stackFilter)
    .orderBy(asc(stackItems.orderIndex));

  const itemsByStackId = new Map<string, StackItems>();
  for (const { item, media } of rawItems) {
    const items = itemsByStackId.get(item.stackId) ?? [];
    items.push({
      id: item.id,
      mediaId: item.mediaId,
      orderIndex: item.orderIndex,
      annotation: item.annotation,
      media: media ? serializeEntry(media) : null,
    });
    itemsByStackId.set(item.stackId, items);
  }

  return Array.isArray(stackIdOrIds) ? itemsByStackId : (itemsByStackId.get(stackIdOrIds) ?? []);
}

export async function getMyStacks(): Promise<StackWithItems[]> {
  const user = await getAuthUser();

  const userStacks = await db
    .select()
    .from(stacks)
    .where(eq(stacks.userId, user.id))
    .orderBy(desc(stacks.updatedAt));

  const itemsByStackId = await loadStackItems(
    userStacks.map((stack) => stack.id),
    { hidePrivate: false },
  );

  return userStacks.map((stack) => ({
    ...stack,
    items: itemsByStackId.get(stack.id) ?? [],
  }));
}

export async function getPublicStack(
  username: string,
  slug: string,
): Promise<{
  user: { name: string; username: string | null; image: string | null };
  stack: StackWithItems;
} | null> {
  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

  const [foundUser] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      isPublic: userTable.isPublic,
    })
    .from(userTable)
    .where(eq(userTable.username, cleanUsername));

  if (!foundUser || !foundUser.isPublic) return null;

  const [foundStack] = await db
    .select()
    .from(stacks)
    .where(and(eq(stacks.userId, foundUser.id), eq(stacks.slug, slug), eq(stacks.isPublic, true)));

  if (!foundStack) return null;

  const stack: StackWithItems = {
    ...foundStack,
    items: await loadStackItems(foundStack.id, { hidePrivate: true }),
  };

  return {
    user: {
      name: foundUser.name,
      username: foundUser.username,
      image: foundUser.image,
    },
    stack,
  };
}

export async function createStackAction(params: {
  title: string;
  description?: string | null;
  isPublic?: boolean;
}): Promise<StackWithItems> {
  const user = await getAuthUser();
  const title = sanitizeStackTitle(params.title);

  const baseSlug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'stack';
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const id = crypto.randomUUID();

  const [inserted] = await db
    .insert(stacks)
    .values({
      id,
      userId: user.id,
      title,
      slug,
      description: sanitizeOptionalText(params.description, MAX_STACK_TEXT_LENGTH),
      isPublic: params.isPublic ?? true,
      updatedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new Error('Failed to create stack');
  }

  await revalidateStackPaths(inserted, user);
  return {
    ...inserted,
    items: [],
  };
}

export async function deleteStackAction(stackId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  const stack = await getOwnedStack(stackId, user.id);

  await db.delete(stacks).where(and(eq(stacks.id, stack.id), eq(stacks.userId, user.id)));

  await revalidateStackPaths(stack, user);
  return { success: true };
}

export async function addStackItemAction(params: {
  stackId: string;
  mediaId: string;
  annotation?: string | null;
}): Promise<StackItemRow> {
  const user = await getAuthUser();
  const stack = await getOwnedStack(params.stackId, user.id);

  const [media] = await db
    .select({ id: mediaEntries.id })
    .from(mediaEntries)
    .where(and(eq(mediaEntries.id, params.mediaId), eq(mediaEntries.userId, user.id)))
    .limit(1);

  if (!media) throw new Error('Media entry not found');

  const [existing] = await db
    .select({ id: stackItems.id })
    .from(stackItems)
    .where(and(eq(stackItems.stackId, stack.id), eq(stackItems.mediaId, params.mediaId)))
    .limit(1);

  if (existing) throw new Error('Media entry is already in this stack');

  const [lastItem] = await db
    .select({ orderIndex: stackItems.orderIndex })
    .from(stackItems)
    .where(eq(stackItems.stackId, stack.id))
    .orderBy(desc(stackItems.orderIndex))
    .limit(1);

  const orderIndex = typeof lastItem?.orderIndex === 'number' ? lastItem.orderIndex + 1 : 0;
  let inserted: StackItemRow | undefined;

  try {
    [inserted] = await db
      .insert(stackItems)
      .values({
        id: crypto.randomUUID(),
        stackId: stack.id,
        mediaId: params.mediaId,
        orderIndex,
        annotation: sanitizeOptionalText(params.annotation, MAX_STACK_TEXT_LENGTH),
      })
      .returning();
  } catch (error) {
    if (isStackItemUniqueViolation(error)) {
      throw new Error('Media entry is already in this stack');
    }
    throw error;
  }

  if (!inserted) throw new Error('Failed to add stack item');

  await revalidateStackPaths(stack, user);
  return inserted;
}

export async function removeStackItemAction(params: {
  stackId: string;
  itemId: string;
}): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  const stack = await getOwnedStack(params.stackId, user.id);

  await db
    .delete(stackItems)
    .where(and(eq(stackItems.id, params.itemId), eq(stackItems.stackId, stack.id)));

  await revalidateStackPaths(stack, user);
  return { success: true };
}

export async function reorderStackItemsAction(params: {
  stackId: string;
  orderedIds: string[];
}): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  const stack = await getOwnedStack(params.stackId, user.id);

  if (
    !Array.isArray(params.orderedIds) ||
    params.orderedIds.some((itemId) => typeof itemId !== 'string' || !itemId)
  ) {
    throw new Error('orderedIds must contain valid stack item ids');
  }

  const existingItems = await db
    .select({ id: stackItems.id })
    .from(stackItems)
    .where(eq(stackItems.stackId, stack.id));
  const existingIds = existingItems.map((item) => item.id);
  const requestedIds = new Set(params.orderedIds);
  const existingIdSet = new Set(existingIds);

  if (
    params.orderedIds.length !== existingIds.length ||
    requestedIds.size !== params.orderedIds.length ||
    existingIdSet.size !== existingIds.length ||
    params.orderedIds.some((itemId) => !existingIdSet.has(itemId))
  ) {
    throw new Error('orderedIds must contain exactly the stack items');
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < params.orderedIds.length; index++) {
      const itemId = params.orderedIds[index]!;
      await tx
        .update(stackItems)
        .set({ orderIndex: index })
        .where(and(eq(stackItems.id, itemId), eq(stackItems.stackId, stack.id)));
    }
  });

  await revalidateStackPaths(stack, user);
  return { success: true };
}

export async function updateStackItemAnnotationAction(params: {
  stackId: string;
  itemId: string;
  annotation: string | null;
}): Promise<StackItemRow> {
  const user = await getAuthUser();
  const stack = await getOwnedStack(params.stackId, user.id);
  const [updated] = await db
    .update(stackItems)
    .set({ annotation: sanitizeOptionalText(params.annotation, MAX_STACK_TEXT_LENGTH) })
    .where(and(eq(stackItems.id, params.itemId), eq(stackItems.stackId, stack.id)))
    .returning();

  if (!updated) throw new Error('Stack item not found');

  await revalidateStackPaths(stack, user);
  return updated;
}

export async function updateStackAction(params: {
  stackId: string;
  title?: string;
  description?: string | null;
  isPublic?: boolean;
}): Promise<StackRow> {
  const user = await getAuthUser();
  const existing = await getOwnedStack(params.stackId, user.id);
  const updateData: Partial<typeof stacks.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (params.title !== undefined) {
    updateData.title = sanitizeStackTitle(params.title);
  }
  if (params.description !== undefined) {
    updateData.description = sanitizeOptionalText(params.description, MAX_STACK_TEXT_LENGTH);
  }
  if (params.isPublic !== undefined) {
    if (typeof params.isPublic !== 'boolean') {
      throw new Error('Invalid stack visibility');
    }
    updateData.isPublic = params.isPublic;
  }

  const [updated] = await db
    .update(stacks)
    .set(updateData)
    .where(and(eq(stacks.id, existing.id), eq(stacks.userId, user.id)))
    .returning();

  if (!updated) throw new Error('Stack not found');

  await revalidateStackPaths(updated, user, existing.isPublic || updated.isPublic);
  return updated;
}
