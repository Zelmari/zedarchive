export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendUserSummary {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  bio: string | null;
  theme: string;
}

export interface FriendshipItem {
  id: string;
  friend: FriendUserSummary;
  status: FriendshipStatus;
  isSender: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingRequestItem {
  id: string;
  otherUser: FriendUserSummary;
  status: FriendshipStatus;
  isSender: boolean;
  createdAt: string;
  updatedAt: string;
}
