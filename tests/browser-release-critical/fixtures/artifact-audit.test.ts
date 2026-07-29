import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { auditReleaseCriticalArtifacts } from './artifact-audit'

const validManifest = {
  schemaVersion: 1,
  testTitle: 'public catalogue core',
  stage: 'public-browse',
  pathname: '/',
  checkpoints: { databaseGuarded: true },
  cleanup: 'passed',
} as const

async function withOutput(
  run: (root: string, diagnostics: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'm41-artifact-audit-'))
  const diagnostics = path.join(root, 'diagnostics')
  await mkdir(diagnostics)
  try {
    await run(root, diagnostics)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts only validated allowlisted diagnostic manifests', async () => {
  await withOutput(async (root, diagnostics) => {
    await writeFile(
      path.join(diagnostics, 'public-catalogue-core.json'),
      JSON.stringify(validManifest),
    )
    await assert.doesNotReject(async () => {
      assert.deepEqual(await auditReleaseCriticalArtifacts(root), {
        manifestCount: 1,
      })
    })
  })
})

test('rejects non-allowlisted paths without reading their content', async () => {
  await withOutput(async (root) => {
    await writeFile(path.join(root, 'error-context.md'), 'safe test content')
    await assert.rejects(() => auditReleaseCriticalArtifacts(root), {
      message: 'M41 artifact audit rejected output',
    })
  })
})

test('rejects malformed, schema-invalid, and prohibited manifest content', async () => {
  const prohibitedSamples = [
    '#token=safe-test-marker',
    '/verify-email?safe=test',
    'm41-00000000000000000000000000000000@example.test',
    'M4100000000000000',
    'M41-00000000-0000-4000-8000-000000000000-00000000-0000-4000-8000-000000000000',
    'raw body marker',
    'raw error marker',
    'raw stack marker',
    'raw header marker',
    'raw cookie marker',
    'raw credential marker',
    'raw password marker',
  ]

  for (const content of [
    '{',
    JSON.stringify({ ...validManifest, arbitrary: true }),
    ...prohibitedSamples,
  ]) {
    await withOutput(async (root, diagnostics) => {
      await writeFile(
        path.join(diagnostics, 'public-catalogue-core.json'),
        content,
      )
      await assert.rejects(() => auditReleaseCriticalArtifacts(root), {
        message: 'M41 artifact audit rejected output',
      })
    })
  }
})

test('rejects empty output and unexpected nested directories', async () => {
  await withOutput(async (root, diagnostics) => {
    await assert.rejects(() => auditReleaseCriticalArtifacts(root), {
      message: 'M41 artifact audit rejected output',
    })

    await mkdir(path.join(diagnostics, 'nested'))
    await assert.rejects(() => auditReleaseCriticalArtifacts(root), {
      message: 'M41 artifact audit rejected output',
    })
  })
})
