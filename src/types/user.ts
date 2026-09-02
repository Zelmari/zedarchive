export type ThemeId = 'parchment' | 'midnight' | 'sepia' | 'e-ink' | 'cyber' | 'custom';

export interface CustomThemePalette {
  name: string;
  canvas: string;
  surface: string;
  surfaceSubtle: string;
  text: string;
  textMuted: string;
  borderRequired: string;
  borderDecorative: string;
  accent: string;
  onAccent: string;
}

export interface ReadingGoalConfig {
  year: number;
  annualTarget: number;
  monthlyTarget?: number | null;
  isPublic?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  theme: ThemeId;
  customTheme?: CustomThemePalette | null;
  username: string | null;
  isPublic: boolean;
  bio: string | null;
  countryCode: string;
  readingGoals?: Record<string, ReadingGoalConfig> | null;
  emailVerified?: boolean;
  verificationDismissedAt?: string | null;
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
