import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountPurgeMaximumAggregateResponseBytes,
  auditAccountPurgeResponse,
} from './purge-response-auditor'

const validAggregate = JSON.stringify({
  examinedCount: 1,
  failedCount: 0,
  purgedCount: 1,
  result: 'completed',
  skippedCount: 0,
})

test('accepts only the bounded fixed aggregate contract', async () => {
  const result = await auditAccountPurgeResponse(
    new Response(validAggregate, {
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
      status: 200,
    }),
  )
  assert.deepEqual(result, {
    aggregate: JSON.parse(validAggregate),
    cachePrivateNoStore: true,
    nosniff: true,
    status: 200,
  })
})

test('rejects over-bound and non-aggregate responses with fixed errors', async () => {
  await assert.rejects(
    () =>
      auditAccountPurgeResponse(
        new Response(
          'x'.repeat(accountPurgeMaximumAggregateResponseBytes + 1),
          {
            status: 200,
          },
        ),
      ),
    { message: 'M42 account-purge operational audit failed: body_size' },
  )
  await assert.rejects(
    () => auditAccountPurgeResponse(new Response('{}', { status: 200 })),
    { message: 'M42 account-purge operational audit failed: aggregate' },
  )
})
