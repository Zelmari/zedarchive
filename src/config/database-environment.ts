import { z } from 'zod'

type Environment = Readonly<Record<string, unknown>>

const postgresConnectionUrlSchema = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: 'custom',
      message: 'Connection URLs cannot contain surrounding whitespace',
    })

    return
  }

  let connectionUrl: URL

  try {
    connectionUrl = new URL(value)
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Connection URLs must use URL syntax',
    })

    return
  }

  if (
    connectionUrl.protocol !== 'postgresql:' &&
    connectionUrl.protocol !== 'postgres:'
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Connection URLs must use a PostgreSQL protocol',
    })

    return
  }

  if (
    connectionUrl.hostname.length === 0 ||
    connectionUrl.pathname.length <= 1
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Connection URLs must include a host and database name',
    })
  }
})

const runtimeEnvironmentSchema = z.strictObject({
  DATABASE_URL: postgresConnectionUrlSchema,
})

const migrationEnvironmentSchema = z.strictObject({
  DATABASE_MIGRATION_URL: postgresConnectionUrlSchema,
})

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  environment: Environment,
  variableName: 'DATABASE_URL' | 'DATABASE_MIGRATION_URL',
): T {
  const result = schema.safeParse({
    [variableName]: environment[variableName],
  })

  if (!result.success) {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL`)
  }

  return result.data
}

export function readDatabaseRuntimeEnvironment(
  environment: Environment = process.env,
): { databaseUrl: string } {
  const { DATABASE_URL } = parseEnvironment(
    runtimeEnvironmentSchema,
    environment,
    'DATABASE_URL',
  )

  return {
    databaseUrl: DATABASE_URL,
  }
}

export function readDatabaseMigrationEnvironment(
  environment: Environment = process.env,
): { databaseMigrationUrl: string } {
  const { DATABASE_MIGRATION_URL } = parseEnvironment(
    migrationEnvironmentSchema,
    environment,
    'DATABASE_MIGRATION_URL',
  )

  return {
    databaseMigrationUrl: DATABASE_MIGRATION_URL,
  }
}
