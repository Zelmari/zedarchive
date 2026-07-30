import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAccountLifecycleRateLimitTransition,
  assertExactRateLimitState,
  type AccountLifecycleRateLimitRow,
} from './account-lifecycle-rate-limit'

const key = '127.0.0.1|/sign-in/email'
const before: AccountLifecycleRateLimitRow = {
  id: '42000000-0000-4000-8000-000000000001',
  key,
  count: 3,
  lastRequest: '1000',
}

test('accepts exact absent, incrementing, and aged-window request transitions', () => {
  assert.doesNotThrow(() =>
    assertAccountLifecycleRateLimitTransition({
      before: undefined,
      after: { ...before, count: 1, lastRequest: '2000' },
      key,
      minimumTimestamp: 1500,
    }),
  )
  assert.doesNotThrow(() =>
    assertAccountLifecycleRateLimitTransition({
      before,
      after: { ...before, count: 4, lastRequest: '2000' },
      key,
      minimumTimestamp: 1500,
    }),
  )
  assert.doesNotThrow(() =>
    assertAccountLifecycleRateLimitTransition({
      before,
      after: { ...before, count: 1, lastRequest: '2000' },
      key,
      minimumTimestamp: 1500,
    }),
  )
})

test('rejects missing, stale, wrong-identity, and unchanged transitions', () => {
  for (const after of [
    undefined,
    before,
    { ...before, id: '42000000-0000-4000-8000-000000000002', count: 4 },
    { ...before, count: 4, lastRequest: '1200' },
  ]) {
    assert.throws(
      () =>
        assertAccountLifecycleRateLimitTransition({
          before,
          after,
          key,
          minimumTimestamp: 1500,
        }),
      new TypeError('M42 rate-limit request transition was not observed'),
    )
  }
})

test('requires byte-for-byte expected state before request or restoration', () => {
  assert.doesNotThrow(() => assertExactRateLimitState([before], [before]))
  assert.throws(
    () =>
      assertExactRateLimitState(
        [{ ...before, count: before.count + 1 }],
        [before],
      ),
    new TypeError('M42 rate-limit state changed unexpectedly'),
  )
})
