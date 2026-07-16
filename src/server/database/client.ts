import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
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
