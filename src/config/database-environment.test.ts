import { describe, expect, it } from 'vitest'
import {
  readDatabaseMigrationEnvironment,
  readDatabaseRuntimeEnvironment,
} from '@/config/database-environment'

const runtimeUrl =
  'postgresql://archive_app:runtime-password@localhost:5432/archive_dev'
const migrationUrl =
  'postgresql://archive_app:migration-password@localhost:5432/archive_dev'

describe('readDatabaseRuntimeEnvironment', () => {
  it.each([
    runtimeUrl,
    'postgres://archive_app:runtime-password@localhost:5432/archive_dev',
  ])('accepts the PostgreSQL connection URL %s', (databaseUrl) => {
    expect(
      readDatabaseRuntimeEnvironment({
        DATABASE_URL: databaseUrl,
      }),
    ).toEqual({ databaseUrl })
  })

  it.each([
    ['missing value', {}],
    ['empty string', { DATABASE_URL: '' }],
    ['whitespace-only string', { DATABASE_URL: '   ' }],
    ['leading whitespace', { DATABASE_URL: ` ${runtimeUrl}` }],
    ['trailing whitespace', { DATABASE_URL: `${runtimeUrl} ` }],
    ['HTTP URL', { DATABASE_URL: 'https://localhost/archive_dev' }],
    ['file URL', { DATABASE_URL: 'file:///archive_dev' }],
    ['relative text', { DATABASE_URL: 'localhost/archive_dev' }],
    ['hostless PostgreSQL URL', { DATABASE_URL: 'postgresql:archive_dev' }],
    [
      'database-less PostgreSQL URL',
      { DATABASE_URL: 'postgresql://localhost' },
    ],
    ['number', { DATABASE_URL: 5432 }],
    ['null', { DATABASE_URL: null }],
    ['undefined', { DATABASE_URL: undefined }],
  ])('rejects a %s', (_, environment) => {
    expect(() => readDatabaseRuntimeEnvironment(environment)).toThrow(
      'DATABASE_URL must be a valid PostgreSQL connection URL',
    )
  })

  it('ignores unrelated environment values', () => {
    expect(
      readDatabaseRuntimeEnvironment({
        DATABASE_URL: runtimeUrl,
        HOME: '/Users/example',
        NODE_ENV: 'test',
        PATH: '/usr/bin',
      }),
    ).toEqual({ databaseUrl: runtimeUrl })
  })

  it('does not expose the rejected credential in its error', () => {
    const secret = 'do-not-print-this-password'

    expect(() =>
      readDatabaseRuntimeEnvironment({
        DATABASE_URL: `https://archive_app:${secret}@localhost/archive_dev`,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(secret),
      }),
    )
  })
})

describe('readDatabaseMigrationEnvironment', () => {
  it.each([
    migrationUrl,
    'postgres://archive_app:migration-password@localhost:5432/archive_dev',
  ])('accepts the PostgreSQL connection URL %s', (databaseMigrationUrl) => {
    expect(
      readDatabaseMigrationEnvironment({
        DATABASE_MIGRATION_URL: databaseMigrationUrl,
      }),
    ).toEqual({ databaseMigrationUrl })
  })

  it('requires the migration URL even when the runtime URL exists', () => {
    expect(() =>
      readDatabaseMigrationEnvironment({
        DATABASE_URL: runtimeUrl,
      }),
    ).toThrow(
      'DATABASE_MIGRATION_URL must be a valid PostgreSQL connection URL',
    )
  })

  it.each([
    ['missing value', {}],
    ['empty string', { DATABASE_MIGRATION_URL: '' }],
    ['whitespace-only string', { DATABASE_MIGRATION_URL: '   ' }],
    ['leading whitespace', { DATABASE_MIGRATION_URL: ` ${migrationUrl}` }],
    ['trailing whitespace', { DATABASE_MIGRATION_URL: `${migrationUrl} ` }],
    ['HTTP URL', { DATABASE_MIGRATION_URL: 'https://localhost/archive_dev' }],
    ['file URL', { DATABASE_MIGRATION_URL: 'file:///archive_dev' }],
    ['relative text', { DATABASE_MIGRATION_URL: 'localhost/archive_dev' }],
    [
      'hostless PostgreSQL URL',
      { DATABASE_MIGRATION_URL: 'postgresql:archive_dev' },
    ],
    [
      'database-less PostgreSQL URL',
      { DATABASE_MIGRATION_URL: 'postgresql://localhost' },
    ],
    ['number', { DATABASE_MIGRATION_URL: 5432 }],
    ['null', { DATABASE_MIGRATION_URL: null }],
    ['undefined', { DATABASE_MIGRATION_URL: undefined }],
  ])('rejects a %s', (_, environment) => {
    expect(() => readDatabaseMigrationEnvironment(environment)).toThrow(
      'DATABASE_MIGRATION_URL must be a valid PostgreSQL connection URL',
    )
  })

  it('ignores unrelated environment values', () => {
    expect(
      readDatabaseMigrationEnvironment({
        DATABASE_MIGRATION_URL: migrationUrl,
        DATABASE_URL: runtimeUrl,
        HOME: '/Users/example',
        NODE_ENV: 'test',
      }),
    ).toEqual({ databaseMigrationUrl: migrationUrl })
  })

  it('does not expose the rejected credential in its error', () => {
    const secret = 'do-not-print-this-password'

    expect(() =>
      readDatabaseMigrationEnvironment({
        DATABASE_MIGRATION_URL: `https://archive_app:${secret}@localhost/archive_dev`,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(secret),
      }),
    )
  })
})
