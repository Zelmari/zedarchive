import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { readDatabaseTestEnvironment } from '@/config/database-environment'

const expectedTestDatabaseName = 'zedarchive_test'

export function assertSafeTestDatabaseName(
  databaseName: string | undefined,
): void {
  if (databaseName !== expectedTestDatabaseName) {
    throw new Error(
      `Database integration setup refused to reset "${databaseName ?? 'unknown'}"; expected "${expectedTestDatabaseName}"`,
    )
  }
}

export default async function setupDatabaseIntegrationTests(): Promise<void> {
  const { databaseTestUrl } = readDatabaseTestEnvironment()
  const pool = new Pool({ connectionString: databaseTestUrl })

  try {
    const result = await pool.query<{ databaseName: string }>(
      'select current_database() as "databaseName"',
    )
    const databaseName = result.rows[0]?.databaseName

    assertSafeTestDatabaseName(databaseName)

    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await pool.query('DROP SCHEMA public CASCADE')
    await pool.query('CREATE SCHEMA public')

    const database = drizzle({ client: pool })
    await migrate(database, { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }
}
