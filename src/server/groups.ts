'use server';

import { db } from '@/lib/db';
import {
  groups,
  groupMembers,
  groupMessages,
  friendships,
  user as userTable,
  mediaEntries,
} from '@/db/schema';
import { eq, and, count, gt, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  COMMENT_TTL_MS,
  GROUP_MESSAGE_MAX_LENGTH,
  GROUP_MESSAGE_RATE_LIMIT,
  GROUP_MESSAGE_WINDOW_MS,
  MAX_COVER_IMAGE_LENGTH,
} from '@/lib/constants';
import {
  createGroupSchema,
  updateGroupSchema,
  sendGroupMessageSchema,
  transferGroupOwnershipSchema,
} from '@/lib/validations/group';
import { getAuthUser } from './internal';
import { isGroupMember, isGroupOwner } from './queries/groups';

export async function createGroupAction(input: Record<string, unknown>) {
  const me = await getAuthUser();
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid input');
  const { name, description, image, memberUserIds } = parsed.data;

  if (image && image.length > MAX_COVER_IMAGE_LENGTH) throw new Error('Image too large');
  if (image && !(/^https:\/\//i.test(image) || /^data:image\//i.test(image))) {
    throw new Error('Image must be https:// or data:image/');
  }

  // Validate memberUserIds are all friends of owner
  const uniqueIds = [...new Set(memberUserIds.filter((id) => id !== me.id))];

  if (uniqueIds.length > 0) {
    // Fetch accepted friends of me
    const sent = await db
      .select({ id: friendships.receiverId })
      .from(friendships)
      .where(and(eq(friendships.senderId, me.id), eq(friendships.status, 'accepted')));
    const received = await db
      .select({ id: friendships.senderId })
      .from(friendships)
      .where(and(eq(friendships.receiverId, me.id), eq(friendships.status, 'accepted')));
    const friendIds = new Set([...sent.map((r) => r.id), ...received.map((r) => r.id)]);
    for (const uid of uniqueIds) {
      if (!friendIds.has(uid)) throw new Error(`User ${uid} is not your friend`);
      const [u] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.id, uid));
      if (!u) throw new Error(`User ${uid} not found`);
    }
  }

  const groupId = crypto.randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: groupId,
      name: name.trim(),
      description: description?.trim() || null,
      image: image || null,
      ownerId: me.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(groupMembers).values({
      id: crypto.randomUUID(),
      groupId,
      userId: me.id,
      role: 'owner',
      joinedAt: now,
    });
    for (const uid of uniqueIds) {
      await tx.insert(groupMembers).values({
        id: crypto.randomUUID(),
        groupId,
        userId: uid,
        role: 'member',
        joinedAt: now,
      });
    }
  });

  revalidatePath('/groups');
  return { id: groupId };
}

export async function updateGroupAction(input: Record<string, unknown>) {
  const me = await getAuthUser();
  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid input');
  const { groupId, name, description, image } = parsed.data;

  const owner = await isGroupOwner(groupId, me.id);
  if (!owner) throw new Error('Only the owner can update the group');

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) update.name = name.trim();
  if (description !== undefined) update.description = description?.trim() || null;
  if (image !== undefined) update.image = image || null;

  await db
    .update(groups)
    .set(update as any)
    .where(eq(groups.id, groupId));
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true };
}

export async function addGroupMembersAction(input: { groupId: string; userIds: string[] }) {
  const me = await getAuthUser();
  const groupId = String(input.groupId || '').trim();
  const userIds = Array.isArray(input.userIds) ? input.userIds : [];
  if (!groupId) throw new Error('Group ID is required');
  if (userIds.length === 0) throw new Error('No users to add');

  const owner = await isGroupOwner(groupId, me.id);
  if (!owner) throw new Error('Only the owner can add members');

  // Validate each is friend of owner and not already member
  const sent = await db
    .select({ id: friendships.receiverId })
    .from(friendships)
    .where(and(eq(friendships.senderId, me.id), eq(friendships.status, 'accepted')));
  const received = await db
    .select({ id: friendships.senderId })
    .from(friendships)
    .where(and(eq(friendships.receiverId, me.id), eq(friendships.status, 'accepted')));
  const friendSet = new Set([...sent.map((r) => r.id), ...received.map((r) => r.id)]);

  for (const uid of userIds) {
    if (uid === me.id) continue;
    if (!friendSet.has(uid)) throw new Error(`User ${uid} is not your friend`);
    const [exists] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, uid)))
      .limit(1);
    if (exists) throw new Error(`User ${uid} is already a member`);
  }

  const now = new Date();
  for (const uid of userIds) {
    if (uid === me.id) continue;
    await db.insert(groupMembers).values({
      id: crypto.randomUUID(),
      groupId,
      userId: uid,
      role: 'member',
      joinedAt: now,
    });
  }

  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function kickGroupMemberAction(input: { groupId: string; memberUserId: string }) {
  const me = await getAuthUser();
  const groupId = String(input.groupId || '').trim();
  const memberUserId = String(input.memberUserId || '').trim();
  if (!groupId || !memberUserId) throw new Error('Missing parameters');
  if (memberUserId === me.id) throw new Error('You cannot kick yourself. Use leave instead');

  const owner = await isGroupOwner(groupId, me.id);
  if (!owner) throw new Error('Only the owner can kick members');

  const [member] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberUserId)))
    .limit(1);
  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot kick the owner');

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberUserId)));
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function transferGroupOwnershipAction(input: {
  groupId: string;
  newOwnerUserId: string;
}) {
  const me = await getAuthUser();
  const parsed = transferGroupOwnershipSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid input');
  const { groupId, newOwnerUserId } = parsed.data;

  if (newOwnerUserId === me.id) throw new Error('You are already the owner');

  const owner = await isGroupOwner(groupId, me.id);
  if (!owner) throw new Error('Only the owner can transfer ownership');

  const [targetMember] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, newOwnerUserId)))
    .limit(1);
  if (!targetMember) throw new Error('Target must be a current member');

  await db.transaction(async (tx) => {
    await tx
      .update(groups)
      .set({ ownerId: newOwnerUserId, updatedAt: new Date() })
      .where(eq(groups.id, groupId));
    await tx
      .update(groupMembers)
      .set({ role: 'member' })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me.id)));
    await tx
      .update(groupMembers)
      .set({ role: 'owner' })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, newOwnerUserId)));
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true };
}

