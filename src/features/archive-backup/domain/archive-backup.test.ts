import { describe, expect, it } from 'vitest'
import {
  archiveBackupDocumentSchema,
  archiveBackupMaximumBytes,
  archiveBackupMaximumTitleBytes,
  archiveBackupVersion,
  utf8ByteLength,
} from '@/features/archive-backup/domain/archive-backup'

const valid = {
  schema: 'zedarchive.archive-backup',
  version: archiveBackupVersion,
  exportedAt: '2026-07-26T12:34:56.789Z',
  settings: { anime: { titleLanguage: 'english', adultContentEnabled: false } },
  archive: {
    anime: {
      entries: [
        {
          catalogue: {
            titles: {
              english: 'Example',
              romaji: null,
              original: null,
              alternatives: [],
            },
            format: 'tv',
            releaseStatus: 'finished',
            releaseYear: 2026,
            episodeCount: 12,
            maturity: 'safe',
          },
          tracking: {
            status: 'planned',
            episodeProgress: 0,
            episodeTotalOverride: null,
            rating: null,
            isFavourite: false,
            startDate: null,
            finishDate: null,
          },
        },
      ],
    },
  },
} as const

describe('archive backup document', () => {
  it('accepts the exact v1 contract', () => {
    expect(archiveBackupDocumentSchema.parse(valid)).toEqual(valid)
  })

  it('rejects unknown fields, future versions, and non-canonical timestamps', () => {
    expect(
      archiveBackupDocumentSchema.safeParse({ ...valid, ignored: true })
        .success,
    ).toBe(false)
    expect(
      archiveBackupDocumentSchema.safeParse({ ...valid, version: 2 }).success,
    ).toBe(false)
    expect(
      archiveBackupDocumentSchema.safeParse({
        ...valid,
        exportedAt: '2026-07-26T12:34:56Z',
      }).success,
    ).toBe(false)
    expect(
      archiveBackupDocumentSchema.safeParse({
        ...valid,
        exportedAt: '2025-02-29T12:34:56.789Z',
      }).success,
    ).toBe(false)
    expect(
      archiveBackupDocumentSchema.safeParse({
        ...valid,
        exportedAt: '2024-02-29T12:34:56.789Z',
      }).success,
    ).toBe(true)
  })

  it.each([
    ['settings', { ...valid, settings: { ...valid.settings, extra: true } }],
    [
      'anime settings',
      {
        ...valid,
        settings: {
          anime: { ...valid.settings.anime, extra: true },
        },
      },
    ],
    [
      'catalogue',
      {
        ...valid,
        archive: {
          anime: {
            entries: [
              {
                ...valid.archive.anime.entries[0],
                catalogue: {
                  ...valid.archive.anime.entries[0].catalogue,
                  extra: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      'titles',
      {
        ...valid,
        archive: {
          anime: {
            entries: [
              {
                ...valid.archive.anime.entries[0],
                catalogue: {
                  ...valid.archive.anime.entries[0].catalogue,
                  titles: {
                    ...valid.archive.anime.entries[0].catalogue.titles,
                    extra: true,
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      'tracking',
      {
        ...valid,
        archive: {
          anime: {
            entries: [
              {
                ...valid.archive.anime.entries[0],
                tracking: {
                  ...valid.archive.anime.entries[0].tracking,
                  extra: true,
                },
              },
            ],
          },
        },
      },
    ],
  ])('rejects unknown nested %s properties', (_name, document) => {
    expect(archiveBackupDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('measures UTF-8 rather than UTF-16 code units', () => {
    expect(utf8ByteLength('😀')).toBe(4)
    expect(utf8ByteLength('x'.repeat(archiveBackupMaximumBytes))).toBe(
      archiveBackupMaximumBytes,
    )
  })

  it('enforces primary and alternative title byte boundaries', () => {
    const exact = '😀'.repeat(archiveBackupMaximumTitleBytes / 4)
    const oneByteOver = `${exact}x`
    expect(
      archiveBackupDocumentSchema.safeParse({
        ...valid,
        archive: {
          anime: {
            entries: [
              {
                ...valid.archive.anime.entries[0],
                catalogue: {
                  ...valid.archive.anime.entries[0].catalogue,
                  titles: {
                    ...valid.archive.anime.entries[0].catalogue.titles,
                    english: exact,
                  },
                },
              },
            ],
          },
        },
      }).success,
    ).toBe(true)
    expect(
      archiveBackupDocumentSchema.safeParse({
        ...valid,
        archive: {
          anime: {
            entries: [
              {
                ...valid.archive.anime.entries[0],
                catalogue: {
                  ...valid.archive.anime.entries[0].catalogue,
                  titles: {
                    ...valid.archive.anime.entries[0].catalogue.titles,
                    alternatives: [oneByteOver],
                  },
                },
              },
            ],
          },
        },
      }).success,
    ).toBe(false)
  })
})
