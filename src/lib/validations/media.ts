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

// ─── Create Schema ────────────────────────────────────────────────────────────

export const createMediaSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES).default('show'),
  status: z.enum(VALID_STATUSES).default('in_progress'),
  /** Per-title privacy flag — hides entry from public profile & feeds */
  isPrivate: z.boolean().default(false),
  dropReason: z.string().trim().max(MAX_DROP_REASON_LENGTH).nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: z.number().int().nullable().optional(),
  droppedProgressSecondary: z.number().int().nullable().optional(),
  /** For non-movie categories, minimum 1. For movies 0 is allowed. */
  primaryUnitCurrent: z.number().int().min(0).default(1),
  primaryUnitTotal: z.number().int().min(1).nullable().optional(),
  secondaryUnitCurrent: z.number().int().min(0).default(0),
  secondaryUnitTotal: z.number().int().min(1).nullable().optional(),
  structure: z.array(structureItemSchema).max(MAX_STRUCTURE_LENGTH).default([]),
  cycles: z.array(mediaCycleSchema).default([]),
  quotes: z.array(mediaQuoteSchema).default([]),
  rating: z.number().int().min(1).max(MAX_RATING).nullable().optional(),
  /** Max 50 tags to match the sanitizeTags() slice(0, 50) cap */
  tags: z.array(mediaTagSchema).max(50).default([]),
  genres: z.array(z.string().trim().max(50)).default([]),
  synopsis: z.string().max(MAX_SYNOPSIS_LENGTH).nullable().optional(),
  coverImage: z.string().max(MAX_COVER_IMAGE_LENGTH).nullable().optional(),
  sourceId: z.string().max(MAX_SOURCE_ID_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
  priorityIndex: z.number().int().min(1).nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

// ─── Update Schema ────────────────────────────────────────────────────────────

export const updateMediaSchema = createMediaSchema.partial().extend({
  /** Trigger a new rewatch / reread cycle */
  rewatch: z.boolean().optional(),
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
