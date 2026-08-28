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
} from '@/lib/constants';

export const structureItemSchema = z.object({
  number: z.number().int().min(1),
  name: z.string().trim().max(100),
  total: z.number().int().min(1).nullable().optional(),
});

export const createMediaSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES).default('show'),
  status: z.enum(VALID_STATUSES).default('in_progress'),
  dropReason: z.string().trim().max(MAX_DROP_REASON_LENGTH).nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: z.number().int().nullable().optional(),
  droppedProgressSecondary: z.number().int().nullable().optional(),
  primaryUnitCurrent: z.number().int().min(1).default(1),
  primaryUnitTotal: z.number().int().min(1).nullable().optional(),
  secondaryUnitCurrent: z.number().int().min(0).default(0),
  secondaryUnitTotal: z.number().int().min(1).nullable().optional(),
  rating: z.number().min(1).max(MAX_RATING).nullable().optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  genres: z.array(z.string().trim().min(1).max(50)).default([]),
  structure: z.array(structureItemSchema).max(MAX_STRUCTURE_LENGTH).default([]),
  sourceId: z.string().max(MAX_SOURCE_ID_LENGTH).nullable().optional(),
  coverImage: z.string().max(MAX_COVER_IMAGE_LENGTH).nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

export const updateMediaSchema = createMediaSchema.partial().extend({
  rewatch: z.boolean().optional(),
});

export const bulkImportItemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_TITLE_LENGTH),
  category: z.enum(VALID_CATEGORIES).optional(),
  status: z.string().optional(),
  dropReason: z.string().nullable().optional(),
  droppedAt: z.string().nullable().optional(),
  droppedProgressPrimary: z.number().nullable().optional(),
  droppedProgressSecondary: z.number().nullable().optional(),
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
