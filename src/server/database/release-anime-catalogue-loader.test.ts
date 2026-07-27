import { describe, expect, it } from 'vitest'
import {
  assertReleaseTarget,
  parseReleaseAnimeCatalogueCommandArguments,
} from '@/server/database/release-anime-catalogue-loader'

describe('release anime catalogue command guards', () => {
  it('accepts only the four exact command shapes', () => {
    expect(parseReleaseAnimeCatalogueCommandArguments(['check'])).toEqual({
      mode: 'check',
    })
    expect(
      parseReleaseAnimeCatalogueCommandArguments([
        'apply',
        '--release',
        'anime-v1',
        '--sha256',
        'a'.repeat(64),
      ]),
    ).toEqual({ mode: 'apply', release: 'anime-v1', sha256: 'a'.repeat(64) })
    expect(() => parseReleaseAnimeCatalogueCommandArguments(['apply'])).toThrow(
      'Usage:',
    )
  })

  it('limits plan and rehearsal to the exact disposable target and rejects non-production apply names', () => {
    expect(() => assertReleaseTarget('plan', 'zedarchive_dev')).toThrow(
      'exact disposable',
    )
    expect(() => assertReleaseTarget('rehearse', 'zedarchive_test')).toThrow(
      'exact disposable',
    )
    expect(() =>
      assertReleaseTarget(
        'apply',
        'zedarchive_release_rehearsal',
        'zedarchive_release_rehearsal',
      ),
    ).toThrow('configured production')
    expect(() =>
      assertReleaseTarget('apply', 'zedarchive_prod', undefined),
    ).toThrow('configured production')
  })
})
