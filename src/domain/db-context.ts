import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

type SchemaType = typeof schema;
export type DbClient =
  | PostgresJsDatabase<SchemaType>
  | Parameters<Parameters<PostgresJsDatabase<SchemaType>['transaction']>[0]>[0];

let _db: DbClient | null = null;

// Confirm and undo bind the domain client to one transaction. The binding is
// per async context so a second request cannot write through the first one's transaction.
const transactionScope = new AsyncLocalStorage<DbClient>();

export function setDomainDb(db: DbClient): void {
  _db = db;
}

export function domainDb(): DbClient {
  const scoped = transactionScope.getStore();
  if (scoped) return scoped;
  if (!_db) {
    throw new Error(
      'Domain database client has not been initialized. Call setDomainDb(db) at process startup.',
    );
  }
  return _db;
}

export function runWithDomainDb<T>(db: DbClient, fn: () => Promise<T>): Promise<T> {
  return transactionScope.run(db, fn);
}
