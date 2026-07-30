import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { isInsideOperationalOutputRoot } from './operational-reporter'

test('accepts only attachment paths nested inside the operational output root', () => {
  const root = path.join(
    process.cwd(),
    'test-results-account-purge-operational',
  )
  assert.equal(
    isInsideOperationalOutputRoot(root, path.join(root, 'safe', 'result.txt')),
    true,
  )
  assert.equal(isInsideOperationalOutputRoot(root, root), false)
  assert.equal(
    isInsideOperationalOutputRoot(root, path.join(root, '..', 'outside.txt')),
    false,
  )
  assert.equal(
    isInsideOperationalOutputRoot(root, '/private/tmp/outside.txt'),
    false,
  )
})
