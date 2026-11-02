import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuthGet, mockAuthPost } = vi.hoisted(() => ({
  mockAuthGet: vi.fn(),
  mockAuthPost: vi.fn(),
}));

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: mockAuthGet,
    POST: mockAuthPost,
  })),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withRequestDb: vi.fn(actual.withRequestDb),
  };
});

import {
  SHARED_POSTGRES_OPTIONS,
  REQUEST_POSTGRES_OPTIONS,
  isStaleIoError,
  createRetryingPostgresClient,
  withRequestDb,
} from '@/lib/db';
import { GET, POST } from '@/app/api/auth/[...all]/route';

// Helper to simulate Postgres.js PendingQuery builders
class MockPendingQuery {
  isRaw?: boolean | string;
  private promise: Promise<any>;

  constructor(executor: () => Promise<any>) {
    this.promise = executor();
  }

  values() {
    this.isRaw = 'values';
    return this;
  }

  raw() {
    this.isRaw = true;
    return this;
  }

  then(onFulfilled?: any, onRejected?: any) {
    return this.promise.then(onFulfilled, onRejected);
  }

  catch(onRejected?: any) {
    return this.promise.catch(onRejected);
  }
}

describe('Postgres Configuration Options', () => {
  it('SHARED_POSTGRES_OPTIONS specifies bounded pool, connect_timeout, fetch_types false, and prepare false', () => {
    expect(SHARED_POSTGRES_OPTIONS).toMatchObject({
      prepare: false,
      max: 2,
      idle_timeout: 5,
      max_lifetime: 60,
      connect_timeout: 5,
      fetch_types: false,
    });
  });

  it('REQUEST_POSTGRES_OPTIONS specifies single connection, zero idle timeout, connect_timeout, and prepare false', () => {
    expect(REQUEST_POSTGRES_OPTIONS).toMatchObject({
      prepare: false,
      max: 1,
      idle_timeout: 0,
      connect_timeout: 5,
      fetch_types: false,
    });
  });
});

describe('isStaleIoError', () => {
  it('matches direct "different request" error message', () => {
    const error = new Error('Cannot perform I/O on behalf of a different request');
    expect(isStaleIoError(error)).toBe(true);
  });

  it('matches direct CONNECT_TIMEOUT error message', () => {
    const error = new Error('Connection failed: CONNECT_TIMEOUT');
    expect(isStaleIoError(error)).toBe(true);
  });

  it('matches error objects with code: "CONNECT_TIMEOUT"', () => {
    const error = { code: 'CONNECT_TIMEOUT', message: 'Socket connection timed out' };
    expect(isStaleIoError(error)).toBe(true);
  });

  it('matches nested .cause errors up to depth 5', () => {
    // Depth 1
    const depth1 = new Error('Outer error', {
      cause: new Error('Cannot perform I/O on behalf of a different request'),
    });
    expect(isStaleIoError(depth1)).toBe(true);

    // Depth 2
    const depth2 = new Error('Level 0', {
      cause: new Error('Level 1', {
        cause: { code: 'CONNECT_TIMEOUT' },
      }),
    });
    expect(isStaleIoError(depth2)).toBe(true);

    // Depth 3
    const depth3 = new Error('Level 0', {
      cause: new Error('Level 1', {
        cause: new Error('Level 2', {
          cause: new Error('CONNECT_TIMEOUT during handshake'),
        }),
      }),
    });
    expect(isStaleIoError(depth3)).toBe(true);

    // Depth 4
    const depth4 = new Error('Level 0', {
      cause: new Error('Level 1', {
        cause: new Error('Level 2', {
          cause: new Error('Level 3', {
            cause: { code: 'CONNECT_TIMEOUT' },
          }),
        }),
      }),
    });
    expect(isStaleIoError(depth4)).toBe(true);

    // Depth 5
    const depth5 = new Error('Level 0', {
      cause: new Error('Level 1', {
        cause: new Error('Level 2', {
          cause: new Error('Level 3', {
            cause: new Error('Level 4', {
              cause: new Error('different request encountered'),
            }),
          }),
        }),
      }),
    });
    expect(isStaleIoError(depth5)).toBe(true);
  });

  it('returns false when matching error is beyond depth 5', () => {
    // 6 causes deep (depth 6)
    const depth6 = new Error('Level 0', {
      cause: new Error('Level 1', {
        cause: new Error('Level 2', {
          cause: new Error('Level 3', {
            cause: new Error('Level 4', {
              cause: new Error('Level 5', {
                cause: new Error('different request'),
              }),
            }),
          }),
        }),
      }),
    });
    expect(isStaleIoError(depth6)).toBe(false);
  });

  it('returns false for ordinary SQL and constraint errors', () => {
    expect(
      isStaleIoError(
        new Error('duplicate key value violates unique constraint "users_email_unique"'),
      ),
    ).toBe(false);
    expect(isStaleIoError(new Error('relation "entries" does not exist'))).toBe(false);
    expect(isStaleIoError(new Error('syntax error at or near "SELECT"'))).toBe(false);
    expect(isStaleIoError({ code: '23505', message: 'unique_violation' })).toBe(false);
  });

  it('returns false for null, undefined, primitives, and unrelated objects', () => {
    expect(isStaleIoError(null)).toBe(false);
    expect(isStaleIoError(undefined)).toBe(false);
    expect(isStaleIoError('different request')).toBe(false);
    expect(isStaleIoError(12345)).toBe(false);
    expect(isStaleIoError({})).toBe(false);
    expect(isStaleIoError(new Error('something completely different'))).toBe(false);
  });
});

