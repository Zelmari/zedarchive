import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  candidateClassificationValues,
  type WikidataAnimeReviewArtifact,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { wikidataImporterUserAgent } from '@/integrations/wikidata/wikidata-client'
import {
  writeWikidataAnimeReviewArtifact,
  writeWikidataAnimeReviewMarkdown,
} from '@/server/database/prepare-wikidata-anime-import'

const temporaryDirectories: string[] = []

function createArtifact(): WikidataAnimeReviewArtifact {
  return {
    version: 1,
    sourceKey: 'wikidata',
    endpoint: 'https://www.wikidata.org/w/api.php',
    generatedAt: '2026-07-17T00:00:00.000Z',
    manifestSha256: 'a'.repeat(64),
    catalogueSnapshotSha256: 'b'.repeat(64),
    userAgent: wikidataImporterUserAgent,
    candidates: [],
    summary: {
      total: 0,
      blockers: 0,
      classifications: Object.fromEntries(
        candidateClassificationValues.map((classification) => [
          classification,
          0,
        ]),
      ) as WikidataAnimeReviewArtifact['summary']['classifications'],
    },
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('writeWikidataAnimeReviewArtifact', () => {
  it('creates parent directories and leaves only the complete final artifact', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'zedarchive-wikidata-artifact-'),
    )
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'nested', 'review.json')
    const artifact = createArtifact()

    await writeWikidataAnimeReviewArtifact(filePath, artifact)

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(artifact)
    expect(await readdir(join(directory, 'nested'))).toEqual(['review.json'])
  })

  it('validates before replacing an existing complete artifact', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'zedarchive-wikidata-artifact-'),
    )
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'review.json')
    const artifact = createArtifact()
    await writeWikidataAnimeReviewArtifact(filePath, artifact)
    const contentsBefore = await readFile(filePath, 'utf8')

    await expect(
      writeWikidataAnimeReviewArtifact(filePath, {
        ...artifact,
        version: 2,
      } as unknown as WikidataAnimeReviewArtifact),
    ).rejects.toThrow()

    expect(await readFile(filePath, 'utf8')).toBe(contentsBefore)
    expect(await readdir(directory)).toEqual(['review.json'])
  })

  it('cleans its temporary sibling when the final rename fails', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'zedarchive-wikidata-artifact-'),
    )
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'review.json')
    await mkdir(filePath)

    await expect(
      writeWikidataAnimeReviewArtifact(filePath, createArtifact()),
    ).rejects.toThrow()

    expect(await readdir(directory)).toEqual(['review.json'])
    expect(await readdir(filePath)).toEqual([])
  })

  it('writes a human-readable companion from the same validated artifact', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'zedarchive-wikidata-artifact-'),
    )
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'review.md')

    await writeWikidataAnimeReviewMarkdown(filePath, createArtifact())

    const contents = await readFile(filePath, 'utf8')
    expect(contents).toContain('# Wikidata anime import review')
    expect(contents).toContain('- Candidates: 0')
    expect(contents).toContain('JSON artifact is authoritative')
  })
})
