import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

if (!process.env.DATABASE_URL && !isDevOrTest && !isBuildPhase) {
  throw new Error(
    'DATABASE_URL is required in production. Configure it via Cloudflare dashboard vars before deploying.',
  );
}

const connectionString =
  process.env.DATABASE_URL || 'postgres://placeholder:placeholder@localhost:5432/placeholder';

// On Cloudflare Workers, TCP sockets are bound to the specific request that created them.
// When connection pooling hands out a socket from an earlier request, workerd rejects
// the write with "Cannot perform I/O on behalf of a different request". Postgres.js then
// discards the stale socket, so a retry immediately establishes a fresh, working socket.
//
// Intercepting at the postgres client level guarantees that every query (Drizzle builders,
// relational queries, raw queries, transactions, and Better Auth adapter calls) automatically
// retries on stale socket errors.
const STALE_IO_MARKER = 'different request';
const CONNECT_TIMEOUT_MARKER = 'CONNECT_TIMEOUT';
const MAX_RETRIES = 3;

export interface ErrorLike {
  message?: unknown;
  code?: unknown;
  cause?: unknown;
}

export function isStaleIoError(error: unknown): boolean {
  let current = error as ErrorLike | null | undefined;
  for (let depth = 0; current && depth <= 5; depth++) {
    if (
      (typeof current.message === 'string' &&
        (current.message.includes(STALE_IO_MARKER) ||
          current.message.includes(CONNECT_TIMEOUT_MARKER))) ||
      current.code === CONNECT_TIMEOUT_MARKER
    ) {
      return true;
    }
    current = current.cause as ErrorLike | null | undefined;
  }
  return false;
}

export type PostgresOptions = postgres.Options<Record<string, postgres.PostgresType<any>>>;

export const SHARED_POSTGRES_OPTIONS: PostgresOptions = {
  prepare: false,
  max: 2,
  idle_timeout: 5,
  max_lifetime: 60,
  connect_timeout: 5,
  fetch_types: false,
};

export const REQUEST_POSTGRES_OPTIONS: PostgresOptions = {
  prepare: false,
  max: 1,
  idle_timeout: 0,
  connect_timeout: 5,
  fetch_types: false,
};

export function createRetryingPostgresClient(
  connStr: string,
  options: PostgresOptions,
  postgresImpl: (connStr: string, options: PostgresOptions) => any = postgres as any,
): postgres.Sql<any> {
  const rawClient = postgresImpl(connStr, options);

  function wrapQueryFn(originalFn: any, ctx: any = rawClient) {
    return function retryingQuery(this: unknown, ...args: any[]) {
      let attempt = 0;
      let currentQuery: any = null;

      function execute(): any {
        const queryPromise = originalFn.apply(ctx, args);
        if (!queryPromise || typeof queryPromise.then !== 'function') {
          return queryPromise;
        }
        currentQuery = queryPromise;

        const originalThen = queryPromise.then.bind(queryPromise);
        queryPromise.then = function (onFulfilled: any, onRejected: any) {
          return originalThen(onFulfilled, (err: unknown) => {
            if (attempt < MAX_RETRIES && isStaleIoError(err)) {
              attempt++;
              const isRawMode = currentQuery?.isRaw;
              const nextPromise = execute();
              if (isRawMode === 'values') {
                nextPromise.values();
              } else if (isRawMode === true) {
                nextPromise.raw();
              }
              return nextPromise.then(onFulfilled, onRejected);
            }
            if (onRejected) return onRejected(err);
            throw err;
          });
        };
        return queryPromise;
      }
      return execute();
    };
  }

  return new Proxy(rawClient, {
    apply(target, thisArg, args) {
      return wrapQueryFn(target)(...args);
    },
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        if (prop === 'unsafe') {
          return wrapQueryFn(val);
        }
        if (prop === 'begin') {
          return function retryingBegin(cb: any) {
            let attempt = 0;
            function runBegin(): any {
              return val.call(target, cb).catch((err: unknown) => {
                if (attempt < MAX_RETRIES && isStaleIoError(err)) {
                  attempt++;
                  return runBegin();
                }
                throw err;
              });
            }
            return runBegin();
          };
        }
        if (prop === 'end') {
          return val.bind(target);
        }
        return val.bind(target);
      }
      return val;
    },
  }) as postgres.Sql<any>;
}

// Disable prefetch as it is not supported for Supabase "Transaction" pooler mode.
// Tuned for serverless: bounded pool, short idle lifetime so isolates release connections.
const client = createRetryingPostgresClient(connectionString, SHARED_POSTGRES_OPTIONS);

import { setDomainDb } from '@/domain/db-context';

// Cover grids fire many parallel requests. A pooled socket opened by another
// Workers request is rejected, so a request can pin its own single connection.
const requestDbStorage = new AsyncLocalStorage<postgres.Sql<any>>();
const drizzleBySql = new WeakMap<object, PostgresJsDatabase<typeof schema>>();
let sharedDb: PostgresJsDatabase<typeof schema> | undefined;

function drizzleFor(sql: postgres.Sql<any>): PostgresJsDatabase<typeof schema> {
  const cached = drizzleBySql.get(sql);
  if (cached) return cached;
  const instance = drizzle(sql, { schema });
  drizzleBySql.set(sql, instance);
  return instance;
}

function activeDb(): PostgresJsDatabase<typeof schema> {
  const requestSql = requestDbStorage.getStore();
  if (requestSql) return drizzleFor(requestSql);
  sharedDb ??= drizzle(client, { schema });
  return sharedDb;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop) {
      const real = activeDb();
      const value = Reflect.get(real, prop, real);
      if (typeof value === 'function') return value.bind(real);
      return value;
    },
  },
);
setDomainDb(db);

export async function withRequestDb<T>(
  fn: () => Promise<T>,
  clientFactory?: () => postgres.Sql<any>,
): Promise<T> {
  if (process.env.NODE_ENV === 'test' && !clientFactory) return fn();

  const sql = clientFactory
    ? clientFactory()
    : createRetryingPostgresClient(connectionString, REQUEST_POSTGRES_OPTIONS);

  let result!: T;
  let fnError: unknown;
  let threw = false;
  try {
    result = await requestDbStorage.run(sql, fn);
  } catch (error) {
    fnError = error;
    threw = true;
  } finally {
    try {
      await sql.end({ timeout: 1 });
    } catch (endError) {
      if (!threw) {
        fnError = endError;
        threw = true;
      }
    }
  }
  if (threw) throw fnError;
  return result;
}
