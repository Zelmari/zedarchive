import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { botEnv } from './env';
import { setDomainDb } from '@/domain/db-context';

export const sqlClient = postgres(botEnv.DATABASE_URL, {
  prepare: false,
  max: 10,
  idle_timeout: 30,
});

export const botDb = drizzle(sqlClient, { schema });

// Inject into domain context
setDomainDb(botDb as any);
