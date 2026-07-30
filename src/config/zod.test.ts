import { describe, expect, it } from 'vitest'
import { z } from '@/config/zod'

describe('Zod configuration', () => {
  it('keeps validation in strict-CSP-compatible jitless mode', () => {
    expect(z.config().jitless).toBe(true)
    expect(
      z.object({ value: z.string() }).safeParse({ value: 'archive' }),
    ).toEqual({
      success: true,
      data: { value: 'archive' },
    })
  })
})
