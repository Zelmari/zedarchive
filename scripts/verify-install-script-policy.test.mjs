import assert from 'node:assert/strict'
import test from 'node:test'
import { assertInstallScriptPolicy } from './verify-install-script-policy.mjs'

function packageLockWithInstallScript(version = '1.0.0') {
  return {
    packages: {
      '': {},
      'node_modules/example-installer': {
        hasInstallScript: true,
        version,
      },
    },
  }
}

test('accepts an explicit name-wide lifecycle-script denial', () => {
  assert.doesNotThrow(() => {
    assertInstallScriptPolicy(
      { allowScripts: { 'example-installer': false } },
      packageLockWithInstallScript(),
    )
  })
})

test('rejects an install script without an explicit disposition', () => {
  assert.throws(() => {
    assertInstallScriptPolicy(
      { allowScripts: {} },
      packageLockWithInstallScript(),
    )
  }, /no explicit lifecycle-script disposition/)
})

test('rejects a conflicting broad denial and exact approval', () => {
  assert.throws(() => {
    assertInstallScriptPolicy(
      {
        allowScripts: {
          'example-installer': false,
          'example-installer@1.0.0': true,
        },
      },
      packageLockWithInstallScript(),
    )
  }, /conflicting broad denial and exact approval/)
})

test('rejects an unpinned lifecycle-script approval', () => {
  assert.throws(() => {
    assertInstallScriptPolicy(
      { allowScripts: { 'example-installer': true } },
      packageLockWithInstallScript(),
    )
  }, /unpinned lifecycle-script approval/)
})
