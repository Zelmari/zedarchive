import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
import { readDatabaseRuntimeEnvironment } from '@/config/database-environment'

const { databaseUrl } = readDatabaseRuntimeEnvironment()

const globalForDatabase = globalThis as typeof globalThis & {
  archiveDatabasePool?: Pool
}

const pool =
  globalForDatabase.archiveDatabasePool ??
  new Pool({
    connectionString: databaseUrl,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.archiveDatabasePool = pool
}

export const database = drizzle({ client: pool })

export type DedicatedDatabaseClient = Readonly<{
  client: PoolClient
  database: NodePgDatabase
}>

/**
 * Session-scoped PostgreSQL locks must stay on one checked-out connection.
 * Callers report whether it is safe to return that connection to the pool.
 */
export async function withDedicatedDatabaseClient<T>(
  operation: (
    dedicatedClient: DedicatedDatabaseClient,
  ) => Promise<Readonly<{ value: T; connectionSafe: boolean }>>,
): Promise<T> {
  const client = await pool.connect()
  let connectionSafe = false

  try {
    const result = await operation({
      client,
      database: drizzle({ client }),
    })
    connectionSafe = result.connectionSafe
    return result.value
  } finally {
    // Destroy instead of reusing a session whose advisory-lock state is unknown.
    client.release(
      connectionSafe
        ? undefined
        : new Error('Unsafe database connection state'),
    )
  }
}
