import { z } from 'zod';
import {
  VALID_CATEGORIES,
  VALID_STATUSES,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_DROP_REASON_LENGTH,
  MAX_SOURCE_ID_LENGTH,
  MAX_COVER_IMAGE_LENGTH,
  MAX_STRUCTURE_LENGTH,
  MAX_RATING,
  MAX_SYNOPSIS_LENGTH,
} from '@/lib/constants';

// ─── Primitive Schemas ────────────────────────────────────────────────────────

/**
 * Tag schema: trims, lowercases, validates character set.
 * Cap is 50 to match the sanitizeTags() runtime cap in server/media.ts.
 */
export const mediaTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_\-#]+$/, 'Tags may only contain letters, numbers, hyphens, and underscores');

export const structureItemSchema = z.object({
  number: z.number().int().min(1),
  name: z.string().trim().max(100),
  total: z.number().int().min(1).nullable().optional(),
});

export const mediaCycleSchema = z.object({
  /** UUID — generated server-side if missing */
  id: z.string().uuid().optional(),
  cycleNumber: z.number().int().min(1).optional(),
  /**
   * ISO 8601 datetime strings (with offset) or loose strings accepted for
   * backward-compatibility. The server sanitizer normalises to real Date objects.
   */
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(MAX_RATING).nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
});

export const mediaQuoteSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().min(1).max(2000),
  speaker: z.string().max(100).nullable().optional(),
  citation: z.string().max(100).nullable().optional(),
  isFavorite: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
});

export const mediaRatingSchema = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseInt(String(val), 10);
  if (isNaN(parsed)) return null;
  return Math.min(MAX_RATING, Math.max(1, parsed));
}, z.number().int().min(1).max(MAX_RATING).nullable().optional());

export const optionalInt = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : Math.floor(num);
}, z.number().int().nullable().optional());

export const nonNegativeInt = (defaultValue = 0) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return defaultValue;
    const num = Number(val);
    return isNaN(num) ? defaultValue : Math.max(0, Math.floor(num));
  }, z.number().int().min(0).default(defaultValue));

// ─── Base Field Schemas (without creation defaults) ───────────────────────────

export const mediaFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES),
  status: z.enum(VALID_STATUSES),
  /** Per-title privacy flag — hides entry from public profile & feeds */
  isPrivate: z.boolean(),
  dropReason: z.string().trim().max(MAX_DROP_REASON_LENGTH).nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: optionalInt,
  droppedProgressSecondary: optionalInt,
  /** For non-movie categories, minimum 1. For movies 0 is allowed. */
  primaryUnitCurrent: optionalInt,
  primaryUnitTotal: optionalInt,
  secondaryUnitCurrent: optionalInt,
  secondaryUnitTotal: optionalInt,
  structure: z.array(structureItemSchema).max(MAX_STRUCTURE_LENGTH),
  cycles: z.array(mediaCycleSchema),
  quotes: z.array(mediaQuoteSchema),
  rating: mediaRatingSchema,
  /** Max 50 tags to match the sanitizeTags() slice(0, 50) cap */
  tags: z.array(mediaTagSchema).max(50),
  genres: z.array(z.string().trim().max(50)),
  synopsis: z.string().max(MAX_SYNOPSIS_LENGTH).nullable().optional(),
  coverImage: z.string().max(MAX_COVER_IMAGE_LENGTH).nullable().optional(),
  sourceId: z.string().max(MAX_SOURCE_ID_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
  priorityIndex: optionalInt,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

// ─── Create Schema ────────────────────────────────────────────────────────────

export const createMediaSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES).default('show'),
  status: z.enum(VALID_STATUSES).default('in_progress'),
  /** Per-title privacy flag — hides entry from public profile & feeds */
  isPrivate: z.boolean().default(false),
  dropReason: z.string().trim().max(MAX_DROP_REASON_LENGTH).nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: optionalInt,
  droppedProgressSecondary: optionalInt,
  /** For non-movie categories, minimum 1. For movies 0 is allowed. */
  primaryUnitCurrent: nonNegativeInt(1),
  primaryUnitTotal: optionalInt,
  secondaryUnitCurrent: nonNegativeInt(0),
  secondaryUnitTotal: optionalInt,
  structure: z.array(structureItemSchema).max(MAX_STRUCTURE_LENGTH).default([]),
  cycles: z.array(mediaCycleSchema).default([]),
  quotes: z.array(mediaQuoteSchema).default([]),
  rating: mediaRatingSchema,
  /** Max 50 tags to match the sanitizeTags() slice(0, 50) cap */
  tags: z.array(mediaTagSchema).max(50).default([]),
  genres: z.array(z.string().trim().max(50)).default([]),
  synopsis: z.string().max(MAX_SYNOPSIS_LENGTH).nullable().optional(),
  coverImage: z.string().max(MAX_COVER_IMAGE_LENGTH).nullable().optional(),
  sourceId: z.string().max(MAX_SOURCE_ID_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
  priorityIndex: optionalInt,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

// ─── Update Schema ────────────────────────────────────────────────────────────

export const updateMediaSchema = mediaFieldsSchema.partial().extend({
  /** Trigger a new rewatch / reread cycle */
  rewatch: z.boolean().optional(),
  _offlineUpdatedAt: z.string().optional(),
  groupId: z.string().nullable().optional(),
});

// ─── Bulk Import ──────────────────────────────────────────────────────────────

export const bulkImportItemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES).optional(),
  status: z.string().optional(),
  dropReason: z.string().nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: z.number().nullable().optional(),
  droppedProgressSecondary: z.number().nullable().optional(),
  cycles: z.array(mediaCycleSchema).optional(),
  priorityIndex: z.number().int().nullable().optional(),
  primaryUnitCurrent: z.number().optional(),
  primaryUnitTotal: z.number().nullable().optional(),
  secondaryUnitCurrent: z.number().optional(),
  secondaryUnitTotal: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  structure: z.array(z.any()).optional(),
  sourceId: z.string().nullable().optional(),
  coverImage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

export const bulkImportSchema = z.array(bulkImportItemSchema).max(1000);
