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
