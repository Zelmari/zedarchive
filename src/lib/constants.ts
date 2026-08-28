import type { ThemeId } from '@/types/user';

export const VALID_CATEGORIES = ['show', 'movie', 'book', 'anime', 'manga'] as const;
export const VALID_STATUSES = [
  'in_progress',
  'completed',
  'planning',
  'on_hold',
  'dropped',
] as const;
export const VALID_THEMES = ['parchment', 'midnight', 'sepia', 'e-ink', 'cyber'] as const;

export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_DROP_REASON_LENGTH = 500;
export const MAX_SYNOPSIS_LENGTH = 5000;
export const MAX_SOURCE_ID_LENGTH = 200;
export const MAX_COVER_IMAGE_LENGTH = 2_000_000;
export const MAX_STRUCTURE_LENGTH = 500;
export const MAX_RATING = 10;
export const MAX_QUERY_LENGTH = 100;

export const PRESET_DROP_REASONS = [
  'Lost interest / Bored',
  'Poor pacing / Plot decline',
  'Disliked characters',
  'Not for me / Tone shift',
  'Adapted poorly from source',
  'Will revisit in the future',
] as const;

export const MAX_USERNAME_LENGTH = 30;
export const MAX_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 500;

export const MAX_COMMENT_LENGTH = 500;
export const COMMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // exactly 7 days
export const COMMENT_RATE_LIMIT = 5; // max comments per window
export const COMMENT_RATE_WINDOW_MS = 60 * 1000;

export const ACTIVITY_LOG_FETCH_LIMIT = 50;

export const HANDLE_SANITIZE_PATTERN = /[^a-z0-9_-]/g;

export const RESERVED_HANDLES = [
  'search',
  'explore',
  'dashboard',
  'settings',
  'wrapped',
  'login',
  'signup',
  'api',
  'admin',
  'u',
  'offline',
  'verified',
  'reset-password',
] as const;

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  label: string;
  description: string;
  bg: string;
  fg: string;
  text: string;
  border: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'parchment',
    name: 'Parchment (Default)',
    label: 'Parchment',
    description: 'Warm linen paper, charcoal ink, subtle slate borders.',
    bg: '#f7f5f0',
    fg: '#242321',
    text: '#242321',
    border: '#85837c',
  },
  {
    id: 'midnight',
    name: 'Midnight Slate',
    label: 'Midnight Slate',
    description: 'Deep obsidian and graphite dark slate with crisp white text.',
    bg: '#121316',
    fg: '#ededed',
    text: '#ededed',
    border: '#4b5563',
  },
  {
    id: 'sepia',
    name: 'Vintage Sepia',
    label: 'Vintage Sepia',
    description: 'Warm amber tones, aged book paper, and terracotta accents.',
    bg: '#f4ebd9',
    fg: '#382b1d',
    text: '#382b1d',
    border: '#9c8369',
  },
  {
    id: 'e-ink',
    name: 'E-Ink Monochrome',
    label: 'E-Ink',
    description: 'High-contrast pure black and white mimicking physical e-readers.',
    bg: '#ffffff',
    fg: '#000000',
    text: '#000000',
    border: '#000000',
  },
  {
    id: 'cyber',
    name: 'Phosphor Cyber',
    label: 'Phosphor Cyber',
    description: 'Retro terminal dark mode with glowing green CRT phosphor text.',
    bg: '#090e09',
    fg: '#22c55e',
    text: '#22c55e',
    border: '#15803d',
  },
];

export const THEME_LABELS: Record<ThemeId, string> = {
  parchment: 'Parchment',
  midnight: 'Midnight Slate',
  sepia: 'Vintage Sepia',
  'e-ink': 'E-Ink',
  cyber: 'Phosphor Cyber',
};

export const STREAMING_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'IN', name: 'India' },
  { code: 'KR', name: 'South Korea' },
] as const;