export async function leaveGroupAction(input: { groupId: string }) {
  const me = await getAuthUser();
  const groupId = String(input.groupId || '').trim();
  if (!groupId) throw new Error('Group ID is required');

  const member = await isGroupMember(groupId, me.id);
  if (!member) throw new Error('You are not a member of this group');
  const owner = await isGroupOwner(groupId, me.id);
  if (owner) throw new Error('Owner cannot leave. Transfer ownership or delete the group');

  await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me.id)));
  revalidatePath('/groups');
  return { success: true };
}

export async function deleteGroupAction(input: { groupId: string }) {
  const me = await getAuthUser();
  const groupId = String(input.groupId || '').trim();
  if (!groupId) throw new Error('Group ID is required');
  const owner = await isGroupOwner(groupId, me.id);
  if (!owner) throw new Error('Only the owner can delete the group');
  await db.delete(groups).where(eq(groups.id, groupId));
  revalidatePath('/groups');
  return { success: true };
}

export async function sendGroupMessageAction(input: { groupId: string; body: string }) {
  const me = await getAuthUser();
  const parsed = sendGroupMessageSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid input');
  const { groupId, body } = parsed.data;

  const member = await isGroupMember(groupId, me.id);
  if (!member) throw new Error('You are not a member of this group');

  if (body.length > GROUP_MESSAGE_MAX_LENGTH) throw new Error('Message too long');

  // Rate limit
  const windowStart = new Date(Date.now() - GROUP_MESSAGE_WINDOW_MS);
  const [rateRow] = await db
    .select({ value: count() })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.senderId, me.id),
        gt(groupMessages.createdAt, windowStart),
        eq(groupMessages.groupId, groupId),
      ),
    );
  // Actually global per user per window, not per group filter? Plan says 10 per 60s. Use group filter optional, but we will allow per group.
  // If we filter by group, limit is per group; spec says general rate limit. We check without group filter for broader, but keep group filter for simplicity.
  // Re-check global:
  const [globalRate] = await db
    .select({ value: count() })
    .from(groupMessages)
    .where(and(eq(groupMessages.senderId, me.id), gt(groupMessages.createdAt, windowStart)));
  if (Number(globalRate?.value ?? 0) >= GROUP_MESSAGE_RATE_LIMIT) {
    throw new Error('You are sending messages too fast. Try again in a minute');
  }

  const now = new Date();
  // Lazy purge before insert
  await db
    .delete(groupMessages)
    .where(and(eq(groupMessages.groupId, groupId), lte(groupMessages.expiresAt, now)));

  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + COMMENT_TTL_MS);

  const [inserted] = await db
    .insert(groupMessages)
    .values({
      id,
      groupId,
      senderId: me.id,
      body,
      createdAt: now,
      expiresAt,
    })
    .returning();

  if (!inserted) throw new Error('Failed to create message');

  revalidatePath(`/groups/${groupId}`);

  // Return serialized for optimistic update
  const [sender] = await db
    .select({ name: userTable.name, username: userTable.username, image: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, me.id))
    .limit(1);
  return {
    id: inserted!.id,
    groupId: inserted!.groupId,
    senderId: inserted!.senderId,
    senderName: sender?.name || 'You',
    senderUsername: sender?.username || null,
    senderImage: sender?.image || null,
    body: inserted!.body,
    createdAt:
      inserted!.createdAt instanceof Date
        ? inserted!.createdAt.toISOString()
        : String(inserted!.createdAt),
    expiresAt:
      inserted!.expiresAt instanceof Date
        ? inserted!.expiresAt.toISOString()
        : String(inserted!.expiresAt),
    isOwn: true,
  };
}

export async function deleteGroupMessageAction(input: { messageId: string }) {
  const me = await getAuthUser();
  const messageId = String((input as any)?.messageId || (input as any)?.id || '').trim();
  if (!messageId) throw new Error('Message ID is required');
  const [msg] = await db
    .select()
    .from(groupMessages)
    .where(eq(groupMessages.id, messageId))
    .limit(1);
  if (!msg) throw new Error('Message not found');
  const owner = await isGroupOwner(msg.groupId, me.id);
  const isAuthor = msg.senderId === me.id;
  if (!isAuthor && !owner) throw new Error('You can only delete your own messages');
  await db.delete(groupMessages).where(eq(groupMessages.id, messageId));
  revalidatePath(`/groups/${msg.groupId}`);
  return { success: true };
}
