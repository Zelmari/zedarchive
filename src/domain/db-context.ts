import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

export type SchemaType = typeof schema;
export type DbClient =
  | PostgresJsDatabase<SchemaType>
  | Parameters<Parameters<PostgresJsDatabase<SchemaType>['transaction']>[0]>[0];

let _db: DbClient | null = null;

export function setDomainDb(db: DbClient): void {
  _db = db;
}

export function domainDb(): DbClient {
  if (!_db) {
    throw new Error(
      'Domain database client has not been initialized. Call setDomainDb(db) at process startup.',
    );
  }
  return _db;
}
