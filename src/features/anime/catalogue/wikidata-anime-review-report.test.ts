import { describe, expect, it } from 'vitest'
import {
  createWikidataAnimeReviewArtifact,
  parseWikidataAnimeCandidateManifest,
  sha256,
} from '@/features/anime/catalogue/wikidata-anime-import'
import { formatWikidataAnimeReviewMarkdown } from '@/features/anime/catalogue/wikidata-anime-review-report'

describe('Wikidata anime human review report', () => {
  it('shows every review-critical field without exposing raw Markdown or provider projections', () => {
    const manifest = parseWikidataAnimeCandidateManifest({
      version: 1,
      sourceKey: 'wikidata',
      candidates: [
        {
          catalogueItemId: '2bdfdaf5-e4be-4c6b-9863-a70bf21e1f40',
          sourceItemId: 'Q1',
          expectedEnglishLabel: 'Expected anime',
          intent: 'create',
          overrides: {
            romajiTitle: 'Reviewed Romaji',
            format: 'tv',
            releaseYear: 2020,
            episodeCount: 12,
            releaseStatus: 'finished',
            maturity: 'sensitive',
          },
        },
      ],
    })
    const artifact = createWikidataAnimeReviewArtifact({
      generatedAt: new Date('2026-07-17T00:00:00.000Z'),
      manifestSha256: sha256('manifest'),
      snapshot: { items: [] },
      manifest,
      entities: {
        Q1: {
          id: 'Q1',
          type: 'item',
          labels: {
            en: { language: 'en', value: '<script>|Example anime' },
          },
          aliases: {
            en: [{ language: 'en', value: '*unexpected alias*' }],
          },
          claims: {
            P31: [
              {
                rank: 'normal',
                mainsnak: {
                  snaktype: 'value',
                  property: 'P31',
                  datatype: 'wikibase-item',
                  datavalue: {
                    type: 'wikibase-entityid',
                    value: { id: 'Q63952888', 'entity-type': 'item' },
                  },
                },
              },
            ],
          },
        },
      },
    })

    const report = formatWikidataAnimeReviewMarkdown(artifact)

    expect(report).toContain('## 1. &lt;script&gt;\\|Example anime')
    expect(report).toContain('Romaji: Reviewed Romaji')
    expect(report).toContain('Alternatives: \\*unexpected alias\\*')
    expect(report).toContain('tv / 2020 / 12')
    expect(report).toContain('finished / sensitive / draft')
    expect(report).toContain('differs from expected label')
    expect(report).not.toContain('<script>')
    expect(report).not.toContain('providerProjection')
  })
})
