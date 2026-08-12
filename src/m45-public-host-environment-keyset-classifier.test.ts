import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const modulePath = fileURLToPath(
  new URL(
    '../scripts/m45-public-host-environment-keyset-classifier.mjs',
    import.meta.url,
  ),
)

const classifier = (await import(
  new URL(modulePath, import.meta.url).href
)) as {
  classifyEnvironmentKeysetForFixture: (
    argv: readonly string[],
    readers: unknown,
  ) => Readonly<{ stage: string }>
  formatEnvironmentKeysetForFixture: (
    result: unknown,
  ) => Readonly<{ line: string; exitCode: number }>
  writeEnvironmentKeysetForFixture: (
    line: unknown,
    write: unknown,
  ) => Promise<number>
}

const argv = [
  'classify-public-host-environment-keyset',
  '--confirm-m45-public-host-environment-keyset-v1',
] as const
const expectedKeys = ['LANG', 'LC_ALL', 'TZ'] as const
const cfKey = '__CF_USER_TEXT_ENCODING'
const mallocKey = 'MallocNanoZone'
const stages = [
  'host-environment-keyset-expected-only',
  'host-environment-keyset-expected-plus-cf',
  'host-environment-keyset-expected-plus-malloc',
  'host-environment-keyset-expected-plus-both',
  'host-environment-keyset-missing-only',
  'host-environment-keyset-other-extra',
  'host-environment-keyset-mixed',
  'stopped',
] as const

function sortedKeys(...keys: string[]) {
  return keys.sort()
}

function readerFixture(...provided: unknown[]) {
  const keys = provided.length === 0 ? [...expectedKeys] : provided[0]
  const environmentKeys = vi.fn(() => keys)
  return { environmentKeys, readers: { environmentKeys } }
}

function classify(keys: unknown, readers: Record<string, unknown> = {}) {
  const fixture = readerFixture(keys)
  return {
    fixture,
    result: classifier.classifyEnvironmentKeysetForFixture(argv, {
      ...fixture.readers,
      ...readers,
    }),
  }
}

