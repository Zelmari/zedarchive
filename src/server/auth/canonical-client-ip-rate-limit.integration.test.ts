import { createRateLimitKey, getIp } from '@better-auth/core/utils/ip'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { readDatabaseTestEnvironment } from '@/config/database-environment'
import { createAuth, createAuthOptions } from '@/server/auth/create-auth'
import { rateLimits } from '@/server/database/schema'
import { assertSafeTestDatabaseName } from '@/test/database/global-setup'

vi.mock('server-only', () => ({}))

const authEnvironment = {
  authSecret: 'ci-disposable-better-auth-secret-32chars-min',
  authUrl: 'http://localhost:3000',
} as const

const { databaseTestUrl } = readDatabaseTestEnvironment()
const pool = new Pool({ connectionString: databaseTestUrl })
const database = drizzle({ client: pool })
const authDependencies = {
  accountDeletionStateReader: async () => ({ kind: 'active' as const }),
}
const authOptions = createAuthOptions(
  database,
  authEnvironment,
  authDependencies,
)

function createRequest(
  path: '/sign-in/email' | '/sign-up/email',
  input: Readonly<{
    identity: string
    canonicalHeader?: 'single-a' | 'single-b' | 'multi-hop'
    fallbackHeader?: 'variant-a' | 'variant-b'
    realIpHeader?: 'variant-a' | 'variant-b'
  }>,
): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: authEnvironment.authUrl,
  })

  const canonicalValues = {
    'single-a': '203.0.113.10',
    'single-b': '203.0.113.20',
    'multi-hop': '203.0.113.30, 203.0.113.31',
  } as const
  const fallbackValues = {
    'variant-a': '203.0.113.40',
    'variant-b': '203.0.113.50',
  } as const

  if (input.canonicalHeader !== undefined) {
    headers.set(
      'X-Vercel-Forwarded-For',
      canonicalValues[input.canonicalHeader],
    )
  }
  if (input.fallbackHeader !== undefined) {
    headers.set('X-Forwarded-For', fallbackValues[input.fallbackHeader])
  }
  if (input.realIpHeader !== undefined) {
    headers.set('X-Real-IP', fallbackValues[input.realIpHeader])
  }

  return new Request(`${authEnvironment.authUrl}/api/auth${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      path === '/sign-in/email'
        ? { email: `${input.identity}@example.test`, password: 'password-15' }
        : {
            name: 'RateLimitUser',
            email: `${input.identity}@example.test`,
            password: 'password-15',
          },
    ),
  })
}

async function assertRateLimitRows(expectedCounts: number[]): Promise<void> {
  const rows = await database
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(inArray(rateLimits.key, [...ownedRateLimitKeys]))
    .orderBy(rateLimits.count)

  expect(rows.map(({ count }) => count)).toEqual(expectedCounts)
}

function providerRateLimitKey(
  path: '/sign-in/email' | '/sign-up/email',
  input: Parameters<typeof createRequest>[1],
): string {
  const request = createRequest(path, input)
  const clientIp = getIp(request, authOptions) ?? 'no-trusted-ip'

  return createRateLimitKey(clientIp, path)
}

const ownedRateLimitKeys = new Set([
  providerRateLimitKey('/sign-in/email', {
    identity: 'owned-canonical-a',
    canonicalHeader: 'single-a',
  }),
  providerRateLimitKey('/sign-in/email', {
    identity: 'owned-canonical-b',
    canonicalHeader: 'single-b',
  }),
  providerRateLimitKey('/sign-in/email', {
    identity: 'owned-fallback',
  }),
  providerRateLimitKey('/sign-in/email', {
    identity: 'owned-multi-hop',
    canonicalHeader: 'multi-hop',
  }),
  providerRateLimitKey('/sign-up/email', {
    identity: 'owned-sign-up',
    canonicalHeader: 'single-a',
  }),
])

let preservedRateLimitRows: (typeof rateLimits.$inferSelect)[] = []

async function requestSignIn(
  auth: ReturnType<typeof createAuth>,
  input: Parameters<typeof createRequest>[1],
): Promise<Response> {
  return auth.handler(createRequest('/sign-in/email', input))
}

beforeAll(async () => {
  const result = await pool.query<{ databaseName: string }>(
    'select current_database() as "databaseName"',
  )

  assertSafeTestDatabaseName(result.rows[0]?.databaseName)
})

beforeEach(async () => {
  preservedRateLimitRows = await database
    .select()
    .from(rateLimits)
    .where(inArray(rateLimits.key, [...ownedRateLimitKeys]))

  await database
    .delete(rateLimits)
    .where(inArray(rateLimits.key, [...ownedRateLimitKeys]))
})

afterEach(async () => {
  await database
    .delete(rateLimits)
    .where(inArray(rateLimits.key, [...ownedRateLimitKeys]))

  if (preservedRateLimitRows.length > 0) {
    await database.insert(rateLimits).values(preservedRateLimitRows)
  }
})

afterAll(async () => {
  await pool.end()
})

describe('canonical Better Auth client-IP rate limiting', () => {
  it('uses only the canonical header for same-endpoint bucket relationships', async () => {
    const auth = createAuth(database, authEnvironment, authDependencies)

    for (const input of [
      {
        identity: 'same-canonical-first',
        canonicalHeader: 'single-a' as const,
        fallbackHeader: 'variant-a' as const,
      },
      {
        identity: 'same-canonical-second',
        canonicalHeader: 'single-a' as const,
        fallbackHeader: 'variant-b' as const,
      },
      {
        identity: 'same-canonical-third',
        canonicalHeader: 'single-a' as const,
        realIpHeader: 'variant-a' as const,
      },
    ]) {
      await expect(requestSignIn(auth, input)).resolves.not.toMatchObject({
        status: 429,
      })
    }
    await assertRateLimitRows([3])

    await expect(
      requestSignIn(auth, {
        identity: 'same-canonical-limited',
        canonicalHeader: 'single-a',
        fallbackHeader: 'variant-b',
        realIpHeader: 'variant-b',
      }),
    ).resolves.toMatchObject({ status: 429 })
    await assertRateLimitRows([3])

    await expect(
      requestSignIn(auth, {
        identity: 'different-canonical',
        canonicalHeader: 'single-b',
        fallbackHeader: 'variant-a',
      }),
    ).resolves.not.toMatchObject({ status: 429 })
    await assertRateLimitRows([1, 3])
  })

  it('uses one stable fallback bucket when the canonical value is absent or multi-hop', async () => {
    const auth = createAuth(database, authEnvironment, authDependencies)

    for (const input of [
      {
        identity: 'missing-canonical-first',
        fallbackHeader: 'variant-a' as const,
      },
      {
        identity: 'missing-canonical-second',
        fallbackHeader: 'variant-b' as const,
        realIpHeader: 'variant-a' as const,
      },
      {
        identity: 'multi-hop-canonical',
        canonicalHeader: 'multi-hop' as const,
        fallbackHeader: 'variant-a' as const,
      },
    ]) {
      await expect(requestSignIn(auth, input)).resolves.not.toMatchObject({
        status: 429,
      })
    }
    await assertRateLimitRows([3])

    await expect(
      requestSignIn(auth, {
        identity: 'missing-canonical-limited',
        realIpHeader: 'variant-b',
      }),
    ).resolves.toMatchObject({ status: 429 })
    await assertRateLimitRows([3])
  })

  it('preserves Better Auth path separation while making identity irrelevant within each path', async () => {
    const auth = createAuth(database, authEnvironment, authDependencies)

    for (const identity of [
      'path-sign-in-first',
      'path-sign-in-second',
      'path-sign-in-third',
    ]) {
      await expect(
        requestSignIn(auth, { identity, canonicalHeader: 'single-a' }),
      ).resolves.not.toMatchObject({ status: 429 })
    }
    await assertRateLimitRows([3])

    await expect(
      auth.handler(
        createRequest('/sign-up/email', {
          identity: 'path-sign-up',
          canonicalHeader: 'single-a',
        }),
      ),
    ).resolves.not.toMatchObject({ status: 429 })
    await assertRateLimitRows([1, 3])
  })
})
