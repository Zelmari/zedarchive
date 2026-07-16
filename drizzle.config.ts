import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { readDatabaseMigrationEnvironment } from './src/config/database-environment'

const { databaseMigrationUrl } = readDatabaseMigrationEnvironment()

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseMigrationUrl,
  },
})
