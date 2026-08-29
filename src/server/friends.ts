'use server';

import { db } from '@/lib/db';
import { friendships, user as userTable } from '@/db/schema';
import { eq, and, or, count, gt } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { FRIEND_REQUEST_RATE_LIMIT, FRIEND_REQUEST_WINDOW_MS } from '@/lib/constants';
import { sendFriendRequestSchema } from '@/lib/validations/friend';
import { getAuthUser } from './internal';

export async function sendFriendRequestAction(input: { targetUserId: string }) {
  const me = await getAuthUser();
  const parsed = sendFriendRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid input');
  const targetUserId = parsed.data.targetUserId;

  if (targetUserId === me.id) throw new Error('You cannot add yourself as a friend');

  const [target] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, targetUserId));
  if (!target) throw new Error('User not found');

  // Rate limit: max FRIEND_REQUEST_RATE_LIMIT per hour
  const windowStart = new Date(Date.now() - FRIEND_REQUEST_WINDOW_MS);
  const [rateRow] = await db
    .select({ value: count() })
    .from(friendships)
    .where(and(eq(friendships.senderId, me.id), gt(friendships.createdAt, windowStart)));
  if (Number(rateRow?.value ?? 0) >= FRIEND_REQUEST_RATE_LIMIT) {
    throw new Error('You are sending too many friend requests. Try again later');
  }

  // Check existing friendship in either direction
  const [existing] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.senderId, me.id), eq(friendships.receiverId, targetUserId)),
        and(eq(friendships.senderId, targetUserId), eq(friendships.receiverId, me.id)),
      ),
    )
    .limit(1);
  if (existing) throw new Error('Friend request already exists or you are already friends');

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(friendships).values({
    id,
    senderId: me.id,
    receiverId: targetUserId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath('/friends');
  return { id, status: 'pending' };
}

export async function acceptFriendRequestAction(input: { requestId: string }) {
  const me = await getAuthUser();
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('Request ID is required');

  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row) throw new Error('Friend request not found');
  if (row.receiverId !== me.id) throw new Error('You can only accept requests sent to you');
  if (row.status !== 'pending') throw new Error('Request is not pending');

  await db
    .update(friendships)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(friendships.id, requestId));
  revalidatePath('/friends');
  return { success: true };
}

export async function rejectFriendRequestAction(input: { requestId: string }) {
  const me = await getAuthUser();
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('Request ID is required');
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row) throw new Error('Friend request not found');
  if (row.receiverId !== me.id) throw new Error('You can only reject requests sent to you');
  if (row.status !== 'pending') throw new Error('Request is not pending');
  await db.delete(friendships).where(eq(friendships.id, requestId));
  revalidatePath('/friends');
  return { success: true };
}

export async function cancelFriendRequestAction(input: { requestId: string }) {
  const me = await getAuthUser();
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('Request ID is required');
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row) throw new Error('Friend request not found');
  if (row.senderId !== me.id) throw new Error('You can only cancel requests you sent');
  if (row.status !== 'pending') throw new Error('Request is not pending');
  await db.delete(friendships).where(eq(friendships.id, requestId));
  revalidatePath('/friends');
  return { success: true };
}

export async function removeFriendAction(input: { friendUserId: string }) {
  const me = await getAuthUser();
  const friendUserId = String(input.friendUserId || '').trim();
  if (!friendUserId) throw new Error('Friend user ID is required');
  if (friendUserId === me.id) throw new Error('Invalid friend');

  const [row] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(
          and(eq(friendships.senderId, me.id), eq(friendships.receiverId, friendUserId)),
          and(eq(friendships.senderId, friendUserId), eq(friendships.receiverId, me.id)),
        ),
      ),
    )
    .limit(1);
  if (!row) throw new Error('Friendship not found');
  await db.delete(friendships).where(eq(friendships.id, row.id));
  revalidatePath('/friends');
  return { success: true };
}
