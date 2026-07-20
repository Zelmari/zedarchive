import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { describe, expect, it, vi } from 'vitest'
import { handleUsernameAvailabilityGet } from '@/app/api/usernames/availability/route'
import * as usernameAvailabilityRoute from '@/app/api/usernames/availability/route'
import { usernameAvailabilityInputMaximumCodeUnits } from '@/server/identity/username-availability'

type AvailabilityRow = {
  id: string
}

function createTrackingDatabase(result: AvailabilityRow[] | Error) {
  const limit = vi.fn(async () => {
    if (result instanceof Error) {
      throw result
    }

    return result
  })
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))

  return {
    database: { select } as unknown as NodePgDatabase,
    select,
    from,
    where,
    limit,
  }
}

function createAvailabilityRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/usernames/availability${query}`)
}

async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

describe('handleUsernameAvailabilityGet', () => {
  it('exports no mutation handler', () => {
    expect(usernameAvailabilityRoute).not.toHaveProperty('POST')
    expect(usernameAvailabilityRoute).not.toHaveProperty('PUT')
    expect(usernameAvailabilityRoute).not.toHaveProperty('PATCH')
    expect(usernameAvailabilityRoute).not.toHaveProperty('DELETE')
  })

  it('returns allowlisted available JSON with no-store headers', async () => {
    const { database, select } = createTrackingDatabase([])

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest('?username=FreeName'),
      database,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(await readJson(response)).toEqual({ status: 'available' })
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('returns unavailable for an occupied identity without leaking account data', async () => {
    const { database } = createTrackingDatabase([
      { id: '00000000-0000-4000-8000-000000000001' },
    ])

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest('?username=MediaFan'),
      database,
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({ status: 'unavailable' })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('username')
    expect(body).not.toHaveProperty('usernameIdentityKey')
    expect(body).not.toHaveProperty('email')
  })

  it('returns unavailable for a capitalization variant of an occupied identity', async () => {
    const { database, where } = createTrackingDatabase([
      { id: '00000000-0000-4000-8000-000000000001' },
    ])

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest('?username=MEDIAFAN'),
      database,
    )

    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ status: 'unavailable' })
    expect(where).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing username query without database work', async () => {
    const { database, select } = createTrackingDatabase([])

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest(''),
      database,
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await readJson(response)).toEqual({ error: 'bad_request' })
    expect(select).not.toHaveBeenCalled()
  })

  it('rejects a repeated username query without database work', async () => {
    const { database, select } = createTrackingDatabase([])

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest('?username=FreeName&username=OtherName'),
      database,
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await readJson(response)).toEqual({ error: 'bad_request' })
    expect(select).not.toHaveBeenCalled()
  })

  it('rejects oversized input without database work', async () => {
    const { database, select } = createTrackingDatabase([])
    const oversized = 'a'.repeat(usernameAvailabilityInputMaximumCodeUnits + 1)

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest(`?username=${oversized}`),
      database,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await readJson(response)).toEqual({ status: 'invalid' })
    expect(select).not.toHaveBeenCalled()
  })

  it.each([
    ['syntactically invalid', 'user.name'],
    ['restricted', 'admin'],
    ['too short', 'ab'],
  ])(
    'returns invalid for %s input without revealing the matched rule',
    async (_, username) => {
      const { database, select } = createTrackingDatabase([])

      const response = await handleUsernameAvailabilityGet(
        createAvailabilityRequest(`?username=${username}`),
        database,
      )
      const body = await readJson(response)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(body).toEqual({ status: 'invalid' })
      expect(JSON.stringify(body)).not.toMatch(/admin|restricted|rule/i)
      expect(select).not.toHaveBeenCalled()
    },
  )

  it('returns a generic no-store 503 when the database lookup fails', async () => {
    const { database } = createTrackingDatabase(
      new Error('connection refused host=secret.example password=leaked'),
    )

    const response = await handleUsernameAvailabilityGet(
      createAvailabilityRequest('?username=FreeName'),
      database,
    )
    const bodyText = await response.text()

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.parse(bodyText)).toEqual({ error: 'service_unavailable' })
    expect(bodyText).not.toMatch(
      /connection refused|secret\.example|password|leaked|stack|SELECT/i,
    )
  })
})
