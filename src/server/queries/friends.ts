import { db } from '@/lib/db';
import { friendships, user as userTable } from '@/db/schema';
import { eq, and, or, ilike, desc, isNotNull, ne } from 'drizzle-orm';
import type { FriendUserSummary, FriendshipItem } from '@/types/friends';

function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function getAcceptedFriends(userId: string): Promise<FriendshipItem[]> {
  // Fetch both directions separately to avoid complex conditional joins
  const sent = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      senderId: friendships.senderId,
      receiverId: friendships.receiverId,
      createdAt: friendships.createdAt,
      updatedAt: friendships.updatedAt,
      friendId: userTable.id,
      friendName: userTable.name,
      friendUsername: userTable.username,
      friendImage: userTable.image,
      friendBio: userTable.bio,
      friendTheme: userTable.theme,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.receiverId))
    .where(and(eq(friendships.senderId, userId), eq(friendships.status, 'accepted')))
    .orderBy(desc(friendships.updatedAt));

  const received = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      senderId: friendships.senderId,
      receiverId: friendships.receiverId,
      createdAt: friendships.createdAt,
      updatedAt: friendships.updatedAt,
      friendId: userTable.id,
      friendName: userTable.name,
      friendUsername: userTable.username,
      friendImage: userTable.image,
      friendBio: userTable.bio,
      friendTheme: userTable.theme,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.senderId))
    .where(and(eq(friendships.receiverId, userId), eq(friendships.status, 'accepted')))
    .orderBy(desc(friendships.updatedAt));

  const all = [...sent, ...received].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return all.map((r) => ({
    id: r.id,
    friend: {
      id: r.friendId,
      name: r.friendName,
      username: r.friendUsername,
      image: r.friendImage,
      bio: r.friendBio,
      theme: r.friendTheme || 'parchment',
    },
    status: r.status as any,
    isSender: r.senderId === userId,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export async function getIncomingFriendRequests(userId: string): Promise<FriendshipItem[]> {
  const rows = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      senderId: friendships.senderId,
      receiverId: friendships.receiverId,
      createdAt: friendships.createdAt,
      updatedAt: friendships.updatedAt,
      friendId: userTable.id,
      friendName: userTable.name,
      friendUsername: userTable.username,
      friendImage: userTable.image,
      friendBio: userTable.bio,
      friendTheme: userTable.theme,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.senderId))
    .where(and(eq(friendships.receiverId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));

  return rows.map((r) => ({
    id: r.id,
    friend: {
      id: r.friendId,
      name: r.friendName,
      username: r.friendUsername,
      image: r.friendImage,
      bio: r.friendBio,
      theme: r.friendTheme || 'parchment',
    },
    status: r.status as any,
    isSender: false,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export async function getOutgoingFriendRequests(userId: string): Promise<FriendshipItem[]> {
  const rows = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      senderId: friendships.senderId,
      receiverId: friendships.receiverId,
      createdAt: friendships.createdAt,
      updatedAt: friendships.updatedAt,
      friendId: userTable.id,
      friendName: userTable.name,
      friendUsername: userTable.username,
      friendImage: userTable.image,
      friendBio: userTable.bio,
      friendTheme: userTable.theme,
    })
    .from(friendships)
    .innerJoin(userTable, eq(userTable.id, friendships.receiverId))
    .where(and(eq(friendships.senderId, userId), eq(friendships.status, 'pending')))
    .orderBy(desc(friendships.createdAt));

  return rows.map((r) => ({
    id: r.id,
    friend: {
      id: r.friendId,
      name: r.friendName,
      username: r.friendUsername,
      image: r.friendImage,
      bio: r.friendBio,
      theme: r.friendTheme || 'parchment',
    },
    status: r.status as any,
    isSender: true,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export async function getFriendshipStatus(
  userAId: string,
  userBId: string,
): Promise<{ status: string | null; isSender: boolean | null; friendshipId: string | null }> {
  if (!userAId || !userBId || userAId === userBId)
    return { status: null, isSender: null, friendshipId: null };
  const [row] = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      senderId: friendships.senderId,
      receiverId: friendships.receiverId,
    })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.senderId, userAId), eq(friendships.receiverId, userBId)),
        and(eq(friendships.senderId, userBId), eq(friendships.receiverId, userAId)),
      ),
    )
    .limit(1);

  if (!row) return { status: null, isSender: null, friendshipId: null };
  return { status: row.status, isSender: row.senderId === userAId, friendshipId: row.id };
}

export async function searchUsersForFriendDiscovery(
  query: unknown,
  currentUserId: string,
  options?: { limit?: number },
): Promise<FriendUserSummary[]> {
  if (!query || typeof query !== 'string') return [];
  const clean = query.trim().toLowerCase().replace(/^@/, '').slice(0, 100);
  if (!clean) return [];
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);

  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      bio: userTable.bio,
      theme: userTable.theme,
    })
    .from(userTable)
    .where(
      and(
        ne(userTable.id, currentUserId),
        isNotNull(userTable.username),
        ne(userTable.username, ''),
        or(ilike(userTable.username, `%${clean}%`), ilike(userTable.name, `%${clean}%`)),
      ),
    )
    .orderBy(userTable.username)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    image: r.image,
    bio: r.bio,
    theme: r.theme || 'parchment',
  }));
}

export async function getFriendIds(userId: string): Promise<string[]> {
  const friends = await getAcceptedFriends(userId);
  return friends.map((f) => f.friend.id);
}
