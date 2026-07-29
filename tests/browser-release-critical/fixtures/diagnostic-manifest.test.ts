import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ReleaseCriticalDiagnostic,
  validateReleaseCriticalDiagnostic,
} from './diagnostic-manifest'

test('accepts only the fixed safe diagnostic vocabulary', () => {
  const diagnostic = new ReleaseCriticalDiagnostic('account and add core')
  diagnostic.stage('verification', '/verify-email')
  diagnostic.responseStatus(200)
  diagnostic.checkpoint('fragmentCleared')
  diagnostic.cleanup('passed')

  assert.deepEqual(diagnostic.snapshot(), {
    schemaVersion: 1,
    testTitle: 'account and add core',
    stage: 'verification',
    pathname: '/verify-email',
    responseStatus: 200,
    checkpoints: { fragmentCleared: true },
    cleanup: 'passed',
  })
})

test('rejects extra, sensitive, and arbitrary fields', () => {
  const base = {
    schemaVersion: 1,
    testTitle: 'public catalogue core',
    stage: 'public-search',
    pathname: '/',
    checkpoints: {},
    cleanup: 'not-run',
  }

  for (const extra of [
    { url: 'https://example.test/' },
    { query: 'q=value' },
    { fragment: 'token=value' },
    { email: 'fixture@example.test' },
    { credential: 'value' },
    { header: 'value' },
    { cookie: 'value' },
    { body: 'value' },
    { stack: 'value' },
    { error: 'arbitrary message' },
    { arbitrary: true },
  ]) {
    assert.throws(
      () => validateReleaseCriticalDiagnostic({ ...base, ...extra }),
      /unsupported key/u,
    )
  }
})

test('rejects query-bearing paths and open-ended values', () => {
  const base = {
    schemaVersion: 1,
    testTitle: 'public catalogue core',
    stage: 'public-search',
    checkpoints: {},
    cleanup: 'not-run',
  }

  for (const invalid of [
    { ...base, pathname: '/verify-email?token=value' },
    { ...base, pathname: '/verify-email#token=value' },
    { ...base, pathname: 'https://example.test/' },
    { ...base, pathname: '/', stage: 'arbitrary-stage' },
    {
      ...base,
      pathname: '/',
      checkpoints: { arbitraryCheckpoint: true },
    },
    { ...base, pathname: '/', responseStatus: 99 },
  ]) {
    assert.throws(
      () => validateReleaseCriticalDiagnostic(invalid),
      /unsupported/u,
    )
  }
})
