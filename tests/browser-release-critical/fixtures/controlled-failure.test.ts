import assert from 'node:assert/strict'
import test from 'node:test'
import {
  failReleaseCriticalIfRequested,
  readReleaseCriticalControlledFailure,
  releaseCriticalControlledFailureEnvironment,
} from './controlled-failure'

test('accepts only the two fixed controlled-failure selectors', () => {
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
    { message: 'M41 controlled public failure' },
  )
  assert.doesNotThrow(() =>
    failReleaseCriticalIfRequested('account', publicEnvironment),
  )

  const accountEnvironment = {
    [releaseCriticalControlledFailureEnvironment]: 'account',
  }
  assert.throws(
    () => failReleaseCriticalIfRequested('account', accountEnvironment),
    { message: 'M41 controlled account failure' },
  )
  assert.doesNotThrow(() =>
    failReleaseCriticalIfRequested('public', accountEnvironment),
  )
})
