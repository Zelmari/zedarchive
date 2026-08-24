import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString = process.env.DATABASE_URL;

// Disable prefetch as it is not supported for Supabase "Transaction" pooler mode
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });