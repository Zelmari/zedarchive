'use server';

import { db } from '@/lib/db';
import { stacks, stackItems, mediaEntries, user as userTable } from '@/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
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

export async function getMyStacks(): Promise<StackWithItems[]> {
  const user = await getAuthUser();

  const userStacks = await db
    .select()
    .from(stacks)
    .where(eq(stacks.userId, user.id))
    .orderBy(desc(stacks.updatedAt));

  const result: StackWithItems[] = [];

  for (const s of userStacks) {
    const rawItems = await db
      .select({
        item: stackItems,
        media: mediaEntries,
      })
      .from(stackItems)
      .leftJoin(mediaEntries, eq(stackItems.mediaId, mediaEntries.id))
      .where(eq(stackItems.stackId, s.id))
      .orderBy(asc(stackItems.orderIndex));

    result.push({
      ...s,
      items: rawItems.map((r) => ({
        id: r.item.id,
        mediaId: r.item.mediaId,
        orderIndex: r.item.orderIndex,
        annotation: r.item.annotation,
        media: r.media ? serializeEntry(r.media) : null,
      })),
    });
  }

  return result;
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

  const rawItems = await db
    .select({
      item: stackItems,
      media: mediaEntries,
    })
    .from(stackItems)
    .leftJoin(mediaEntries, eq(stackItems.mediaId, mediaEntries.id))
    .where(eq(stackItems.stackId, foundStack.id))
    .orderBy(asc(stackItems.orderIndex));

  const stack: StackWithItems = {
    ...foundStack,
    items: rawItems
      .filter((r) => r.media && !r.media.isPrivate)
      .map((r) => ({
        id: r.item.id,
        mediaId: r.item.mediaId,
        orderIndex: r.item.orderIndex,
        annotation: r.item.annotation,
        media: r.media ? serializeEntry(r.media) : null,
      })),
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

export async function addMediaToStackAction(params: {
  stackId: string;
  mediaId: string;
  annotation?: string | null;
}): Promise<{ success: boolean }> {
  const user = await getAuthUser();

  const [stack] = await db
    .select()
    .from(stacks)
    .where(and(eq(stacks.id, params.stackId), eq(stacks.userId, user.id)));

  if (!stack) throw new Error('Stack not found or access denied');

  const id = crypto.randomUUID();

  await db.insert(stackItems).values({
    id,
    stackId: params.stackId,
    mediaId: params.mediaId,
    orderIndex: 0,
    annotation: params.annotation?.trim().slice(0, 1000) || null,
  });

  revalidatePath('/stacks');
  return { success: true };
}

export async function deleteStackAction(stackId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();

  await db.delete(stacks).where(and(eq(stacks.id, stackId), eq(stacks.userId, user.id)));

  revalidatePath('/stacks');
  return { success: true };
}