describe('createRetryingPostgresClient', () => {
  it('retries queries on stale I/O errors up to 3 times and resolves on success', async () => {
    let callCount = 0;
    const mockQueryFn = vi.fn((..._args: any[]) => {
      callCount++;
      if (callCount < 3) {
        return new MockPendingQuery(() =>
          Promise.reject(new Error('Cannot perform I/O on behalf of a different request')),
        );
      }
      return new MockPendingQuery(() => Promise.resolve([{ id: 42 }]));
    });

    const mockRawClient = Object.assign(mockQueryFn, {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const mockPostgresImpl = vi.fn().mockReturnValue(mockRawClient);
    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      mockPostgresImpl,
    );

    const result = await (client as any)`SELECT * FROM test`;
    expect(result).toEqual([{ id: 42 }]);
    expect(mockQueryFn).toHaveBeenCalledTimes(3);
  });

  it('retries queries on CONNECT_TIMEOUT up to 3 times and resolves on success', async () => {
    let callCount = 0;
    const mockQueryFn = vi.fn((..._args: any[]) => {
      callCount++;
      if (callCount < 2) {
        return new MockPendingQuery(() => Promise.reject({ code: 'CONNECT_TIMEOUT' }));
      }
      return new MockPendingQuery(() => Promise.resolve(['success']));
    });

    const mockRawClient = Object.assign(mockQueryFn, {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      SHARED_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    const result = await (client as any)`SELECT 1`;
    expect(result).toEqual(['success']);
    expect(mockQueryFn).toHaveBeenCalledTimes(2);
  });

  it('fails after exceeding MAX_RETRIES (3 retries = 4 total attempts)', async () => {
    let callCount = 0;
    const mockQueryFn = vi.fn((..._args: any[]) => {
      callCount++;
      return new MockPendingQuery(() =>
        Promise.reject(new Error('Cannot perform I/O on behalf of a different request')),
      );
    });

    const mockRawClient = Object.assign(mockQueryFn, {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    await expect((client as any)`SELECT 1`).rejects.toThrow('different request');
    expect(mockQueryFn).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry ordinary query errors and fails immediately', async () => {
    let callCount = 0;
    const mockQueryFn = vi.fn((..._args: any[]) => {
      callCount++;
      return new MockPendingQuery(() =>
        Promise.reject(new Error('relation "unknown_table" does not exist')),
      );
    });

    const mockRawClient = Object.assign(mockQueryFn, {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    await expect((client as any)`SELECT * FROM unknown_table`).rejects.toThrow(
      'relation "unknown_table" does not exist',
    );
    expect(mockQueryFn).toHaveBeenCalledTimes(1);
  });

  it('retries client.unsafe queries on stale I/O error', async () => {
    let callCount = 0;
    const mockUnsafe = vi.fn((..._args: any[]) => {
      callCount++;
      if (callCount === 1) {
        return new MockPendingQuery(() =>
          Promise.reject(new Error('different request encountered')),
        );
      }
      return new MockPendingQuery(() => Promise.resolve([{ count: 1 }]));
    });

    const mockRawClient = Object.assign(vi.fn(), {
      unsafe: mockUnsafe,
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    const result = await client.unsafe('SELECT count(*) FROM users');
    expect(result).toEqual([{ count: 1 }]);
    expect(mockUnsafe).toHaveBeenCalledTimes(2);
  });

  it('retries client.begin transaction on stale I/O error', async () => {
    let callCount = 0;
    const mockBegin = vi.fn(async (cb: any) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('different request');
      }
      return cb({});
    });

    const mockRawClient = Object.assign(vi.fn(), {
      unsafe: vi.fn(),
      begin: mockBegin,
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    const result = await client.begin(async () => 'transaction result');
    expect(result).toBe('transaction result');
    expect(mockBegin).toHaveBeenCalledTimes(2);
  });

  it('forwards .end({ timeout: 1 }) to the underlying client with proper binding', async () => {
    const endMock = vi.fn().mockResolvedValue('ended-successfully');
    const mockRawClient = Object.assign(vi.fn(), {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: endMock,
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    const endResult = await client.end({ timeout: 1 });
    expect(endResult).toBe('ended-successfully');
    expect(endMock).toHaveBeenCalledWith({ timeout: 1 });
  });

  it('preserves raw / values query mode across retries', async () => {
    let callCount = 0;
    const queriesCreated: MockPendingQuery[] = [];
    const mockQueryFn = vi.fn((..._args: any[]) => {
      callCount++;
      const query = new MockPendingQuery(() => {
        if (callCount === 1) {
          return Promise.reject(new Error('different request'));
        }
        return Promise.resolve([[1, 'title']]);
      });
      queriesCreated.push(query);
      return query;
    });

    const mockRawClient = Object.assign(mockQueryFn, {
      unsafe: vi.fn(),
      begin: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    });

    const client = createRetryingPostgresClient(
      'postgres://localhost:5432/test',
      REQUEST_POSTGRES_OPTIONS,
      () => mockRawClient,
    );

    const query = (client as any)`SELECT id, title FROM entries`.values();
    const result = await query;
    expect(result).toEqual([[1, 'title']]);
    expect(queriesCreated).toHaveLength(2);
    expect(queriesCreated[0].isRaw).toBe('values');
    expect(queriesCreated[1].isRaw).toBe('values');
  });
});

describe('withRequestDb lifecycle', () => {
  it('manages request-scoped connection and closes it cleanly after fn resolves', async () => {
    const endMock = vi.fn().mockResolvedValue(undefined);
    const mockSql = Object.assign(vi.fn(), {
      end: endMock,
    }) as any;

    const result = await withRequestDb(
      async () => {
        return 'scoped-result';
      },
      () => mockSql,
    );

    expect(result).toBe('scoped-result');
    expect(endMock).toHaveBeenCalledWith({ timeout: 1 });
  });

  it('closes connection cleanly and re-throws when fn throws', async () => {
    const endMock = vi.fn().mockResolvedValue(undefined);
    const mockSql = Object.assign(vi.fn(), {
      end: endMock,
    }) as any;

    await expect(
      withRequestDb(
        async () => {
          throw new Error('handler failed');
        },
        () => mockSql,
      ),
    ).rejects.toThrow('handler failed');

    expect(endMock).toHaveBeenCalledWith({ timeout: 1 });
  });

  it('bypasses connection pool in default test environment', async () => {
    const fn = vi.fn().mockResolvedValue('test-passthrough');
    const result = await withRequestDb(fn);
    expect(result).toBe('test-passthrough');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Better Auth route scoping (/api/auth/[...all])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET invokes withRequestDb and returns the underlying Better Auth response', async () => {
    const mockResponse = new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    mockAuthGet.mockResolvedValueOnce(mockResponse);

    const request = new Request('http://localhost:3000/api/auth/get-session');
    const response = await GET(request);

    expect(withRequestDb).toHaveBeenCalledTimes(1);
    expect(mockAuthGet).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
    expect(await response.json()).toEqual({ user: null });
  });

  it('POST invokes withRequestDb and returns the underlying Better Auth response', async () => {
    const mockResponse = new Response(JSON.stringify({ status: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    mockAuthPost.mockResolvedValueOnce(mockResponse);

    const request = new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request);

    expect(withRequestDb).toHaveBeenCalledTimes(1);
    expect(mockAuthPost).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
    expect(await response.json()).toEqual({ status: true });
  });
});
