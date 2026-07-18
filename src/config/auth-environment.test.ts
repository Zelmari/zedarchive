import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { readAuthEnvironment } from '@/config/auth-environment'

const validSecret = 'ci-disposable-better-auth-secret-32chars-min'
const shortSecret = 'too-short-auth-secret-value'
const localAuthUrl = 'http://localhost:3000'
const loopbackAuthUrl = 'http://127.0.0.1:3000'
const productionAuthUrl = 'https://archive.example.com'

function createValidEnvironment(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    BETTER_AUTH_SECRET: validSecret,
    BETTER_AUTH_URL: localAuthUrl,
    ...overrides,
  }
}

describe('readAuthEnvironment', () => {
  it('accepts a valid local auth environment', () => {
    expect(readAuthEnvironment(createValidEnvironment())).toEqual({
      authSecret: validSecret,
      authUrl: localAuthUrl,
    })
  })

  it.each([
    localAuthUrl,
    loopbackAuthUrl,
    'http://localhost',
    'http://127.0.0.1',
    productionAuthUrl,
    'https://archive.example.com:8443',
  ])('accepts the auth origin %s', (authUrl) => {
    expect(
      readAuthEnvironment(
        createValidEnvironment({
          BETTER_AUTH_URL: authUrl,
        }),
      ),
    ).toEqual({
      authSecret: validSecret,
      authUrl,
    })
  })

  it('accepts a secret with exactly 32 characters', () => {
    const boundarySecret = 'abcdefghijklmnopqrstuvwxyz123456'

    expect(
      readAuthEnvironment(
        createValidEnvironment({
          BETTER_AUTH_SECRET: boundarySecret,
        }),
      ),
    ).toEqual({
      authSecret: boundarySecret,
      authUrl: localAuthUrl,
    })
  })

  describe('BETTER_AUTH_TRUSTED_ORIGINS rejection', () => {
    it.each([
      [
        'string value',
        { BETTER_AUTH_TRUSTED_ORIGINS: 'https://evil.example.com' },
      ],
      ['empty string', { BETTER_AUTH_TRUSTED_ORIGINS: '' }],
      ['number', { BETTER_AUTH_TRUSTED_ORIGINS: 1 }],
      ['null', { BETTER_AUTH_TRUSTED_ORIGINS: null }],
    ])('rejects a %s without echoing it', (label, environment) => {
      const forbiddenValue = (environment as Readonly<Record<string, unknown>>)
        .BETTER_AUTH_TRUSTED_ORIGINS
      const input = createValidEnvironment(environment)

      expect(() => readAuthEnvironment(input)).toThrow(
        'BETTER_AUTH_TRUSTED_ORIGINS must not be set',
      )

      if (typeof forbiddenValue === 'string' && forbiddenValue.length > 0) {
        try {
          readAuthEnvironment(input)
        } catch (error) {
          expect(error).toEqual(
            expect.objectContaining({
              message: expect.not.stringContaining(forbiddenValue),
            }),
          )
        }
      }
    })
  })

  it('ignores unrelated environment values', () => {
    expect(
      readAuthEnvironment({
        ...createValidEnvironment(),
        DATABASE_URL:
          'postgresql://archive_app:password@localhost:5432/archive_dev',
        HOME: '/Users/example',
        NODE_ENV: 'test',
        PATH: '/usr/bin',
      }),
    ).toEqual({
      authSecret: validSecret,
      authUrl: localAuthUrl,
    })
  })

  describe('BETTER_AUTH_SECRET validation', () => {
    it.each([
      ['missing value', { BETTER_AUTH_URL: localAuthUrl }],
      ['empty string', { BETTER_AUTH_SECRET: '' }],
      ['whitespace-only string', { BETTER_AUTH_SECRET: '   ' }],
      ['leading whitespace', { BETTER_AUTH_SECRET: ` ${validSecret}` }],
      ['trailing whitespace', { BETTER_AUTH_SECRET: `${validSecret} ` }],
      ['31 characters', { BETTER_AUTH_SECRET: shortSecret }],
      ['number', { BETTER_AUTH_SECRET: 32 }],
      ['null', { BETTER_AUTH_SECRET: null }],
      ['undefined', { BETTER_AUTH_SECRET: undefined }],
    ])('rejects a %s', (label, environment) => {
      const input =
        label === 'missing value'
          ? environment
          : createValidEnvironment(
              environment as Readonly<Record<string, unknown>>,
            )

      expect(() => readAuthEnvironment(input)).toThrow()
    })

    it.each([
      [
        'missing value',
        { BETTER_AUTH_URL: localAuthUrl },
        'BETTER_AUTH_SECRET must be a string',
      ],
      [
        'empty string',
        { BETTER_AUTH_SECRET: '' },
        'BETTER_AUTH_SECRET must be at least 32 characters',
      ],
      [
        'whitespace-only string',
        { BETTER_AUTH_SECRET: '   ' },
        'BETTER_AUTH_SECRET cannot contain surrounding whitespace',
      ],
      [
        'leading whitespace',
        { BETTER_AUTH_SECRET: ` ${validSecret}` },
        'BETTER_AUTH_SECRET cannot contain surrounding whitespace',
      ],
      [
        'trailing whitespace',
        { BETTER_AUTH_SECRET: `${validSecret} ` },
        'BETTER_AUTH_SECRET cannot contain surrounding whitespace',
      ],
      [
        '31 characters',
        { BETTER_AUTH_SECRET: shortSecret },
        'BETTER_AUTH_SECRET must be at least 32 characters',
      ],
      [
        'number',
        { BETTER_AUTH_SECRET: 32 },
        'BETTER_AUTH_SECRET must be a string',
      ],
      [
        'null',
        { BETTER_AUTH_SECRET: null },
        'BETTER_AUTH_SECRET must be a string',
      ],
      [
        'undefined',
        { BETTER_AUTH_SECRET: undefined },
        'BETTER_AUTH_SECRET must be a string',
      ],
    ])(
      'reports a privacy-safe error for a %s',
      (label, environment, message) => {
        const input =
          label === 'missing value'
            ? environment
            : createValidEnvironment(
                environment as Readonly<Record<string, unknown>>,
              )

        expect(() => readAuthEnvironment(input)).toThrow(message)
      },
    )

    it('does not expose the rejected secret in its error', () => {
      const secret = 'super-private-auth-secret-that-is-long-enough'

      expect(() =>
        readAuthEnvironment(
          createValidEnvironment({
            BETTER_AUTH_SECRET: ` ${secret}`,
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          message: expect.not.stringContaining(secret),
        }),
      )
    })
  })

  describe('BETTER_AUTH_URL validation', () => {
    it.each([
      ['missing value', { BETTER_AUTH_SECRET: validSecret }],
      ['empty string', { BETTER_AUTH_URL: '' }],
      ['whitespace-only string', { BETTER_AUTH_URL: '   ' }],
      ['leading whitespace', { BETTER_AUTH_URL: ` ${localAuthUrl}` }],
      ['trailing whitespace', { BETTER_AUTH_URL: `${localAuthUrl} ` }],
      [
        'credentialed URL',
        { BETTER_AUTH_URL: 'https://user:pass@localhost:3000' },
      ],
      [
        'path suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com/api/auth' },
      ],
      [
        'query suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com?next=/' },
      ],
      [
        'fragment suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com#section' },
      ],
      ['trailing slash', { BETTER_AUTH_URL: 'https://archive.example.com/' }],
      [
        'explicit default HTTPS port',
        { BETTER_AUTH_URL: 'https://archive.example.com:443' },
      ],
      [
        'explicit default HTTP port on loopback',
        { BETTER_AUTH_URL: 'http://localhost:80' },
      ],
      [
        'non-loopback HTTP origin',
        { BETTER_AUTH_URL: 'http://archive.example.com' },
      ],
      ['FTP URL', { BETTER_AUTH_URL: 'ftp://archive.example.com' }],
      ['relative text', { BETTER_AUTH_URL: 'localhost:3000' }],
      ['malformed URL', { BETTER_AUTH_URL: 'https://' }],
      ['number', { BETTER_AUTH_URL: 3000 }],
      ['null', { BETTER_AUTH_URL: null }],
      ['undefined', { BETTER_AUTH_URL: undefined }],
    ])('rejects a %s', (label, environment) => {
      const input =
        label === 'missing value'
          ? environment
          : createValidEnvironment(
              environment as Readonly<Record<string, unknown>>,
            )

      expect(() => readAuthEnvironment(input)).toThrow()
    })

    it.each([
      [
        'missing value',
        { BETTER_AUTH_SECRET: validSecret },
        'BETTER_AUTH_URL must be a string',
      ],
      [
        'empty string',
        { BETTER_AUTH_URL: '' },
        'BETTER_AUTH_URL must be a valid absolute origin',
      ],
      [
        'whitespace-only string',
        { BETTER_AUTH_URL: '   ' },
        'BETTER_AUTH_URL cannot contain surrounding whitespace',
      ],
      [
        'leading whitespace',
        { BETTER_AUTH_URL: ` ${localAuthUrl}` },
        'BETTER_AUTH_URL cannot contain surrounding whitespace',
      ],
      [
        'trailing whitespace',
        { BETTER_AUTH_URL: `${localAuthUrl} ` },
        'BETTER_AUTH_URL cannot contain surrounding whitespace',
      ],
      [
        'credentialed URL',
        { BETTER_AUTH_URL: 'https://user:pass@localhost:3000' },
        'BETTER_AUTH_URL cannot include credentials',
      ],
      [
        'path suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com/api/auth' },
        'BETTER_AUTH_URL must not include a path',
      ],
      [
        'query suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com?next=/' },
        'BETTER_AUTH_URL must not include a query',
      ],
      [
        'fragment suffix',
        { BETTER_AUTH_URL: 'https://archive.example.com#section' },
        'BETTER_AUTH_URL must not include a fragment',
      ],
      [
        'trailing slash',
        { BETTER_AUTH_URL: 'https://archive.example.com/' },
        'BETTER_AUTH_URL must be a canonical origin without trailing slash',
      ],
      [
        'explicit default HTTPS port',
        { BETTER_AUTH_URL: 'https://archive.example.com:443' },
        'BETTER_AUTH_URL must be a canonical origin without trailing slash',
      ],
      [
        'explicit default HTTP port on loopback',
        { BETTER_AUTH_URL: 'http://localhost:80' },
        'BETTER_AUTH_URL must be a canonical origin without trailing slash',
      ],
      [
        'non-loopback HTTP origin',
        { BETTER_AUTH_URL: 'http://archive.example.com' },
        'BETTER_AUTH_URL must use https for non-loopback hosts',
      ],
      [
        'FTP URL',
        { BETTER_AUTH_URL: 'ftp://archive.example.com' },
        'BETTER_AUTH_URL must use http or https',
      ],
      [
        'relative text',
        { BETTER_AUTH_URL: 'localhost:3000' },
        'BETTER_AUTH_URL must use http or https',
      ],
      [
        'malformed URL',
        { BETTER_AUTH_URL: 'https://' },
        'BETTER_AUTH_URL must be a valid absolute origin',
      ],
      ['number', { BETTER_AUTH_URL: 3000 }, 'BETTER_AUTH_URL must be a string'],
      ['null', { BETTER_AUTH_URL: null }, 'BETTER_AUTH_URL must be a string'],
      [
        'undefined',
        { BETTER_AUTH_URL: undefined },
        'BETTER_AUTH_URL must be a string',
      ],
    ])(
      'reports a privacy-safe error for a %s',
      (label, environment, message) => {
        const input =
          label === 'missing value'
            ? environment
            : createValidEnvironment(
                environment as Readonly<Record<string, unknown>>,
              )

        expect(() => readAuthEnvironment(input)).toThrow(message)
      },
    )

    it('does not expose the rejected URL in its error', () => {
      const sensitiveUrl = 'https://archive.example.com/private-path'

      expect(() =>
        readAuthEnvironment(
          createValidEnvironment({
            BETTER_AUTH_URL: sensitiveUrl,
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          message: expect.not.stringContaining(sensitiveUrl),
        }),
      )
    })
  })
})
