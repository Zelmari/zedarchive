'use server';

import { db } from '@/lib/db';
import { stacks, stackItems, mediaEntries, user as userTable } from '@/db/schema';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from './internal';
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
  const title = params.title.trim().slice(0, 200);
  if (!title) throw new Error('Stack title is required');

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
      description: params.description?.trim().slice(0, 2000) || null,
      isPublic: params.isPublic ?? true,
      updatedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new Error('Failed to create stack');
  }

  revalidatePath('/stacks');
  return {
    ...inserted,
    items: [],
  };
}

export async function deleteStackAction(stackId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();

  await db.delete(stacks).where(and(eq(stacks.id, stackId), eq(stacks.userId, user.id)));

  revalidatePath('/stacks');
  return { success: true };
}
