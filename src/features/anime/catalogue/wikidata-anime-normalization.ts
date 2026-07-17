import { z } from 'zod'
import {
  animeTitleComparisonKey,
  classifyWikidataAnimeCandidate,
} from '@/features/anime/catalogue/wikidata-anime-classification'
import {
  catalogueSnapshotSchema,
  proposedAnimeCatalogueItemSchema,
  wikidataAnimeCandidateReviewSchema,
  type CatalogueSnapshot,
  type ProposedAnimeCatalogueItem,
  type WikidataAnimeCandidateReview,
  type WikidataAnimeImportCandidate,
} from '@/features/anime/catalogue/wikidata-anime-import-contract'
import {
  wikidataItemValueSchema,
  wikidataMonolingualTextValueSchema,
  wikidataQuantityValueSchema,
  wikidataStatementSchema,
  wikidataTimeValueSchema,
  type WikidataEntity,
  type WikidataStatement,
} from '@/integrations/wikidata/wikidata-entity'

const supportedClaims = ['P31', 'P1476', 'P577', 'P580', 'P582', 'P1113']
const formatByClass: Readonly<
  Record<string, ProposedAnimeCatalogueItem['format']>
> = {
  Q63952888: 'tv',
  Q100269041: 'tv',
  Q20650540: 'movie',
  Q113687694: 'ova',
  Q113671041: 'ona',
  Q117209498: 'special',
}
const reviewedGeneralFormatClasses = new Set(['Q202866'])

type IndexedStatement = {
  statement: WikidataStatement
  position: number
}

function uniqueValues<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function usableStatements(
  entity: WikidataEntity,
  property: string,
  warnings: string[],
  ignoredValues: string[],
): IndexedStatement[] {
  const statements: IndexedStatement[] = []

  for (const [index, input] of (entity.claims[property] ?? []).entries()) {
    const parsed = wikidataStatementSchema.safeParse(input)

    if (!parsed.success) {
      warnings.push(`${property} statement ${index + 1} had an invalid shape.`)
      ignoredValues.push(`${property} statement ${index + 1}: invalid shape`)
      continue
    }

    if (parsed.data.mainsnak.property !== property) {
      warnings.push(
        `${property} statement ${index + 1} declared a different property.`,
      )
      ignoredValues.push(
        `${property} statement ${index + 1}: property mismatch`,
      )
      continue
    }

    if (parsed.data.rank === 'deprecated') {
      ignoredValues.push(`${property} statement ${index + 1}: deprecated rank`)
      continue
    }

    if (
      parsed.data.mainsnak.snaktype !== 'value' ||
      parsed.data.mainsnak.datavalue === undefined
    ) {
      ignoredValues.push(
        `${property} statement ${index + 1}: ${parsed.data.mainsnak.snaktype}`,
      )
      continue
    }

    statements.push({ statement: parsed.data, position: index + 1 })
  }

  return statements
}

function itemClaimValues(
  statements: readonly IndexedStatement[],
  property: string,
  warnings: string[],
  ignoredValues: string[],
): string[] {
  const values: string[] = []

  statements.forEach(({ statement, position }) => {
    const parsed = wikidataItemValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    )

    if (
      statement.mainsnak.datatype !== 'wikibase-item' ||
      statement.mainsnak.datavalue?.type !== 'wikibase-entityid' ||
      !parsed.success
    ) {
      warnings.push(`${property} statement ${position} was not an item value.`)
      ignoredValues.push(`${property} statement ${position}: wrong datatype`)
      return
    }

    values.push(parsed.data.id)
  })

  return uniqueValues(values)
}

function japaneseTitleClaims(
  statements: readonly IndexedStatement[],
  warnings: string[],
  ignoredValues: string[],
): Array<{ title: string; rank: WikidataStatement['rank'] }> {
  const titles: Array<{ title: string; rank: WikidataStatement['rank'] }> = []

  statements.forEach(({ statement, position }) => {
    const parsed = wikidataMonolingualTextValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    )

    if (
      statement.mainsnak.datatype !== 'monolingualtext' ||
      statement.mainsnak.datavalue?.type !== 'monolingualtext' ||
      !parsed.success
    ) {
      warnings.push(`P1476 statement ${position} was not monolingual text.`)
      ignoredValues.push(`P1476 statement ${position}: wrong datatype`)
      return
    }

    const title = parsed.data.text.trim()

    if (parsed.data.language === 'ja' && title.length > 0) {
      titles.push({ title, rank: statement.rank })
    } else {
      ignoredValues.push(
        `P1476 statement ${position}: unsupported language or blank title`,
      )
    }
  })

  return titles
}

