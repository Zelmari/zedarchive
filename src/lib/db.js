import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Set it in the build environment before building or deploying ' +
      '(OpenNext inlines process.env values at build time).'
  );
}

// Disable prefetch as it is not supported for Supabase "Transaction" pooler mode.
// Tuned for serverless: bounded pool, short idle lifetime so isolates release connections.
const client = postgres(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
});

export const db = drizzle(client, { schema });