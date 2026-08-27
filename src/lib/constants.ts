export const VALID_CATEGORIES = ['show', 'book', 'anime', 'manga'];
export const VALID_STATUSES = ['in_progress', 'completed', 'planning', 'on_hold', 'dropped'];
export const VALID_THEMES = ['parchment', 'midnight', 'sepia', 'e-ink', 'cyber'];

export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_SYNOPSIS_LENGTH = 5000;
export const MAX_SOURCE_ID_LENGTH = 200;
export const MAX_COVER_IMAGE_LENGTH = 2_000_000;
export const MAX_STRUCTURE_LENGTH = 500;
export const MAX_RATING = 10;

export const MAX_USERNAME_LENGTH = 30;
export const MAX_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 500;

export const MAX_COMMENT_LENGTH = 500;
export const COMMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // exactly 7 days
export const COMMENT_RATE_LIMIT = 5; // max comments per window
export const COMMENT_RATE_WINDOW_MS = 60 * 1000;

export const ACTIVITY_LOG_FETCH_LIMIT = 50;

export const HANDLE_SANITIZE_PATTERN = /[^a-z0-9_-]/g;