function selectOriginalTitle(
  titleClaims: readonly { title: string; rank: WikidataStatement['rank'] }[],
  japaneseLabel: string | null,
): { title: string | null; ambiguous: boolean; unused: string[] } {
  const preferred = uniqueValues(
    titleClaims
      .filter(({ rank }) => rank === 'preferred')
      .map(({ title }) => title),
  )
  const normal = uniqueValues(
    titleClaims
      .filter(({ rank }) => rank === 'normal')
      .map(({ title }) => title),
  )
  const selectedRank = preferred.length > 0 ? preferred : normal

  if (selectedRank.length > 1) {
    return {
      title: null,
      ambiguous: true,
      unused: uniqueValues([...preferred, ...normal]),
    }
  }

  const title = selectedRank[0] ?? japaneseLabel
  return {
    title,
    ambiguous: false,
    unused: uniqueValues([...preferred, ...normal]).filter(
      (candidate) => candidate !== title,
    ),
  }
}

function claimYears(
  statements: readonly IndexedStatement[],
  property: string,
  warnings: string[],
  ignoredValues: string[],
): number[] {
  const years: number[] = []

  statements.forEach(({ statement, position }) => {
    const parsed = wikidataTimeValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    )
    const match = parsed.success ? /^\+(\d{4,})-/.exec(parsed.data.time) : null
    const year = match === null ? Number.NaN : Number(match[1])

    if (
      statement.mainsnak.datatype !== 'time' ||
      statement.mainsnak.datavalue?.type !== 'time' ||
      !parsed.success ||
      parsed.data.precision < 9 ||
      !Number.isSafeInteger(year) ||
      year < 1 ||
      year > 9999
    ) {
      warnings.push(`${property} statement ${position} had no usable year.`)
      ignoredValues.push(
        `${property} statement ${position}: invalid time value`,
      )
      return
    }

    years.push(year)
  })

  return uniqueValues(years.map(String)).map(Number)
}

function episodeCounts(
  statements: readonly IndexedStatement[],
  warnings: string[],
  ignoredValues: string[],
): number[] {
  const counts: number[] = []

  statements.forEach(({ statement, position }) => {
    const parsed = wikidataQuantityValueSchema.safeParse(
      statement.mainsnak.datavalue?.value,
    )
    const count = parsed.success ? Number(parsed.data.amount) : Number.NaN

    if (
      statement.mainsnak.datatype !== 'quantity' ||
      statement.mainsnak.datavalue?.type !== 'quantity' ||
      !parsed.success ||
      parsed.data.unit !== '1' ||
      !/^\+?[1-9][0-9]*$/.test(parsed.data.amount) ||
      !Number.isSafeInteger(count) ||
      count <= 0
    ) {
      warnings.push(`P1113 statement ${position} had no usable episode count.`)
      ignoredValues.push(`P1113 statement ${position}: invalid quantity value`)
      return
    }

    counts.push(count)
  })

  return uniqueValues(counts.map(String)).map(Number)
}

function providerProjection(entity: WikidataEntity) {
  const projectStatement = (property: string, input: unknown): unknown => {
    const statement = wikidataStatementSchema.safeParse(input)

    if (!statement.success) {
      return { invalid: true }
    }

    const { mainsnak } = statement.data
    let value: unknown

    if (mainsnak.datavalue !== undefined) {
      const valueSchema =
        property === 'P31'
          ? wikidataItemValueSchema
          : property === 'P1476'
            ? wikidataMonolingualTextValueSchema
            : ['P577', 'P580', 'P582'].includes(property)
              ? wikidataTimeValueSchema
              : property === 'P1113'
                ? wikidataQuantityValueSchema
                : z.never()
      const parsedValue = valueSchema.safeParse(mainsnak.datavalue.value)
      value = parsedValue.success
        ? ['P577', 'P580', 'P582'].includes(property)
          ? {
              time: (
                parsedValue.data as z.infer<typeof wikidataTimeValueSchema>
              ).time,
              precision: (
                parsedValue.data as z.infer<typeof wikidataTimeValueSchema>
              ).precision,
            }
          : parsedValue.data
        : { invalid: true }
    }

    return {
      rank: statement.data.rank,
      mainsnak: {
        snaktype: mainsnak.snaktype,
        property: mainsnak.property,
        ...(mainsnak.datatype === undefined
          ? {}
          : { datatype: mainsnak.datatype }),
        ...(mainsnak.datavalue === undefined
          ? {}
          : {
              datavalue: {
                type: mainsnak.datavalue.type,
                value,
              },
            }),
      },
    }
  }

  return {
    labels: {
      en: entity.labels.en?.value.trim() || null,
      ja: entity.labels.ja?.value.trim() || null,
    },
    aliases: {
      en: (entity.aliases.en ?? []).map(({ value }) => value),
      ja: (entity.aliases.ja ?? []).map(({ value }) => value),
    },
    claims: Object.fromEntries(
      supportedClaims
        .filter((property) => entity.claims[property] !== undefined)
        .map((property) => [
          property,
          (entity.claims[property] ?? []).map((statement) =>
            projectStatement(property, statement),
          ),
        ]),
    ),
  }
}

