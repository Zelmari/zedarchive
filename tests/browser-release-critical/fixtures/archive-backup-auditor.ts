import { archiveBackupMaximumBytes } from '../../../src/features/archive-backup/domain/archive-backup'
import {
  archiveBackupDocumentSchema,
  type ArchiveBackupDocument,
} from '../../../src/features/archive-backup/domain/archive-backup'

type ReadableBackup = AsyncIterable<Uint8Array> & {
  destroy?: () => void
  cancel?: () => Promise<void>
}

export type ArchiveBackupDownload = Readonly<{
  createReadStream(): Promise<ReadableBackup | null>
  delete(): Promise<void>
}>

export type ArchiveBackupAuditExpectations = Readonly<{
  expectedEntryCount: number
  requiredEnglishTitles: readonly string[]
  prohibitedText: readonly string[]
}>

export type ArchiveBackupAudit = Readonly<{
  byteCount: number
  entryCount: number
  requiredTitlesPresent: boolean
  prohibitedTextAbsent: boolean
  strictSchemaValid: boolean
}>

type AuditFailureStage =
  'download_delete' | 'download_stream' | 'read' | 'schema' | 'size' | 'utf8'

class ArchiveBackupAuditFailure extends Error {
  constructor(stage: AuditFailureStage) {
    super(`M42 archive backup audit failed: ${stage}`)
  }
}

function failure(stage: AuditFailureStage): ArchiveBackupAuditFailure {
  return new ArchiveBackupAuditFailure(stage)
}

async function stopReadable(stream: ReadableBackup | undefined): Promise<void> {
  if (stream === undefined) return

  try {
    stream.destroy?.()
  } catch {
    // The audit result remains authoritative; cleanup continues to deletion.
  }

  try {
    await stream.cancel?.()
  } catch {
    // A stream may already be closed after destroy().
  }
}

function parseStrictDocument(bytes: Uint8Array): ArchiveBackupDocument {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw failure('utf8')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw failure('schema')
  }

  const document = archiveBackupDocumentSchema.safeParse(parsed)
  if (!document.success) throw failure('schema')
  return document.data
}

function validateExpectedPrivateContent(
  bytes: Uint8Array,
  document: ArchiveBackupDocument,
  expectations: ArchiveBackupAuditExpectations,
): ArchiveBackupAudit {
  const titles = new Set(
    document.archive.anime.entries.flatMap((entry) => {
      const english = entry.catalogue.titles.english
      return english === null ? [] : [english]
    }),
  )
  const requiredTitlesPresent = expectations.requiredEnglishTitles.every(
    (title) => titles.has(title),
  )
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const prohibitedTextAbsent = expectations.prohibitedText.every(
    (value) => !text.includes(value),
  )

  if (
    document.archive.anime.entries.length !== expectations.expectedEntryCount ||
    !requiredTitlesPresent ||
    !prohibitedTextAbsent
  ) {
    throw failure('schema')
  }

  return {
    byteCount: bytes.byteLength,
    entryCount: document.archive.anime.entries.length,
    requiredTitlesPresent,
    prohibitedTextAbsent,
    strictSchemaValid: true,
  }
}

/**
 * Reads exactly one private backup in memory. It never returns the document,
 * parsed object, source text, or parser details; callers receive only bounded
 * counts and booleans suitable for the approved safe diagnostic boundary.
 */
export async function auditArchiveBackupStream(
  stream: ReadableBackup,
  expectations: ArchiveBackupAuditExpectations,
): Promise<ArchiveBackupAudit> {
  const chunks: Uint8Array[] = []
  let byteCount = 0
  let completed = false

  try {
    try {
      for await (const chunk of stream) {
        const remainingCapacity = archiveBackupMaximumBytes - byteCount
        if (chunk.byteLength > remainingCapacity) {
          // The first byte beyond the cap has been observed. Stop before any
          // copy, decode, or parse can retain a larger private document.
          byteCount = archiveBackupMaximumBytes + 1
          await stopReadable(stream)
          throw failure('size')
        }
        const bytes = new Uint8Array(chunk)
        byteCount += bytes.byteLength
        chunks.push(bytes)
      }
    } catch (error) {
      if (error instanceof ArchiveBackupAuditFailure) throw error
      throw failure('read')
    }

    const bytes = new Uint8Array(byteCount)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const document = parseStrictDocument(bytes)
    completed = true
    return validateExpectedPrivateContent(bytes, document, expectations)
  } finally {
    chunks.length = 0
    if (!completed) await stopReadable(stream)
  }
}

/**
 * Keeps Playwright's private download lifecycle nested: the stream is closed
 * and the browser-managed file is deleted whether auditing succeeds or fails.
 */
export async function auditAndDeleteArchiveBackupDownload(
  download: ArchiveBackupDownload,
  expectations: ArchiveBackupAuditExpectations,
): Promise<ArchiveBackupAudit> {
  let stream: ReadableBackup | undefined

  try {
    let openedStream: ReadableBackup | null
    try {
      openedStream = await download.createReadStream()
    } catch {
      throw failure('download_stream')
    }
    if (openedStream === null) throw failure('download_stream')
    stream = openedStream
    return await auditArchiveBackupStream(stream, expectations)
  } finally {
    await stopReadable(stream)
    try {
      await download.delete()
    } catch {
      // A private file that cannot be deleted is the dominant failure even if
      // parsing already failed: it must never be reported as safely handled.
      throw failure('download_delete')
    }
  }
}
