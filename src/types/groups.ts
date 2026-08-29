export type GroupRole = 'owner' | 'member';

export interface GroupMemberSummary {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  role: GroupRole;
  joinedAt: string;
}

export interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  isOwner: boolean;
  isMember: boolean;
  memberCount: number;
  members: GroupMemberSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  memberCount: number;
  role: GroupRole;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMessageItem {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderUsername: string | null;
  senderImage: string | null;
  body: string;
  createdAt: string;
  expiresAt: string;
  isOwn: boolean;
}
