import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  catalogueSnapshotSchema,
  wikidataAnimeReviewArtifactSchema,
  type CatalogueSnapshot,
  type WikidataAnimeReviewArtifact,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { formatWikidataAnimeReviewMarkdown } from '@/features/anime/catalogue/wikidata-anime-review-report'
import {
  animeAlternativeTitles,
  animeCatalogueItems,
  animeCatalogueSources,
} from '@/server/database/schema'

export async function readAnimeCatalogueSnapshot(
  database: NodePgDatabase,
): Promise<CatalogueSnapshot> {
  return database.transaction(
    async (transaction) => {
      const items = await transaction
        .select()
        .from(animeCatalogueItems)
        .orderBy(asc(animeCatalogueItems.id))
      const alternatives = await transaction
        .select()
        .from(animeAlternativeTitles)
        .orderBy(
          asc(animeAlternativeTitles.catalogueItemId),
          asc(animeAlternativeTitles.position),
        )
      const sources = await transaction
        .select()
        .from(animeCatalogueSources)
        .orderBy(
          asc(animeCatalogueSources.catalogueItemId),
          asc(animeCatalogueSources.sourceKey),
          asc(animeCatalogueSources.sourceItemId),
        )
      const alternativesByItem = new Map<string, string[]>()
      const sourcesByItem = new Map<
        string,
        Array<{ sourceKey: string; sourceItemId: string }>
      >()

      for (const alternative of alternatives) {
        const itemAlternatives =
          alternativesByItem.get(alternative.catalogueItemId) ?? []
        itemAlternatives.push(alternative.title)
        alternativesByItem.set(alternative.catalogueItemId, itemAlternatives)
      }

      for (const source of sources) {
        const itemSources = sourcesByItem.get(source.catalogueItemId) ?? []
        itemSources.push({
          sourceKey: source.sourceKey,
          sourceItemId: source.sourceItemId,
        })
        sourcesByItem.set(source.catalogueItemId, itemSources)
      }

      return catalogueSnapshotSchema.parse({
        items: items.map((item) => ({
          id: item.id,
          titles: {
            english: item.englishTitle,
            romaji: item.romajiTitle,
            original: item.originalTitle,
            alternatives: alternativesByItem.get(item.id) ?? [],
          },
          format: item.format,
          releaseStatus: item.releaseStatus,
          releaseYear: item.releaseYear,
          episodeCount: item.episodeCount,
          maturity: item.maturity,
          catalogueState: item.catalogueState,
          sources: sourcesByItem.get(item.id) ?? [],
        })),
      })
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

async function writeTextFileAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`

  await mkdir(dirname(filePath), { recursive: true })

  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function writeWikidataAnimeReviewArtifact(
  filePath: string,
  artifact: WikidataAnimeReviewArtifact,
): Promise<void> {
  const validatedArtifact = wikidataAnimeReviewArtifactSchema.parse(artifact)

  await writeTextFileAtomically(
    filePath,
    `${JSON.stringify(validatedArtifact, null, 2)}\n`,
  )
}

export async function writeWikidataAnimeReviewMarkdown(
  filePath: string,
  artifact: WikidataAnimeReviewArtifact,
): Promise<void> {
  const validatedArtifact = wikidataAnimeReviewArtifactSchema.parse(artifact)

  await writeTextFileAtomically(
    filePath,
    formatWikidataAnimeReviewMarkdown(validatedArtifact),
  )
}
