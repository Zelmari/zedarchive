export type CommentActionType =
  | 'progress_update'
  | 'status_change'
  | 'created'
  | 'completed'
  | 'rating'
  | 'rewatch';

export interface ProfileComment {
  id: string;
  profileUserId: string;
  authorId: string;
  authorUsername: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  mediaId: string;
  actionType: CommentActionType;
  details: Record<string, unknown>;
  createdAt: string;
}
