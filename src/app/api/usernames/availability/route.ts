import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { NextResponse } from 'next/server'
import { usernameAvailabilitySchema } from '@/features/identity/domain/username-availability'
import { checkUsernameAvailability } from '@/server/identity/username-availability'

export const runtime = 'nodejs'

const noStoreHeaders = {
  'Cache-Control': 'no-store',
} as const

const badRequestBody = {
  error: 'bad_request',
} as const

const serviceUnavailableBody = {
  error: 'service_unavailable',
} as const

function jsonResponse(
  body: typeof badRequestBody | typeof serviceUnavailableBody,
  status: 400 | 503,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  })
}

export async function handleUsernameAvailabilityGet(
  request: Request,
  database: NodePgDatabase,
): Promise<NextResponse> {
  const usernameValues = new URL(request.url).searchParams.getAll('username')

  if (usernameValues.length !== 1) {
    return jsonResponse(badRequestBody, 400)
  }

  const username = usernameValues[0]

  if (username === undefined) {
    return jsonResponse(badRequestBody, 400)
  }

  try {
    const availability = await checkUsernameAvailability(database, username)
    const body = usernameAvailabilitySchema.parse(availability)

    return NextResponse.json(body, {
      status: 200,
      headers: noStoreHeaders,
    })
  } catch {
    return jsonResponse(serviceUnavailableBody, 503)
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { database } = await import('@/server/database/client')
  return handleUsernameAvailabilityGet(request, database)
}