export function reviewWikidataAnimeCandidate(
  candidate: WikidataAnimeImportCandidate,
  entity: WikidataEntity,
  snapshotInput: CatalogueSnapshot,
  order: number,
): WikidataAnimeCandidateReview {
  const snapshot = catalogueSnapshotSchema.parse(snapshotInput)
  const warnings: string[] = []
  const ignoredValues: string[] = []
  const projection = providerProjection(entity)
  const base = {
    order,
    sourceItemId: candidate.sourceItemId,
    catalogueItemId: candidate.catalogueItemId,
    expectedEnglishLabel: candidate.expectedEnglishLabel,
    providerRevisionId: entity.lastrevid ?? null,
    providerProjection: projection,
    overrides: candidate.overrides,
    warnings,
    ignoredValues,
    matches: [],
  }

  if (entity.id !== candidate.sourceItemId) {
    warnings.push(
      `Provider entity ID ${entity.id} did not match requested QID ${candidate.sourceItemId}.`,
    )
    return wikidataAnimeCandidateReviewSchema.parse({
      ...base,
      proposedItem: null,
      classification: 'blocked-invalid-provider-data',
    })
  }

  if (entity.redirect !== undefined) {
    warnings.push(
      'The requested Wikidata QID is redirected and requires a reviewed manifest update.',
    )
    return wikidataAnimeCandidateReviewSchema.parse({
      ...base,
      proposedItem: null,
      classification: 'blocked-unsupported-identity',
    })
  }

  if (entity.missing !== undefined || entity.type !== 'item') {
    return wikidataAnimeCandidateReviewSchema.parse({
      ...base,
      proposedItem: null,
      classification: 'blocked-invalid-provider-data',
    })
  }

  const englishTitle = projection.labels.en
  const japaneseLabel = projection.labels.ja

  if (
    englishTitle !== null &&
    englishTitle !== candidate.expectedEnglishLabel
  ) {
    warnings.push(
      `Live English label "${englishTitle}" differs from expected label "${candidate.expectedEnglishLabel}".`,
    )
  }

  const titleStatements = usableStatements(
    entity,
    'P1476',
    warnings,
    ignoredValues,
  )
  const japaneseClaims = japaneseTitleClaims(
    titleStatements,
    warnings,
    ignoredValues,
  )
  const originalSelection = selectOriginalTitle(japaneseClaims, japaneseLabel)

  if (originalSelection.ambiguous) {
    warnings.push('Multiple Japanese P1476 titles exist at the selected rank.')
  }

  const primaryTitles = [
    englishTitle,
    candidate.overrides.romajiTitle ?? null,
    originalSelection.title,
  ].filter((title): title is string => title !== null)
  const excludedKeys = new Set(
    (candidate.overrides.excludedAlternativeTitles ?? []).map(
      animeTitleComparisonKey,
    ),
  )
  const primaryKeys = new Set(primaryTitles.map(animeTitleComparisonKey))
  const alternatives: string[] = []
  const seenAlternativeKeys = new Set<string>()

  for (const title of [
    ...projection.aliases.en,
    ...projection.aliases.ja,
    ...originalSelection.unused,
  ]) {
    const trimmed = title.trim()
    const key = animeTitleComparisonKey(trimmed)

    if (
      trimmed.length === 0 ||
      primaryKeys.has(key) ||
      excludedKeys.has(key) ||
      seenAlternativeKeys.has(key)
    ) {
      if (excludedKeys.has(key)) {
        ignoredValues.push(
          `Alias excluded by manifest: ${JSON.stringify(trimmed)}`,
        )
      }
      continue
    }

    seenAlternativeKeys.add(key)
    alternatives.push(trimmed)
  }

  const classStatements = usableStatements(
    entity,
    'P31',
    warnings,
    ignoredValues,
  )
  const classes = itemClaimValues(
    classStatements,
    'P31',
    warnings,
    ignoredValues,
  )
  const mappedFormats = uniqueValues(
    classes.flatMap((classId) =>
      formatByClass[classId] === undefined ? [] : [formatByClass[classId]],
    ),
  )
  const formatOverride = candidate.overrides.format
  let unsupportedIdentity = false
  let ambiguous = originalSelection.ambiguous
  let format: ProposedAnimeCatalogueItem['format'] | null = null

  if (mappedFormats.length > 1) {
    ambiguous = true
    warnings.push(`Conflicting mapped formats: ${mappedFormats.join(', ')}.`)
  } else if (
    mappedFormats.length === 1 &&
    formatOverride !== undefined &&
    mappedFormats[0] !== formatOverride
  ) {
    ambiguous = true
    warnings.push(
      `Mapped format ${mappedFormats[0]} conflicts with override ${formatOverride}.`,
    )
  } else if (mappedFormats.length === 1) {
    format = formatOverride ?? mappedFormats[0] ?? null
  } else if (
    formatOverride !== undefined &&
    classes.some((classId) => reviewedGeneralFormatClasses.has(classId))
  ) {
    format = formatOverride
    warnings.push(
      `Format ${formatOverride} uses a reviewed override for general class ${classes.join(', ')}.`,
    )
  } else {
    unsupportedIdentity = true
    warnings.push(
      `No approved anime identity class was found in P31 (${classes.join(', ') || 'none'}).`,
    )
  }

  const publicationYears = claimYears(
    usableStatements(entity, 'P577', warnings, ignoredValues),
    'P577',
    warnings,
    ignoredValues,
  )
  const startYears = claimYears(
    usableStatements(entity, 'P580', warnings, ignoredValues),
    'P580',
    warnings,
    ignoredValues,
  )
  const providerYears =
    publicationYears.length > 0 ? publicationYears : startYears

  if (providerYears.length > 1) {
    warnings.push(
      `Multiple release years were reduced to the earliest value: ${providerYears.join(', ')}.`,
    )

    if (candidate.overrides.releaseYear === undefined) {
      ambiguous = true
    }
  }

  const providerYear =
    providerYears.length > 0 ? Math.min(...providerYears) : null
  const releaseYear =
    candidate.overrides.releaseYear === undefined
      ? providerYear
      : candidate.overrides.releaseYear

  if (
    candidate.overrides.releaseYear !== undefined &&
    providerYear !== null &&
    providerYear !== candidate.overrides.releaseYear
  ) {
    warnings.push(
      `Provider release year ${providerYear} was overridden with ${candidate.overrides.releaseYear}.`,
    )
  }

  const providerEpisodeCounts = episodeCounts(
    usableStatements(entity, 'P1113', warnings, ignoredValues),
    warnings,
    ignoredValues,
  )

  if (providerEpisodeCounts.length > 1) {
    warnings.push(
      `Conflicting provider episode counts were resolved by reviewed override: ${providerEpisodeCounts.join(', ')}.`,
    )
    if (candidate.overrides.episodeCount === undefined) {
      ambiguous = true
    }
  }

  const providerEpisodeCount = providerEpisodeCounts[0] ?? null
  const episodeCount =
    candidate.overrides.episodeCount === undefined
      ? providerEpisodeCount
      : candidate.overrides.episodeCount

  if (
    candidate.overrides.episodeCount !== undefined &&
    providerEpisodeCount !== null &&
    providerEpisodeCount !== candidate.overrides.episodeCount
  ) {
    warnings.push(
      `Provider episode count ${providerEpisodeCount} was overridden with ${String(candidate.overrides.episodeCount)}.`,
    )
  }

  if (format === null && !ambiguous) {
    unsupportedIdentity = true
  }

  if (unsupportedIdentity || ambiguous || primaryTitles.length === 0) {
    return wikidataAnimeCandidateReviewSchema.parse({
      ...base,
      warnings,
      ignoredValues,
      proposedItem: null,
      classification: unsupportedIdentity
        ? 'blocked-unsupported-identity'
        : ambiguous
          ? 'blocked-ambiguous'
          : 'blocked-invalid-provider-data',
    })
  }

  const proposedItem = proposedAnimeCatalogueItemSchema.parse({
    id: candidate.catalogueItemId,
    titles: {
      english: englishTitle,
      romaji: candidate.overrides.romajiTitle ?? null,
      original: originalSelection.title,
      alternatives,
    },
    format,
    releaseStatus: candidate.overrides.releaseStatus ?? 'unknown',
    releaseYear,
    episodeCount,
    maturity: candidate.overrides.maturity ?? 'unknown',
    catalogueState: 'draft',
    sources: [{ sourceKey: 'wikidata', sourceItemId: candidate.sourceItemId }],
  })
  const classification = classifyWikidataAnimeCandidate(
    candidate,
    proposedItem,
    snapshot,
  )

  return wikidataAnimeCandidateReviewSchema.parse({
    ...base,
    warnings,
    ignoredValues,
    proposedItem,
    ...classification,
  })
}
