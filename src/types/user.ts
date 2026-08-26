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
