export type ThemeId = 'parchment' | 'midnight' | 'sepia' | 'e-ink' | 'cyber';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  theme: ThemeId;
  username: string | null;
  isPublic: boolean;
  bio: string | null;
  emailVerified?: boolean;
  verificationDismissedAt?: string | null;
}

export interface UpdateProfileInput {
  name?: string;
  username?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  image?: string | null;
}

export interface PublicUserSearchResult {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  image: string | null;
  theme: string;
  createdAt: Date;
  totalEntries: number;
}
