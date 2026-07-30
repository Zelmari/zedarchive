import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { isAllowlistedReleaseCriticalArtifact } from './privacy-artifact-reporter'

test('allowlists only the five fixed diagnostic manifests', () => {
  for (const filename of [
    'public-catalogue-core.json',
    'account-and-add-core.json',
    'archive-tracking-lifecycle.json',
    'archive-backup-lifecycle.json',
    'account-recovery-deletion-lifecycle.json',
  ]) {
    assert.equal(
      isAllowlistedReleaseCriticalArtifact(
        path.resolve('test-results-release-critical/diagnostics', filename),
      ),
      true,
    )
  }

  for (const rejected of [
    'test-results-release-critical/.last-run.json',
    'test-results-release-critical/error-context.md',
    'test-results-release-critical/diagnostics/arbitrary.json',
    'test-results-release-critical/diagnostics/public-catalogue-core.json.backup',
    'outside.json',
  ]) {
    assert.equal(isAllowlistedReleaseCriticalArtifact(rejected), false)
  }
})
