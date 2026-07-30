const maximumAggregateResponseBytes = 4 * 1024

export type AccountPurgeAggregate = Readonly<{
  examinedCount: number
  failedCount: number
  purgedCount: number
  skippedCount: number
  result: 'completed'
}>

export type AccountPurgeEvidence = Readonly<{
  cachePrivateNoStore: boolean
  nosniff: boolean
  status: number
  aggregate: AccountPurgeAggregate
}>

function failure(stage: string): Error {
  return new Error(`M42 account-purge operational audit failed: ${stage}`)
}

function isAggregate(value: unknown): value is AccountPurgeAggregate {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (
    JSON.stringify(keys) !==
      JSON.stringify([
        'examinedCount',
        'failedCount',
        'purgedCount',
        'result',
        'skippedCount',
      ]) ||
    record.result !== 'completed'
  ) {
    return false
  }
  return [
    record.examinedCount,
    record.failedCount,
    record.purgedCount,
    record.skippedCount,
  ].every(
    (value) =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  )
}

async function readBoundedText(response: Response): Promise<string> {
  if (response.body === null) throw failure('body')
  const chunks: Uint8Array[] = []
  let byteCount = 0
  const reader = response.body.getReader()
  try {
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        byteCount += next.value.byteLength
        if (byteCount > maximumAggregateResponseBytes) {
          await reader.cancel()
          throw failure('body_size')
        }
        chunks.push(next.value)
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('M42 '))
        throw error
      throw failure('read')
    }

    const bytes = new Uint8Array(byteCount)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw failure('utf8')
    }
  } finally {
    chunks.length = 0
  }
}

function operationalSecret(): string {
  if (process.env.ACCOUNT_PURGE_ENABLED !== 'true') {
    throw failure('environment')
  }
  return 'm42-account-purge-operational-disposable-secret'
}

export async function auditAccountPurgeResponse(
  response: Response,
): Promise<AccountPurgeEvidence> {
  if (response.status !== 200) throw failure('status')
  const text = await readBoundedText(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw failure('json')
  }
  if (!isAggregate(parsed)) throw failure('aggregate')
  return {
    aggregate: parsed,
    cachePrivateNoStore:
      response.headers.get('cache-control')?.includes('private, no-store') ===
      true,
    nosniff: response.headers.get('x-content-type-options') === 'nosniff',
    status: response.status,
  }
}

export async function invokeAccountPurge(
  origin: string,
): Promise<AccountPurgeEvidence> {
  const response = await fetch(`${origin}/api/internal/account-purge`, {
    headers: { authorization: `Bearer ${operationalSecret()}` },
    method: 'GET',
  })
  return auditAccountPurgeResponse(response)
}

export async function invokeUnauthorizedAccountPurge(origin: string) {
  const response = await fetch(`${origin}/api/internal/account-purge`, {
    method: 'GET',
  })
  return { status: response.status } as const
}

export const accountPurgeMaximumAggregateResponseBytes =
  maximumAggregateResponseBytes
