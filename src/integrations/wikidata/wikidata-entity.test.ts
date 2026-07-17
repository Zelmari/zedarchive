import { describe, expect, it } from 'vitest'
import {
  parseWikidataEntityResponse,
  wikidataStatementSchema,
} from '@/integrations/wikidata/wikidata-entity'

describe('Wikidata provider response validation', () => {
  it('accepts the consumed entity boundary while tolerating unrelated upstream fields', () => {
    const parsed = parseWikidataEntityResponse({
      unrelatedTopLevelField: true,
      entities: {
        Q1: {
          id: 'Q1',
          type: 'item',
          lastrevid: 123,
          descriptions: { en: { language: 'en', value: 'not consumed' } },
          labels: {
            en: {
              language: 'en',
              value: 'Example',
              unrelatedLanguageValueField: true,
            },
          },
          aliases: {},
          claims: {
            P999: [{ arbitrary: 'ignored until explicitly consumed' }],
          },
        },
      },
    })

    expect(parsed.entities.Q1).toMatchObject({
      id: 'Q1',
      type: 'item',
      lastrevid: 123,
      labels: { en: { language: 'en', value: 'Example' } },
    })
  })

  it.each([
    { entities: [] },
    { entities: { Q1: { id: 1 } } },
    {
      entities: {
        Q1: { id: 'Q1', labels: { en: { value: 'Missing language' } } },
      },
    },
    { entities: { bad: { id: 'Q1' } } },
  ])('rejects malformed consumed response fields', (input) => {
    expect(() => parseWikidataEntityResponse(input)).toThrow()
  })

  it('validates statement rank, snak kind, property, and datavalue envelope', () => {
    expect(
      wikidataStatementSchema.parse({
        rank: 'preferred',
        mainsnak: {
          snaktype: 'somevalue',
          property: 'P31',
          datatype: 'wikibase-item',
        },
      }),
    ).toBeDefined()
    expect(() =>
      wikidataStatementSchema.parse({
        rank: 'trusted',
        mainsnak: { snaktype: 'value', property: 'not-a-property' },
      }),
    ).toThrow()
  })
})
