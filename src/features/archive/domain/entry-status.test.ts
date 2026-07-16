import { describe, expect, it } from 'vitest'
import {
  entryStatusSchema,
  entryStatusValues,
} from '@/features/archive/domain/entry-status'

describe('entryStatusSchema', () => {
  it.each(entryStatusValues)('accepts the canonical "%s" status', (status) => {
    expect(entryStatusSchema.parse(status)).toBe(status)
  })

  it.each([
    '',
    'unknown',
    'watching',
    'reading',
    ' planned',
    'planned ',
    'PLANNED',
    'in-progress',
  ])('rejects the noncanonical string "%s"', (status) => {
    expect(entryStatusSchema.safeParse(status).success).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 1],
    ['boolean', true],
    ['array', ['planned']],
    ['object', { status: 'planned' }],
  ])('rejects a %s value', (_, status) => {
    expect(entryStatusSchema.safeParse(status).success).toBe(false)
  })
})
