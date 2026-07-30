import assert from 'node:assert/strict'
import test from 'node:test'
import {
  failReleaseCriticalIfRequested,
  readReleaseCriticalControlledFailure,
  releaseCriticalControlledFailureEnvironment,
} from './controlled-failure'

test('accepts only the fixed controlled-failure selectors', () => {
  assert.equal(readReleaseCriticalControlledFailure({}), null)
  assert.equal(
    readReleaseCriticalControlledFailure({
      [releaseCriticalControlledFailureEnvironment]: 'public',
    }),
    'public',
  )
  assert.equal(
    readReleaseCriticalControlledFailure({
      [releaseCriticalControlledFailureEnvironment]: 'account',
    }),
    'account',
  )
  assert.equal(
    readReleaseCriticalControlledFailure({
      [releaseCriticalControlledFailureEnvironment]: 'archive-backup',
    }),
    'archive-backup',
  )
  assert.equal(
    readReleaseCriticalControlledFailure({
      [releaseCriticalControlledFailureEnvironment]: 'archive-tracking',
    }),
    'archive-tracking',
  )
  assert.equal(
    readReleaseCriticalControlledFailure({
      [releaseCriticalControlledFailureEnvironment]: 'account-restriction',
    }),
    'account-restriction',
  )
  assert.throws(
    () =>
      readReleaseCriticalControlledFailure({
        [releaseCriticalControlledFailureEnvironment]: 'unexpected',
      }),
    { message: 'M41 controlled failure selector is invalid' },
  )
})

test('fails only the selected fixed stage with fixed text', () => {
  const publicEnvironment = {
    [releaseCriticalControlledFailureEnvironment]: 'public',
  }
  assert.throws(
    () => failReleaseCriticalIfRequested('public', publicEnvironment),
    { message: 'M42 controlled public failure' },
  )
  assert.doesNotThrow(() =>
    failReleaseCriticalIfRequested('account', publicEnvironment),
  )

  const accountEnvironment = {
    [releaseCriticalControlledFailureEnvironment]: 'account',
  }
  assert.throws(
    () => failReleaseCriticalIfRequested('account', accountEnvironment),
    { message: 'M42 controlled account failure' },
  )
  assert.doesNotThrow(() =>
    failReleaseCriticalIfRequested('public', accountEnvironment),
  )
  for (const target of [
    'archive-tracking',
    'archive-backup',
    'account-restriction',
  ] as const) {
    assert.throws(
      () =>
        failReleaseCriticalIfRequested(target, {
          [releaseCriticalControlledFailureEnvironment]: target,
        }),
      { message: `M42 controlled ${target} failure` },
    )
  }
})