describe('Decision 136 public host environment key-set classifier', () => {
  const rejectedArgv: readonly (readonly string[])[] = [
    [],
    ['classify-public-host-environment-keyset'],
    [
      '--confirm-m45-public-host-environment-keyset-v1',
      'classify-public-host-environment-keyset',
    ],
    [
      'classify-public-host-environment-keyset',
      '--confirm-m45-public-host-environment-keyset-v0',
    ],
    [...argv, 'extra'],
    [
      'classify-public-scratch-xattr',
      '--confirm-m45-public-scratch-xattr-classifier-v1',
    ],
    [
      'diagnose-public-scratch-classifier-stop',
      '--confirm-m45-public-scratch-classifier-stop-v1',
    ],
    [
      'diagnose-public-host-admission',
      '--confirm-m45-public-host-admission-v1',
    ],
  ]

  it.each(rejectedArgv.map((candidate) => [candidate] as const))(
    'rejects non-D136 argv before environment enumeration: %j',
    (candidate) => {
      const fixture = readerFixture()
      expect(
        classifier.classifyEnvironmentKeysetForFixture(
          candidate,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
      expect(fixture.environmentKeys).not.toHaveBeenCalled()
    },
  )

  it('rejects an ambiguous argv before environment enumeration', () => {
    const fixture = readerFixture()
    const ambiguousArgv = new Proxy([...argv], {
      get() {
        throw new Error('private-argv-sentinel')
      },
    })
    expect(
      classifier.classifyEnvironmentKeysetForFixture(
        ambiguousArgv,
        fixture.readers,
      ),
    ).toEqual({ stage: 'stopped' })
    expect(fixture.environmentKeys).not.toHaveBeenCalled()
  })

  it.each(
    [
      (() => {
        const sparse = new Array<string>(2)
        sparse[0] = argv[0]
        Object.setPrototypeOf(sparse, Array.prototype)
        return sparse
      })(),
      new Proxy([...argv], {}),
      (() => {
        const accessor = [...argv]
        Object.defineProperty(accessor, '0', {
          enumerable: true,
          get: () => argv[0],
        })
        return accessor
      })(),
      Object.assign([...argv], { extra: 'private' }),
      Object.setPrototypeOf([...argv], { 0: argv[0], 1: argv[1] }),
    ].map((candidate) => [candidate] as const),
  )(
    'rejects sparse, proxied, accessor, inherited, and extra-key argv: %j',
    (candidate) => {
      const fixture = readerFixture()
      expect(
        classifier.classifyEnvironmentKeysetForFixture(
          candidate,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
      expect(fixture.environmentKeys).not.toHaveBeenCalled()
    },
  )

  it.each([
    [expectedKeys, 'host-environment-keyset-expected-only'],
    [
      sortedKeys(...expectedKeys, cfKey),
      'host-environment-keyset-expected-plus-cf',
    ],
    [
      sortedKeys(...expectedKeys, mallocKey),
      'host-environment-keyset-expected-plus-malloc',
    ],
    [
      sortedKeys(...expectedKeys, cfKey, mallocKey),
      'host-environment-keyset-expected-plus-both',
    ],
  ] as const)(
    'classifies exact profile %j without a value reader',
    (keys, stage) => {
      const valueReader = vi.fn(() => {
        throw new Error('private-value-sentinel')
      })
      const fixture = classify([...keys], { environmentValue: valueReader })
      expect(fixture.result).toEqual({ stage })
      expect(valueReader).not.toHaveBeenCalled()
    },
  )

  it.each([
    [['LANG'], 'host-environment-keyset-missing-only'],
    [['LC_ALL'], 'host-environment-keyset-missing-only'],
    [['TZ'], 'host-environment-keyset-missing-only'],
    [['LANG', 'LC_ALL'], 'host-environment-keyset-missing-only'],
    [['LANG', 'TZ'], 'host-environment-keyset-missing-only'],
    [['LC_ALL', 'TZ'], 'host-environment-keyset-missing-only'],
    [[], 'host-environment-keyset-missing-only'],
  ] as const)(
    'classifies every expected-only proper subset %j',
    (keys, stage) => {
      expect(classify([...keys]).result).toEqual({ stage })
    },
  )

  it.each(
    [
      [...expectedKeys, 'UNKNOWN_RUNTIME_KEY'],
      [...expectedKeys, cfKey, 'UNKNOWN_RUNTIME_KEY'],
      [...expectedKeys, mallocKey, 'UNKNOWN_RUNTIME_KEY'],
      [...expectedKeys, cfKey, mallocKey, 'UNKNOWN_RUNTIME_KEY'],
    ].map((keys) => [keys] as const),
  )('classifies expected plus an unknown extra as other-extra: %j', (keys) => {
    expect(classify(sortedKeys(...keys)).result).toEqual({
      stage: 'host-environment-keyset-other-extra',
    })
  })

  it.each([
    [['UNKNOWN_RUNTIME_KEY'], 'host-environment-keyset-mixed'],
    [[cfKey], 'host-environment-keyset-mixed'],
    [[mallocKey], 'host-environment-keyset-mixed'],
    [['LANG', cfKey], 'host-environment-keyset-mixed'],
    [['TZ', mallocKey, 'UNKNOWN_RUNTIME_KEY'], 'host-environment-keyset-mixed'],
  ] as const)(
    'classifies missing expected plus any extra as mixed: %j',
    (keys, stage) => {
      expect(classify(sortedKeys(...keys)).result).toEqual({ stage })
    },
  )

  it('keeps the fallback classes disjoint and does not disclose key names', () => {
    const sensitiveName = 'PRIVATE_USER_SECRET_ENVIRONMENT_KEY'
    const result = classify(sortedKeys('LANG', 'LC_ALL', sensitiveName)).result
    const formatted = classifier.formatEnvironmentKeysetForFixture(result)
    expect(result).toEqual({ stage: 'host-environment-keyset-mixed' })
    expect(JSON.stringify(result)).not.toContain(sensitiveName)
    expect(formatted.line).not.toContain(sensitiveName)
    expect(formatted.line).not.toContain(cfKey)
    expect(formatted.line).not.toContain(mallocKey)
  })

  it.each(
    [
      null,
      undefined,
      0,
      {},
      ['LANG', 1, 'TZ'],
      ['LANG', 'LANG', 'TZ'],
      ['TZ', 'LANG', 'LC_ALL'],
      Object.assign(['LANG', 'LC_ALL', 'TZ'], { extra: 'private' }),
      Object.setPrototypeOf(['LANG', 'LC_ALL', 'TZ'], null),
      (() => {
        const sparse = new Array<string>(3)
        sparse[0] = 'LANG'
        sparse[2] = 'TZ'
        return sparse
      })(),
      (() => {
        const accessor = ['LANG', 'LC_ALL', 'TZ']
        Object.defineProperty(accessor, '1', {
          enumerable: true,
          get: () => 'LC_ALL',
        })
        return accessor
      })(),
      new Proxy(['LANG', 'LC_ALL', 'TZ'], {}),
      (() => {
        const nonWritable = ['LANG', 'LC_ALL', 'TZ']
        Object.defineProperty(nonWritable, '1', { writable: false })
        return nonWritable
      })(),
    ].map((keys) => [keys] as const),
  )('maps malformed key snapshots to stopped: %j', (keys) => {
    expect(classify(keys).result).toEqual({ stage: 'stopped' })
  })

  it.each([
    ['environmentKeys', null],
    [
      'environmentKeys',
      () => {
        throw new Error('private-enumeration-sentinel')
      },
    ],
  ] as const)(
    'maps malformed or throwing %s access to stopped',
    (name, value) => {
      const fixture = readerFixture()
      const readers = {
        [name]: typeof value === 'function' ? vi.fn(value) : vi.fn(() => value),
      }
      expect(
        classifier.classifyEnvironmentKeysetForFixture(argv, {
          ...fixture.readers,
          ...readers,
        }),
      ).toEqual({ stage: 'stopped' })
    },
  )

  it('maps missing readers and non-object readers to stopped', () => {
    expect(classifier.classifyEnvironmentKeysetForFixture(argv, null)).toEqual({
      stage: 'stopped',
    })
    expect(classifier.classifyEnvironmentKeysetForFixture(argv, {})).toEqual({
      stage: 'stopped',
    })
  })

  it.each(stages)(
    'formats only the closed %s stage and exact exit',
    (stage) => {
      expect(classifier.formatEnvironmentKeysetForFixture({ stage })).toEqual({
        line: `{"stage":"${stage}"}\n`,
        exitCode: stage === 'stopped' ? 1 : 0,
      })
    },
  )

  it.each([
    [expectedKeys, 'host-environment-keyset-expected-only'],
    [
      sortedKeys(...expectedKeys, cfKey),
      'host-environment-keyset-expected-plus-cf',
    ],
    [
      sortedKeys(...expectedKeys, mallocKey),
      'host-environment-keyset-expected-plus-malloc',
    ],
    [
      sortedKeys(...expectedKeys, cfKey, mallocKey),
      'host-environment-keyset-expected-plus-both',
    ],
    [['LANG'], 'host-environment-keyset-missing-only'],
    [
      sortedKeys(...expectedKeys, 'UNKNOWN_RUNTIME_KEY'),
      'host-environment-keyset-other-extra',
    ],
    [
      sortedKeys('LANG', 'UNKNOWN_RUNTIME_KEY'),
      'host-environment-keyset-mixed',
    ],
  ] as const)(
    'preserves the frozen classifier result through production formatting: %s',
    (keys, stage) => {
      const result = classify([...keys]).result
      expect(Object.isFrozen(result)).toBe(true)
      expect(classifier.formatEnvironmentKeysetForFixture(result)).toEqual({
        line: `{"stage":"${stage}"}\n`,
        exitCode: 0,
      })
    },
  )

  it('preserves the frozen stopped result through production formatting', () => {
    const fixture = readerFixture()
    const result = classifier.classifyEnvironmentKeysetForFixture(
      [],
      fixture.readers,
    )
    expect(Object.isFrozen(result)).toBe(true)
    expect(classifier.formatEnvironmentKeysetForFixture(result)).toEqual({
      line: '{"stage":"stopped"}\n',
      exitCode: 1,
    })
    expect(fixture.environmentKeys).not.toHaveBeenCalled()
  })

  it.each([
    null,
    [],
    {},
    { stage: 'private-sentinel' },
    { stage: 'host-environment-keyset-expected-only', extra: true },
    Object.create({ stage: 'host-environment-keyset-expected-only' }),
    new Proxy({ stage: 'host-environment-keyset-expected-only' }, {}),
    Object.defineProperty({}, 'stage', {
      enumerable: true,
      get: () => 'host-environment-keyset-expected-only',
    }),
    Object.setPrototypeOf({ stage: 'stopped' }, null),
  ] as const)('maps malformed formatter input to stopped: %j', (value) => {
    expect(classifier.formatEnvironmentKeysetForFixture(value)).toEqual({
      line: '{"stage":"stopped"}\n',
      exitCode: 1,
    })
  })

  it('formats no raw candidate names even for candidate profiles', () => {
    const formatted = classifier.formatEnvironmentKeysetForFixture({
      stage: 'host-environment-keyset-expected-plus-both',
    })
    expect(formatted.line).toBe(
      '{"stage":"host-environment-keyset-expected-plus-both"}\n',
    )
    expect(formatted.line).not.toContain(cfKey)
    expect(formatted.line).not.toContain(mallocKey)
  })

  it.each([
    'host-environment-keyset-expected-only',
    'host-environment-keyset-expected-plus-cf',
    'host-environment-keyset-expected-plus-malloc',
    'host-environment-keyset-expected-plus-both',
    'host-environment-keyset-missing-only',
    'host-environment-keyset-other-extra',
    'host-environment-keyset-mixed',
    'stopped',
  ] as const)('writes the closed %s line exactly once', async (stage) => {
    const write = vi.fn(async () => undefined)
    const line = `{"stage":"${stage}"}\n`
    await expect(
      classifier.writeEnvironmentKeysetForFixture(line, write),
    ).resolves.toBe(stage === 'stopped' ? 1 : 0)
    expect(write).toHaveBeenCalledExactlyOnceWith(line)
  })

  it.each([
    vi.fn(() => {
      throw new Error('private-write-sentinel')
    }),
    vi.fn(async () => {
      throw new Error('private-write-sentinel')
    }),
  ])('maps writer failure to exit 1 with one attempt', async (write) => {
    await expect(
      classifier.writeEnvironmentKeysetForFixture(
        '{"stage":"host-environment-keyset-expected-only"}\n',
        write,
      ),
    ).resolves.toBe(1)
    expect(write).toHaveBeenCalledOnce()
  })

  it.each([
    null,
    '',
    '{"stage":"private-sentinel"}\n',
    '{ "stage": "host-environment-keyset-expected-only" }\n',
  ])('rejects non-closed writer input without an attempt: %j', async (line) => {
    const write = vi.fn()
    await expect(
      classifier.writeEnvironmentKeysetForFixture(line, write),
    ).resolves.toBe(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the fixture facade test-only and does not run main on import', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write')
    const stderrWrite = vi.spyOn(process.stderr, 'write')
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const nonTest = (await import(
        `${new URL(modulePath, import.meta.url).href}?non-test`
      )) as {
        classifyEnvironmentKeysetForFixture: unknown
        formatEnvironmentKeysetForFixture: unknown
        writeEnvironmentKeysetForFixture: unknown
      }
      expect(nonTest.classifyEnvironmentKeysetForFixture).toBeUndefined()
      expect(nonTest.formatEnvironmentKeysetForFixture).toBeUndefined()
      expect(nonTest.writeEnvironmentKeysetForFixture).toBeUndefined()
      expect(stdoutWrite).not.toHaveBeenCalled()
      expect(stderrWrite).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      stdoutWrite.mockRestore()
      stderrWrite.mockRestore()
    }
  })

  it('has the exact isolated production surface and profile literals', async () => {
    const source = await readFile(modulePath, 'utf8')
    expect(source).toContain("'classify-public-host-environment-keyset'")
    expect(source).toContain(
      "'--confirm-m45-public-host-environment-keyset-v1'",
    )
    expect(source).toContain('Object.keys(process.env).sort()')
    expect(source).toContain("'host-environment-keyset-expected-plus-cf'")
    expect(source).toContain("'host-environment-keyset-expected-plus-malloc'")
    expect(source).not.toContain('process.env[')
    expect(source).not.toContain('environmentValue')
    expect(source).not.toContain('diagnose-public-host-admission')
    expect(source).not.toContain('confirm-m45-public-host-admission')
    expect(source.match(/^import /gmu)).toHaveLength(2)
    expect(source.match(/process\.env\./gmu)).toHaveLength(1)
    expect(source).toContain("process.env.NODE_ENV === 'test'")
  })

  it('has no filesystem, child, timer, network, mutation, or logging capability', async () => {
    const source = await readFile(modulePath, 'utf8')
    const forbidden = [
      'node:fs',
      'node:child_process',
      'node:path',
      'node:net',
      'node:http',
      'node:https',
      'node:dns',
      'node:crypto',
      'spawn',
      'execFile',
      'setTimeout',
      'setInterval',
      'scratch',
      'retained',
      'xattr',
      'open(',
      'readFile',
      'writeFile',
      'readdir',
      'unlink',
      'rmdir',
      'rename',
      'chmod',
      'chown',
      'mkdir',
      'console.',
      'process.stderr',
      'Math.random',
      'randomUUID',
      '../src/',
      'provider',
      'database',
      'UUID',
      'process.env[name]',
    ]
    for (const needle of forbidden) expect(source).not.toContain(needle)
    expect(source.match(/process\.stdout\.write/gmu)).toHaveLength(1)
  })

  it('has no tracked non-test consumer or reverse import', async () => {
    const repositoryRoot = join(fileURLToPath(new URL('..', import.meta.url)))
    const tracked = execFileSync(
      'git',
      ['ls-files', '--', '*.js', '*.jsx', '*.mjs', '*.ts', '*.tsx'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(
        (path) =>
          path !==
            'scripts/m45-public-host-environment-keyset-classifier.mjs' &&
          path !==
            'src/m45-public-host-environment-keyset-classifier.test.ts' &&
          path !== 'scripts/m45-public-scratch-xattr-classifier.mjs' &&
          path !== 'src/m45-public-scratch-xattr-classifier.test.ts' &&
          path !== 'scripts/m45-public-fd-residue-shape-classifier.mjs' &&
          path !== 'src/m45-public-fd-residue-shape-classifier.test.ts',
      )
    const forbidden = [
      'm45-public-host-environment-keyset-classifier',
      'classifyEnvironmentKeysetForFixture',
      'formatEnvironmentKeysetForFixture',
      'writeEnvironmentKeysetForFixture',
    ]
    for (const path of tracked) {
      const source = await readFile(join(repositoryRoot, path), 'utf8')
      for (const needle of forbidden) expect(source).not.toContain(needle)
    }
  })
})
