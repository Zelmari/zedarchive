import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  createPolicySyntheticNativeDerivationFixture,
  executePolicyNativeDerivationCli,
  retiredPolicyNativeDerivationModes,
  runPolicyNativeDerivationCommand,
} from '@/../scripts/m45-policy-native-derivation'

describe('M45 policy native derivation retirement', () => {
  it('rejects every retired mode literal with closed stopped production output', () => {
    for (const mode of retiredPolicyNativeDerivationModes) {
      expect(runPolicyNativeDerivationCommand([mode])).toEqual({
        mode: 'retired',
        status: 'stopped',
      })
    }
    expect(runPolicyNativeDerivationCommand(['derive-a', 'extra'])).toEqual({
      mode: 'retired',
      status: 'stopped',
    })
    expect(runPolicyNativeDerivationCommand(['unknown-mode'])).toEqual({
      mode: 'unknown',
      status: 'stopped',
    })
    expect(runPolicyNativeDerivationCommand([])).toEqual({
      mode: 'unknown',
      status: 'stopped',
    })
  })

  it('production CLI entry emits a closed stopped line, exits nonzero, and never reads host or custody state', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    try {
      const code = await executePolicyNativeDerivationCli([
        'derive-a',
        '--confirm-m45-policy-native-derivation-v1',
      ])
      expect(code).toBe(1)
      const line = write.mock.calls.map(([chunk]) => chunk).join('')
      expect(JSON.parse(line)).toEqual({ mode: 'retired', status: 'stopped' })
    } finally {
      write.mockRestore()
    }
  })

  it('keeps no host, tracked, or custody read surface in the retired production source', async () => {
    const source = await readFile(
      fileURLToPath(
        new URL('../scripts/m45-policy-native-derivation.ts', import.meta.url),
      ),
      'utf8',
    )
    for (const retired of [
      'node:fs',
      'node:child_process',
      'execFile',
      '.local/',
      'process.cwd',
      'realpath',
    ]) {
      expect(source).not.toContain(retired)
    }
    expect(source).toContain("process.env.NODE_ENV !== 'test'")
  })

  it('constructs the historical synthetic fixture only through the test seam', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const fixture = createPolicySyntheticNativeDerivationFixture()
      expect(fixture.residue.root).toMatchObject({
        uid: 501,
        dev: 9,
        ino: 100,
        mode: 0o700,
        nlink: 6,
      })
      expect(fixture.residue.control).toMatchObject({
        ino: 104,
        mode: 0o700,
        nlink: 3,
      })
      expect(fixture.residue.baselineBytes.byteLength).toBeGreaterThan(0)
      expect(fixture.residue.baseline.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(fixture.residue.tracked.commit).toBe('c'.repeat(40))
      expect(fixture.residue.siblings).toMatchObject({
        'candidate-review': { directory: true, ino: 101 },
        discovery: { directory: true, ino: 102 },
        'predecessor-review': { directory: true, ino: 103 },
      })
      expect(fixture.run(['derive-a'])).toEqual({
        mode: 'retired',
        status: 'stopped',
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('refuses to construct the historical fixture outside the test seam', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => createPolicySyntheticNativeDerivationFixture()).toThrow(
        'test-only',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
