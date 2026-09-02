import type { CustomThemePalette, ThemeId } from '@/types/user';

export const VALID_CATEGORIES = ['show', 'movie', 'book', 'anime', 'manga'] as const;
export const VALID_STATUSES = [
  'in_progress',
  'completed',
  'planning',
  'on_hold',
  'dropped',
] as const;
export const STATUS_OPTIONS = [
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'planning', label: 'Planning' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'dropped', label: 'Dropped' },
] as const;
export const VALID_THEMES = ['parchment', 'midnight', 'sepia', 'e-ink', 'cyber', 'custom'] as const;

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

export const GROUP_MESSAGE_MAX_LENGTH = 2000;
export const GROUP_MESSAGE_RATE_LIMIT = 10;
export const GROUP_MESSAGE_WINDOW_MS = 60_000;
export const FRIEND_REQUEST_RATE_LIMIT = 20;
export const FRIEND_REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
  'friends',
  'groups',
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
    description: 'Warm linen paper, ivory bookplates, burgundy ribbon, and gold leaf.',
    bg: '#f7f4ee',
    fg: '#201e1b',
    text: '#201e1b',
    border: '#b5ac98',
  },
  {
    id: 'midnight',
    name: 'Midnight Slate',
    label: 'Midnight Slate',
    description: 'Dark slate, burgundy ribbon, and warm gold leaf with quiet contrast.',
    bg: '#121316',
    fg: '#ecebe8',
    text: '#ecebe8',
    border: '#52596b',
  },
  {
    id: 'sepia',
    name: 'Vintage Sepia',
    label: 'Vintage Sepia',
    description: 'Aged book paper with terracotta ribbon, botanical ink, and gold leaf.',
    bg: '#f2e8d6',
    fg: '#3a2a1a',
    text: '#3a2a1a',
    border: '#b19b7c',
  },
  {
    id: 'e-ink',
    name: 'E-Ink Monochrome',
    label: 'E-Ink',
    description: 'Pure black and white with one-pixel rules for a physical e-reader feel.',
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
  custom: 'Custom Palette',
};

export const CUSTOM_THEME_PRESETS: CustomThemePalette[] = [
  {
    name: 'Nordic Sage',
    canvas: '#1a211e',
    surface: '#222b27',
    surfaceSubtle: '#161c19',
    text: '#e3ece7',
    textMuted: '#8b9f95',
    borderRequired: '#44584e',
    borderDecorative: '#2d3b34',
    accent: '#52b788',
    onAccent: '#ffffff',
  },
  {
    name: 'Rosewater Linen',
    canvas: '#faf4f2',
    surface: '#ffffff',
    surfaceSubtle: '#f5ebe6',
    text: '#3c2a29',
    textMuted: '#8a7170',
    borderRequired: '#d3b2af',
    borderDecorative: '#e8d4d1',
    accent: '#c05c5c',
    onAccent: '#ffffff',
  },
  {
    name: 'Solarized Sand',
    canvas: '#fdf6e3',
    surface: '#eee8d5',
    surfaceSubtle: '#e4dcbe',
    text: '#586e75',
    textMuted: '#839496',
    borderRequired: '#93a1a1',
    borderDecorative: '#cb4b16',
    accent: '#b58900',
    onAccent: '#ffffff',
  },
  {
    name: 'Dracula Obsidian',
    canvas: '#21222c',
    surface: '#282a36',
    surfaceSubtle: '#191a21',
    text: '#f8f8f2',
    textMuted: '#6272a4',
    borderRequired: '#44475a',
    borderDecorative: '#343746',
    accent: '#bd93f9',
    onAccent: '#282a36',
  },
];

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
