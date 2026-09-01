import { db } from '@/lib/db';
import { groups, groupMembers, groupMessages, user as userTable, friendships } from '@/db/schema';
import { eq, and, desc, gt, lte, inArray, notInArray, or, count } from 'drizzle-orm';
import type { GroupDetails, GroupSummary, GroupMessageItem } from '@/types/groups';

function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function isGroupOwner(groupId: string, userId: string): Promise<boolean> {
  const [g] = await db
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!g) return false;
  return g.ownerId === userId;
}

export async function getUserGroups(userId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      groupId: groups.id,
      name: groups.name,
      description: groups.description,
      image: groups.image,
      ownerId: groups.ownerId,
      createdAt: groups.createdAt,
      updatedAt: groups.updatedAt,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(groups.updatedAt));

  // Get member counts for all user groups in a single query
  const groupIds = rows.map((r) => r.groupId);
  if (groupIds.length === 0) return [];

  const memberCounts = await db
    .select({
      groupId: groupMembers.groupId,
      value: count(),
    })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groupIds))
    .groupBy(groupMembers.groupId);

  const countMap = new Map(memberCounts.map((c) => [c.groupId, Number(c.value)]));

  return rows.map((r) => ({
    id: r.groupId,
    name: r.name,
    description: r.description,
    image: r.image,
    ownerId: r.ownerId,
    memberCount: countMap.get(r.groupId) ?? 0,
    role: r.role as any,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export async function getGroupDetails(
  groupId: string,
  viewerUserId: string,
): Promise<GroupDetails | null> {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!g) return null;

  const memberRows = await db
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
    })
    .from(groupMembers)
    .innerJoin(userTable, eq(userTable.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);

  const viewer = memberRows.find((m) => m.userId === viewerUserId);
  const isMember = Boolean(viewer);
  const isOwner = g.ownerId === viewerUserId;

  // Guard: if not member, return minimal but still indicate not member? Caller checks isMember.
  // We still return details but isMember false; UI can show 403.
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    image: g.image,
    ownerId: g.ownerId,
    isOwner,
    isMember,
    memberCount: memberRows.length,
    members: memberRows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      username: m.username,
      image: m.image,
      role: m.role as any,
      joinedAt: toIso(m.joinedAt),
    })),
    createdAt: toIso(g.createdAt),
    updatedAt: toIso(g.updatedAt),
  };
}

export async function getGroupMessages(
  groupId: string,
  viewerUserId: string,
): Promise<GroupMessageItem[]> {
  const member = await isGroupMember(groupId, viewerUserId);
  if (!member) throw new Error('You are not a member of this group');

  const now = new Date();
  // Lazy purge expired for this group
  await db
    .delete(groupMessages)
    .where(and(eq(groupMessages.groupId, groupId), lte(groupMessages.expiresAt, now)));

  const rows = await db
    .select({
      id: groupMessages.id,
      groupId: groupMessages.groupId,
      senderId: groupMessages.senderId,
      body: groupMessages.body,
      createdAt: groupMessages.createdAt,
      expiresAt: groupMessages.expiresAt,
      senderName: userTable.name,
      senderUsername: userTable.username,
      senderImage: userTable.image,
    })
    .from(groupMessages)
    .innerJoin(userTable, eq(userTable.id, groupMessages.senderId))
    .where(and(eq(groupMessages.groupId, groupId), gt(groupMessages.expiresAt, now)))
    .orderBy(groupMessages.createdAt)
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    senderId: r.senderId,
    senderName: r.senderName,
    senderUsername: r.senderUsername,
    senderImage: r.senderImage,
    body: r.body,
    createdAt: toIso(r.createdAt),
    expiresAt: toIso(r.expiresAt),
    isOwn: r.senderId === viewerUserId,
  }));
}

export async function getEligibleFriendsToInvite(
  groupId: string,
  ownerId: string,
): Promise<{ id: string; name: string; username: string | null; image: string | null }[]> {
  // Owner's accepted friends not yet in group
  const existingMemberIds = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  const excluded = new Set(existingMemberIds.map((r) => r.userId));
  excluded.add(ownerId);

  // Get accepted friends of owner (both directions)
  const sentFriends = await db
    .select({
      friendId: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.receiverId))
    .where(and(eq(friendships.senderId, ownerId), eq(friendships.status, 'accepted')));

  const receivedFriends = await db
    .select({
      friendId: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.senderId))
    .where(and(eq(friendships.receiverId, ownerId), eq(friendships.status, 'accepted')));

  const all = [...sentFriends, ...receivedFriends];
  return all
    .filter((f) => !excluded.has(f.friendId))
    .map((f) => ({ id: f.friendId, name: f.name, username: f.username, image: f.image }));
}
