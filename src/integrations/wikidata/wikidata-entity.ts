import { z } from 'zod'

export const wikidataQidSchema = z
  .string()
  .regex(/^Q[1-9][0-9]*$/, 'Invalid Wikidata QID')

const wikidataLanguageValueSchema = z.object({
  language: z.string().min(1),
  value: z.string(),
})

export const wikidataStatementSchema = z.object({
  rank: z.enum(['preferred', 'normal', 'deprecated']),
  mainsnak: z.object({
    snaktype: z.enum(['value', 'somevalue', 'novalue']),
    property: z.string().regex(/^P[1-9][0-9]*$/),
    datatype: z.string().optional(),
    datavalue: z
      .object({
        value: z.unknown(),
        type: z.string(),
      })
      .optional(),
  }),
})

export type WikidataStatement = z.infer<typeof wikidataStatementSchema>

export const wikidataItemValueSchema = z.object({
  id: wikidataQidSchema,
  'entity-type': z.literal('item'),
})

export const wikidataMonolingualTextValueSchema = z.object({
  text: z.string(),
  language: z.string().min(1),
})

export const wikidataTimeValueSchema = z.object({
  time: z.string(),
  precision: z.number().int(),
  calendarmodel: z.string(),
})

export const wikidataQuantityValueSchema = z.object({
  amount: z.string(),
  unit: z.string(),
})

const wikidataEntitySchema = z.object({
  id: wikidataQidSchema,
  type: z.string().optional(),
  missing: z.union([z.literal(true), z.literal('')]).optional(),
  redirect: z.string().optional(),
  lastrevid: z.number().int().nonnegative().optional(),
  labels: z
    .record(z.string(), wikidataLanguageValueSchema)
    .optional()
    .default({}),
  aliases: z
    .record(z.string(), z.array(wikidataLanguageValueSchema))
    .optional()
    .default({}),
  claims: z.record(z.string(), z.array(z.unknown())).optional().default({}),
})

export const wikidataEntityResponseSchema = z.object({
  entities: z.record(wikidataQidSchema, wikidataEntitySchema),
})

export type WikidataEntity = z.infer<typeof wikidataEntitySchema>
export type WikidataEntityResponse = z.infer<
  typeof wikidataEntityResponseSchema
>

export function parseWikidataEntityResponse(
  input: unknown,
): WikidataEntityResponse {
  return wikidataEntityResponseSchema.parse(input)
}
