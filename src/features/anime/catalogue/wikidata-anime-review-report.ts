import type { WikidataAnimeReviewArtifact } from '@/features/anime/catalogue/wikidata-anime-import-contract'

function escapeMarkdown(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|\-])/g, '\\$1')
}

function displayValue(value: string | number | null): string {
  return value === null ? '—' : escapeMarkdown(String(value))
}

function displayList(values: readonly string[]): string {
  return values.length === 0 ? 'None' : values.map(escapeMarkdown).join(' · ')
}

/**
 * Formats the strict JSON artifact as disposable, human-oriented review
 * evidence. The JSON remains authoritative; this view exists to make semantic
 * title and metadata mistakes conspicuous before seed promotion.
 */
export function formatWikidataAnimeReviewMarkdown(
  artifact: WikidataAnimeReviewArtifact,
): string {
  const lines = [
    '# Wikidata anime import review',
    '',
    '> Generated review aid. The adjacent JSON artifact is authoritative.',
    '',
    `- Generated: ${escapeMarkdown(artifact.generatedAt)}`,
    `- Candidates: ${artifact.summary.total}`,
    `- Blockers: ${artifact.summary.blockers}`,
    `- Manifest fingerprint: ${artifact.manifestSha256}`,
    `- Catalogue fingerprint: ${artifact.catalogueSnapshotSha256}`,
    '',
  ]

  for (const candidate of artifact.candidates) {
    const proposed = candidate.proposedItem
    const heading =
      proposed?.titles.english ??
      proposed?.titles.romaji ??
      proposed?.titles.original ??
      candidate.expectedEnglishLabel

    lines.push(
      `## ${candidate.order + 1}. ${escapeMarkdown(heading)}`,
      '',
      `- Classification: **${escapeMarkdown(candidate.classification)}**`,
      `- Identity: ${candidate.sourceItemId} → ${candidate.catalogueItemId}`,
      `- English: ${displayValue(proposed?.titles.english ?? null)}`,
      `- Romaji: ${displayValue(proposed?.titles.romaji ?? null)}`,
      `- Original: ${displayValue(proposed?.titles.original ?? null)}`,
      `- Alternatives: ${displayList(proposed?.titles.alternatives ?? [])}`,
      `- Format / year / episodes: ${displayValue(proposed?.format ?? null)} / ${displayValue(proposed?.releaseYear ?? null)} / ${displayValue(proposed?.episodeCount ?? null)}`,
      `- Status / maturity / state: ${displayValue(proposed?.releaseStatus ?? null)} / ${displayValue(proposed?.maturity ?? null)} / ${displayValue(proposed?.catalogueState ?? null)}`,
      `- Warnings: ${displayList(candidate.warnings)}`,
      `- Ignored provider values: ${displayList(candidate.ignoredValues)}`,
      `- Catalogue matches: ${
        candidate.matches.length === 0
          ? 'None'
          : candidate.matches
              .map(
                ({ catalogueItemId, reason }) =>
                  `${catalogueItemId} (${escapeMarkdown(reason)})`,
              )
              .join(' · ')
      }`,
      '',
    )
  }

  return `${lines.join('\n').trimEnd()}\n`
}
