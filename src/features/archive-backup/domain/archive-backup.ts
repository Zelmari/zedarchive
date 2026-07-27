import { z } from 'zod'
import {
  animeFormatSchema,
  animeMaturitySchema,
  animeReleaseStatusSchema,
} from '@/features/anime/domain/anime-catalogue-item'
import { entryStatusSchema } from '@/features/archive/domain/entry-status'
import { calendarDateSchema } from '@/features/archive/domain/entry-date-range'
import { episodeProgressSchema } from '@/features/archive/domain/episode-progress'
import { episodeTotalSchema } from '@/features/archive/domain/episode-total'
import { ratingSchema } from '@/features/archive/domain/rating'
import { animeTitleLanguageSchema } from '@/features/settings/domain/catalogue-preferences'

export const archiveBackupSchemaIdentifier =
  'zedarchive.archive-backup' as const
export const archiveBackupVersion = 1 as const
export const archiveBackupMaximumEntries = 10_000
export const archiveBackupMaximumTitleBytes = 4_096
export const archiveBackupMaximumAlternativeTitles = 100
export const archiveBackupMaximumBytes = 10 * 1024 * 1024
export const archiveBackupFilename = 'zedarchive-archive-backup-v1.json'

const exportedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  .refine(
    (value) => {
      const timestamp = Date.parse(value)
      return (
        Number.isFinite(timestamp) &&
        new Date(timestamp).toISOString() === value
      )
    },
    {
      message: 'Expected a canonical UTC timestamp',
    },
  )

const archiveBackupTitleSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), {
    message: 'Title must not have surrounding whitespace',
  })
  .refine((value) => utf8ByteLength(value) <= archiveBackupMaximumTitleBytes, {
    message: 'Title exceeds the UTF-8 byte limit',
  })

const archiveBackupTitlesSchema = z
  .strictObject({
    english: archiveBackupTitleSchema.nullable(),
    romaji: archiveBackupTitleSchema.nullable(),
    original: archiveBackupTitleSchema.nullable(),
    alternatives: z
      .array(archiveBackupTitleSchema)
      .max(archiveBackupMaximumAlternativeTitles),
  })
  .superRefine(({ english, romaji, original, alternatives }, context) => {
    const primaryTitles = [english, romaji, original].filter(
      (title): title is string => title !== null,
    )
    if (primaryTitles.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['english'],
        message: 'At least one primary title is required',
      })
    }
    const seen = new Set(primaryTitles)
    alternatives.forEach((title, index) => {
      if (seen.has(title)) {
        context.addIssue({
          code: 'custom',
          path: ['alternatives', index],
          message: 'Titles must be unique',
        })
      }
      seen.add(title)
    })
  })

const archiveBackupEntrySchema = z.strictObject({
  catalogue: z.strictObject({
    titles: archiveBackupTitlesSchema,
    format: animeFormatSchema,
    releaseStatus: animeReleaseStatusSchema,
    releaseYear: z.number().int().min(1).max(9999).nullable(),
    episodeCount: episodeTotalSchema.nullable(),
    maturity: animeMaturitySchema,
  }),
  tracking: z.strictObject({
    status: entryStatusSchema,
    episodeProgress: episodeProgressSchema,
    episodeTotalOverride: episodeTotalSchema.nullable(),
    rating: ratingSchema.nullable(),
    isFavourite: z.boolean(),
    startDate: calendarDateSchema.nullable(),
    finishDate: calendarDateSchema.nullable(),
  }),
})

export const archiveBackupDocumentSchema = z.strictObject({
  schema: z.literal(archiveBackupSchemaIdentifier),
  version: z.literal(archiveBackupVersion),
  exportedAt: exportedAtSchema,
  settings: z.strictObject({
    anime: z.strictObject({
      titleLanguage: animeTitleLanguageSchema,
      adultContentEnabled: z.boolean(),
    }),
  }),
  archive: z.strictObject({
    anime: z.strictObject({
      entries: z
        .array(archiveBackupEntrySchema)
        .max(archiveBackupMaximumEntries),
    }),
  }),
})

export type ArchiveBackupDocument = z.infer<typeof archiveBackupDocumentSchema>

export function parseArchiveBackupDocument(
  value: unknown,
): ArchiveBackupDocument {
  return archiveBackupDocumentSchema.parse(value)
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
