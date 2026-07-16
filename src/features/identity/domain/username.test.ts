import { describe, expect, it } from 'vitest'
import {
  blockedUsernameTerms,
  reservedUsernameTerms,
  usernameRestrictionExceptions,
} from '@/features/identity/domain/username-restrictions'
import {
  normalizeUsernameForIdentity,
  normalizeUsernameForRestriction,
  usernameMaximumLength,
  usernameMinimumLength,
  usernameSchema,
} from '@/features/identity/domain/username'

const restrictedUsernameTerms: readonly string[] = [
  ...reservedUsernameTerms,
  ...blockedUsernameTerms,
]

function insertSeparatorAfterFirstCharacter(
  value: string,
  separator: '-' | '_',
): string {
  return `${value.slice(0, 1)}${separator}${value.slice(1)}`
}

describe('usernameSchema', () => {
  it('uses the confirmed username length boundaries', () => {
    expect(usernameMinimumLength).toBe(3)
    expect(usernameMaximumLength).toBe(20)
  })

  it.each([
    'abc',
    'abcdefghijklmnopqrst',
    'mediafan',
    'MEDIA123',
    'MediaFan',
    'user-123',
    'user_123',
    'a-b',
    'a_b',
    'reader-anime_2',
  ])('accepts the valid username "%s"', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(true)
  })

  it.each(['MediaFan', 'Media-Fan_2', 'USER123'])(
    'returns the valid username "%s" without transformation',
    (username) => {
      expect(usernameSchema.parse(username)).toBe(username)
    },
  )

  it.each(['', 'a', 'ab', 'abcdefghijklmnopqrstu', 'a'.repeat(100)])(
    'rejects the unsupported username length in "%s"',
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false)
    },
  )

  it.each([
    ['internal space', 'user name'],
    ['leading whitespace', ' username'],
    ['trailing whitespace', 'username '],
    ['period', 'user.name'],
    ['slash', 'user/name'],
    ['at sign', 'user@name'],
    ['emoji', 'user😀'],
    ['accented letter', 'café'],
    ['non-Latin letters', 'ユーザー'],
  ])('rejects a username containing an %s', (_, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false)
  })

  it.each([
    ['leading hyphen', '-username'],
    ['leading underscore', '_username'],
    ['trailing hyphen', 'username-'],
    ['trailing underscore', 'username_'],
    ['hyphens at both boundaries', '-username-'],
    ['underscores at both boundaries', '_username_'],
  ])('rejects a username with a %s', (_, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false)
  })

  it.each([
    ['repeated hyphens', 'user--name'],
    ['repeated underscores', 'user__name'],
    ['hyphen followed by underscore', 'user-_name'],
    ['underscore followed by hyphen', 'user_-name'],
  ])('rejects a username with %s', (_, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 123],
    ['boolean', true],
    ['array', ['username']],
    ['object', { username: 'mediafan' }],
  ])('rejects a %s value', (_, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false)
  })

  it.each(restrictedUsernameTerms)(
    'rejects the restricted term "%s" as a complete username',
    (term) => {
      expect(usernameSchema.safeParse(term).success).toBe(false)
    },
  )

  it.each(restrictedUsernameTerms)(
    'rejects a case variant of the restricted term "%s"',
    (term) => {
      expect(usernameSchema.safeParse(term.toUpperCase()).success).toBe(false)
    },
  )

  it.each(restrictedUsernameTerms)(
    'rejects the restricted term "%s" with an inserted hyphen',
    (term) => {
      const username = insertSeparatorAfterFirstCharacter(term, '-')

      expect(usernameSchema.safeParse(username).success).toBe(false)
    },
  )

  it.each(restrictedUsernameTerms)(
    'rejects the restricted term "%s" with an inserted underscore',
    (term) => {
      const username = insertSeparatorAfterFirstCharacter(term, '_')

      expect(usernameSchema.safeParse(username).success).toBe(false)
    },
  )

  it.each(restrictedUsernameTerms)(
    'rejects the restricted term "%s" inside a longer username',
    (term) => {
      expect(usernameSchema.safeParse(`x${term}x`).success).toBe(false)
    },
  )

  it.each([
    ['badminton', 'badminton'],
    ['case and separator variant of badminton', 'Bad-Min-Ton'],
    ['groot', 'groot'],
    ['case and separator variant of groot', 'G-Root'],
  ])('accepts the exact %s exception', (_, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(true)
  })

  it.each(['badmintonfan', 'mybadminton', 'grootfan', 'mygroot'])(
    'does not extend an exception to the username "%s"',
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false)
    },
  )

  it('does not let an exception bypass username syntax', () => {
    expect(usernameSchema.safeParse('-badminton').success).toBe(false)
  })

  it('leaves number-to-letter substitutions untreated', () => {
    expect(usernameSchema.safeParse('adm1n').success).toBe(true)
  })
})

describe('normalizeUsernameForIdentity', () => {
  it.each([
    ['Zelmari', 'zelmari'],
    ['zelmari', 'zelmari'],
    ['Zel-Mari', 'zel-mari'],
    ['ZEL_MARI123', 'zel_mari123'],
  ])('normalizes "%s" to "%s"', (username, expected) => {
    expect(normalizeUsernameForIdentity(username)).toBe(expected)
  })
})

describe('normalizeUsernameForRestriction', () => {
  it.each([
    ['Zelmari', 'zelmari'],
    ['Zel-Mari', 'zelmari'],
    ['zel_mari', 'zelmari'],
    ['ad-min', 'admin'],
    ['SUP_PORT', 'support'],
    ['ZEL__-_MARI123', 'zelmari123'],
    ['adm1n', 'adm1n'],
  ])('normalizes "%s" to "%s"', (username, expected) => {
    expect(normalizeUsernameForRestriction(username)).toBe(expected)
  })
})

describe('username restriction configuration', () => {
  it('contains no duplicate restricted terms', () => {
    expect(new Set(restrictedUsernameTerms).size).toBe(
      restrictedUsernameTerms.length,
    )
  })

  it('contains no duplicate exceptions', () => {
    expect(new Set(usernameRestrictionExceptions).size).toBe(
      usernameRestrictionExceptions.length,
    )
  })

  it.each(restrictedUsernameTerms)(
    'stores the restricted term "%s" in canonical form',
    (term) => {
      expect(term).not.toBe('')
      expect(term).toMatch(/^[a-z0-9]+$/)
      expect(normalizeUsernameForRestriction(term)).toBe(term)
    },
  )

  it.each(usernameRestrictionExceptions)(
    'stores the exception "%s" in canonical form',
    (exception) => {
      expect(exception).not.toBe('')
      expect(exception).toMatch(/^[a-z0-9]+$/)
      expect(normalizeUsernameForRestriction(exception)).toBe(exception)
    },
  )

  it.each(usernameRestrictionExceptions)(
    'uses the exception "%s" for a real false positive',
    (exception) => {
      expect(
        restrictedUsernameTerms.some((term) => exception.includes(term)),
      ).toBe(true)
      expect(restrictedUsernameTerms).not.toContain(exception)
    },
  )
})
