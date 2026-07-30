import assert from 'node:assert/strict'
import test from 'node:test'
import { archiveBackupMaximumBytes } from '../../../src/features/archive-backup/domain/archive-backup'
import {
  auditAndDeleteArchiveBackupDownload,
  auditArchiveBackupStream,
  type ArchiveBackupDownload,
} from './archive-backup-auditor'

const encoder = new TextEncoder()

function documentBytes(overrides: Record<string, unknown> = {}) {
  return encoder.encode(
    JSON.stringify({
      schema: 'zedarchive.archive-backup',
      version: 1,
      exportedAt: '2026-07-29T12:34:56.789Z',
      settings: {
        anime: { titleLanguage: 'english', adultContentEnabled: false },
      },
      archive: {
        anime: {
          entries: [
            {
              catalogue: {
                titles: {
                  english: 'M42 safe title',
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
      ...overrides,
    }),
  )
}

function iterable(
  chunks: readonly Uint8Array[],
  options: Readonly<{ readError?: boolean }> = {},
) {
  let destroyed = false
  let cancelled = false
  return {
    async *[Symbol.asyncIterator]() {
      if (options.readError) throw new Error('private source error')
      for (const chunk of chunks) {
        yield chunk
      }
    },
    destroy() {
      destroyed = true
    },
    async cancel() {
      cancelled = true
    },
    state() {
      return { cancelled, destroyed }
    },
  }
}

const expectations = {
  expectedEntryCount: 1,
  requiredEnglishTitles: ['M42 safe title'],
  prohibitedText: ['M42 foreign sentinel', 'source_key', 'userId'],
} as const

test('returns only safe audit facts for a strict private document', async () => {
  const stream = iterable([documentBytes()])
  const result = await auditArchiveBackupStream(stream, expectations)

  assert.deepEqual(result, {
    byteCount: documentBytes().byteLength,
    entryCount: 1,
    prohibitedTextAbsent: true,
    requiredTitlesPresent: true,
    strictSchemaValid: true,
  })
  assert.deepEqual(stream.state(), { cancelled: false, destroyed: false })
})

test('allows the exact 10 MiB boundary before strict decoding', async () => {
  const stream = iterable([new Uint8Array(archiveBackupMaximumBytes)])
  await assert.rejects(() => auditArchiveBackupStream(stream, expectations), {
    message: 'M42 archive backup audit failed: schema',
  })
  assert.deepEqual(stream.state(), { cancelled: true, destroyed: true })
})

test('stops at the first byte over 10 MiB before decoding', async () => {
  const stream = iterable([
    new Uint8Array(archiveBackupMaximumBytes),
    new Uint8Array([0]),
  ])
  await assert.rejects(() => auditArchiveBackupStream(stream, expectations), {
    message: 'M42 archive backup audit failed: size',
  })
  assert.deepEqual(stream.state(), { cancelled: true, destroyed: true })
})

test('rejects one oversized chunk before attempting to copy or decode it', async () => {
  let copyAttempted = false
  const oversizedChunk = {
    get byteLength() {
      return archiveBackupMaximumBytes + 1
    },
    get [Symbol.iterator]() {
      copyAttempted = true
      throw new Error('oversized backup chunk was copied')
    },
    get length() {
      copyAttempted = true
      throw new Error('oversized backup chunk was copied')
    },
  } as unknown as Uint8Array
  const stream = iterable([oversizedChunk])

  await assert.rejects(() => auditArchiveBackupStream(stream, expectations), {
    message: 'M42 archive backup audit failed: size',
  })
  assert.equal(copyAttempted, false)
  assert.deepEqual(stream.state(), { cancelled: true, destroyed: true })
})

test('rejects malformed UTF-8 and malformed JSON with fixed errors', async () => {
  await assert.rejects(
    () =>
      auditArchiveBackupStream(
        iterable([new Uint8Array([0xff])]),
        expectations,
      ),
    { message: 'M42 archive backup audit failed: utf8' },
  )
  await assert.rejects(
    () =>
      auditArchiveBackupStream(iterable([encoder.encode('{')]), expectations),
    { message: 'M42 archive backup audit failed: schema' },
  )
})

test('rejects a strict-schema mismatch and read failure without source text', async () => {
  await assert.rejects(
    () =>
      auditArchiveBackupStream(
        iterable([documentBytes({ version: 2 })]),
        expectations,
      ),
    { message: 'M42 archive backup audit failed: schema' },
  )
  await assert.rejects(
    () =>
      auditArchiveBackupStream(iterable([], { readError: true }), expectations),
    { message: 'M42 archive backup audit failed: read' },
  )
})

test('deletes the browser download after every audit failure and success', async () => {
  for (const source of [
    iterable([documentBytes()]),
    iterable([new Uint8Array([0xff])]),
    iterable([new Uint8Array(archiveBackupMaximumBytes + 1)]),
    iterable([encoder.encode('{')]),
    iterable([documentBytes({ version: 2 })]),
    iterable([], { readError: true }),
  ]) {
    let deleted = false
    const download: ArchiveBackupDownload = {
      async createReadStream() {
        return source
      },
      async delete() {
        deleted = true
      },
    }
    await auditAndDeleteArchiveBackupDownload(download, expectations).catch(
      () => undefined,
    )
    assert.equal(deleted, true)
  }
})

test('deletes the browser download when opening its stream fails', async () => {
  for (const createReadStream of [
    async () => null,
    async () => {
      throw new Error('private stream error')
    },
  ]) {
    let deleted = false
    const download: ArchiveBackupDownload = {
      createReadStream,
      async delete() {
        deleted = true
      },
    }
    await assert.rejects(
      () => auditAndDeleteArchiveBackupDownload(download, expectations),
      { message: 'M42 archive backup audit failed: download_stream' },
    )
    assert.equal(deleted, true)
  }
})

test('reports deletion failure with a fixed error after a successful audit', async () => {
  const download: ArchiveBackupDownload = {
    async createReadStream() {
      return iterable([documentBytes()])
    },
    async delete() {
      throw new Error('private file path')
    },
  }
  await assert.rejects(
    () => auditAndDeleteArchiveBackupDownload(download, expectations),
    { message: 'M42 archive backup audit failed: download_delete' },
  )
})

test('makes deletion failure authoritative after an audit failure', async () => {
  const download: ArchiveBackupDownload = {
    async createReadStream() {
      return iterable([new Uint8Array([0xff])])
    },
    async delete() {
      throw new Error('private file path')
    },
  }
  await assert.rejects(
    () => auditAndDeleteArchiveBackupDownload(download, expectations),
    { message: 'M42 archive backup audit failed: download_delete' },
  )
})
