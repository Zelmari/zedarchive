import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://placeholder:placeholder@localhost:5432/placeholder';

// On Cloudflare Workers, TCP sockets are bound to the specific request that created them.
// When connection pooling hands out a socket from an earlier request, workerd rejects
// the write with "Cannot perform I/O on behalf of a different request". Postgres.js then
// discards the stale socket, so a retry immediately establishes a fresh, working socket.
//
// Intercepting at the postgres client level guarantees that every query (Drizzle builders,
// relational queries, raw queries, transactions, and Better Auth adapter calls) automatically
// retries on stale socket errors.
const STALE_IO_MARKER = 'different request';
const MAX_RETRIES = 3;

function isStaleIoError(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current?.message === 'string' &&
      current.message.includes(STALE_IO_MARKER)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function createRetryingPostgresClient(connStr, options) {
  const rawClient = postgres(connStr, options);

  function wrapQueryFn(originalFn, ctx = rawClient) {
    return function retryingQuery(...args) {
      let attempt = 0;
      let currentQuery = null;

      function execute() {
        const queryPromise = originalFn.apply(ctx, args);
        if (!queryPromise || typeof queryPromise.then !== 'function') {
          return queryPromise;
        }
        currentQuery = queryPromise;

        const originalThen = queryPromise.then.bind(queryPromise);
        queryPromise.then = function (onFulfilled, onRejected) {
          return originalThen(
            onFulfilled,
            (err) => {
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
            }
          );
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
          return function retryingBegin(cb) {
            let attempt = 0;
            function runBegin() {
              return val.call(target, cb).catch((err) => {
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
      }
      return val;
    },
  });
}

// Disable prefetch as it is not supported for Supabase "Transaction" pooler mode.
// Tuned for serverless: bounded pool, short idle lifetime so isolates release connections.
export const client = createRetryingPostgresClient(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
});

export const db = drizzle(client, { schema });
