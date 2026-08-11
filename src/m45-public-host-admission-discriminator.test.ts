import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const modulePath = fileURLToPath(
  new URL(
    '../scripts/m45-public-host-admission-discriminator.mjs',
    import.meta.url,
  ),
)
const discriminator = (await import(
  new URL(modulePath, import.meta.url).href
)) as {
  classifyPublicHostAdmissionForFixture: (
    argv: readonly string[],
    readers: Record<string, unknown>,
  ) => Readonly<{ stage: string }>
  formatPublicHostAdmissionForFixture: (
    result: unknown,
  ) => Readonly<{ line: string; exitCode: number }>
  writePublicHostAdmissionForFixture: (
    line: unknown,
    write: unknown,
  ) => Promise<number>
}

const argv = [
  'diagnose-public-host-admission',
  '--confirm-m45-public-host-admission-v1',
] as const
const stages = [
  'host-environment-keyset',
  'host-platform',
  'host-node-version',
  'host-exec-path',
  'host-cwd',
  'host-euid',
  'host-lc-all',
  'host-lang',
  'host-tz',
  'host-pass',
  'stopped',
] as const

function readerFixture(overrides: Record<string, unknown> = {}) {
  const events: string[] = []
  const environment = { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' }
  const readers = {
    environmentKeys: vi.fn(() => {
      events.push('environment-keyset')
      return ['LANG', 'LC_ALL', 'TZ']
    }),
    platform: vi.fn(() => {
      events.push('platform')
      return 'darwin'
    }),
    nodeVersion: vi.fn(() => {
      events.push('node-version')
      return '24.18.1'
    }),
    execPath: vi.fn(() => {
      events.push('exec-path')
      return '/opt/homebrew/Cellar/node@24/24.18.1/bin/node'
    }),
    cwd: vi.fn(() => {
      events.push('cwd')
      return '/'
    }),
    resolveCwd: vi.fn(() => {
      events.push('cwd-resolution')
      return '/'
    }),
    euid: vi.fn(() => {
      events.push('euid')
      return { available: true, value: 501 }
    }),
    environmentValue: vi.fn((name: keyof typeof environment): unknown => {
      events.push(name.toLowerCase().replace('_', '-'))
      return environment[name]
    }),
    ...overrides,
  }
  return { events, readers }
}

const fullOrder = [
  'environment-keyset',
  'platform',
  'node-version',
  'exec-path',
  'cwd',
  'cwd-resolution',
  'euid',
  'lc-all',
  'lang',
  'tz',
] as const

describe('Decision 135 public host admission discriminator', () => {
  const rejectedArgv: readonly (readonly string[])[] = [
    [],
    ['diagnose-public-host-admission'],
    [
      '--confirm-m45-public-host-admission-v1',
      'diagnose-public-host-admission',
    ],
    [
      'diagnose-public-host-admission',
      '--confirm-m45-public-host-admission-v0',
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
  ]

  it.each(rejectedArgv.map((candidate) => [candidate] as const))(
    'rejects non-D135 argv before every synthetic host read: %j',
    (candidate) => {
      const fixture = readerFixture()
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          candidate,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
      expect(fixture.events).toEqual([])
    },
  )

  it('admits the exact inert argv and reads every passing field in order', () => {
    const fixture = readerFixture()
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        fixture.readers,
      ),
    ).toEqual({ stage: 'host-pass' })
    expect(fixture.events).toEqual(fullOrder)
  })

  it('maps ambiguous argv shape to stopped before every host read', () => {
    const fixture = readerFixture()
    const ambiguousArgv = new Proxy([...argv], {
      get() {
        throw new Error('private-argv-sentinel')
      },
    })
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        ambiguousArgv,
        fixture.readers,
      ),
    ).toEqual({ stage: 'stopped' })
    expect(fixture.events).toEqual([])
  })

  it.each(
    [
      (() => {
        const sparse = new Array<string>(2)
        Object.setPrototypeOf(sparse, {
          0: argv[0],
          1: argv[1],
        })
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
    ].map((candidate) => [candidate] as const),
  )(
    'rejects sparse/inherited, proxied, accessor, and extra-key argv before host reads',
    (candidate) => {
      const fixture = readerFixture()
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          candidate,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
      expect(fixture.events).toEqual([])
    },
  )

  it.each([
    [
      'environmentKeys',
      (): unknown => ['LANG', 'TZ'],
      'host-environment-keyset',
      1,
    ],
    ['platform', (): unknown => 'linux', 'host-platform', 2],
    ['nodeVersion', (): unknown => '24.18.0', 'host-node-version', 3],
    ['execPath', (): unknown => '/usr/bin/node', 'host-exec-path', 4],
    ['cwd', (): unknown => '/tmp', 'host-cwd', 5],
    ['resolveCwd', (): unknown => '/private', 'host-cwd', 6],
    ['euid', (): unknown => ({ available: true, value: 502 }), 'host-euid', 7],
  ] as const)(
    'stops at the exact first host mismatch for %s',
    (name, replacement, stage, prefixLength) => {
      const fixture = readerFixture({ [name]: vi.fn(replacement) })
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          argv,
          fixture.readers,
        ),
      ).toEqual({ stage })
      expect(fixture.events).toEqual(fullOrder.slice(0, prefixLength - 1))
      expect(
        fixture.readers[name as keyof typeof fixture.readers],
      ).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ['LC_ALL', 'POSIX', 'host-lc-all', 8],
    ['LANG', 'en_GB.UTF-8', 'host-lang', 9],
    ['TZ', 'Europe/London', 'host-tz', 10],
  ] as const)(
    'stops at the exact first environment-value mismatch for %s',
    (name, value, stage, length) => {
      const fixture = readerFixture()
      fixture.readers.environmentValue.mockImplementation(
        (candidate: keyof typeof environmentValues) => {
          fixture.events.push(candidate.toLowerCase().replace('_', '-'))
          return candidate === name ? value : environmentValues[candidate]
        },
      )
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          argv,
          fixture.readers,
        ),
      ).toEqual({ stage })
      expect(fixture.events).toEqual(fullOrder.slice(0, length))
    },
  )

  it.each([
    [['LANG', 'LC_ALL']],
    [['EXTRA', 'LANG', 'LC_ALL', 'TZ']],
    [['EXTRA', 'LC_ALL']],
    [['TZ', 'LC_ALL', 'LANG']],
  ] as const)(
    'closes an inexact environment keyset without reading any value',
    (keys) => {
      const fixture = readerFixture({ environmentKeys: vi.fn(() => keys) })
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          argv,
          fixture.readers,
        ),
      ).toEqual({ stage: 'host-environment-keyset' })
      expect(fixture.readers.environmentValue).not.toHaveBeenCalled()
      expect(fixture.readers.platform).not.toHaveBeenCalled()
    },
  )

  it('enumerates sensitive unexpected names without dereferencing or reflecting them', () => {
    const sensitiveName = 'private-sensitive-sentinel'
    const valueRead = vi.fn(() => {
      throw new Error('private-sensitive-value')
    })
    const environment = Object.defineProperty(
      { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' },
      sensitiveName,
      { enumerable: true, get: valueRead },
    )
    const fixture = readerFixture({
      environmentKeys: vi.fn(() => Object.keys(environment).sort()),
    })
    const result = discriminator.classifyPublicHostAdmissionForFixture(
      argv,
      fixture.readers,
    )
    const formatted = discriminator.formatPublicHostAdmissionForFixture(result)
    expect(result).toEqual({ stage: 'host-environment-keyset' })
    expect(valueRead).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(sensitiveName)
    expect(formatted.line).not.toContain(sensitiveName)
    expect(fixture.readers.environmentValue).not.toHaveBeenCalled()
  })

  it.each([
    ['environmentKeys', null],
    ['environmentKeys', ['LANG', 1, 'TZ']],
    ['platform', null],
    ['nodeVersion', {}],
    ['execPath', 1],
    ['cwd', null],
    ['resolveCwd', []],
    ['euid', null],
    ['euid', { available: false, value: 501 }],
    ['euid', { available: true, value: 501, extra: true }],
    ['euid', { available: true, value: -1 }],
    [
      'environmentKeys',
      Object.assign(['LANG', 'LC_ALL', 'TZ'], { extra: 'private' }),
    ],
  ] as const)(
    'maps malformed %s observations to generic stopped',
    (name, value) => {
      const fixture = readerFixture({ [name]: vi.fn(() => value) })
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          argv,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
    },
  )

  it('rejects a sparse environment-key array as a malformed snapshot', () => {
    const sparse = new Array<string>(3)
    sparse[0] = 'LANG'
    sparse[2] = 'TZ'
    const fixture = readerFixture({ environmentKeys: vi.fn(() => sparse) })
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        fixture.readers,
      ),
    ).toEqual({ stage: 'stopped' })
    expect(fixture.readers.platform).not.toHaveBeenCalled()
  })

  it.each([
    ['LC_ALL', undefined],
    ['LANG', null],
    ['TZ', 1],
  ] as const)('maps malformed %s values to generic stopped', (name, value) => {
    const fixture = readerFixture()
    fixture.readers.environmentValue.mockImplementation(
      (candidate: keyof typeof environmentValues) =>
        candidate === name ? value : environmentValues[candidate],
    )
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        fixture.readers,
      ),
    ).toEqual({ stage: 'stopped' })
  })

  it.each([
    ['environmentKeys', 0],
    ['platform', 1],
    ['nodeVersion', 2],
    ['execPath', 3],
    ['cwd', 4],
    ['resolveCwd', 5],
    ['euid', 6],
    ['environmentValue', 7],
  ] as const)(
    'maps a throwing %s accessor to stopped without later reads',
    (name, prefix) => {
      const fixture = readerFixture({
        [name]: vi.fn(() => {
          throw new Error('private-accessor-sentinel')
        }),
      })
      expect(
        discriminator.classifyPublicHostAdmissionForFixture(
          argv,
          fixture.readers,
        ),
      ).toEqual({ stage: 'stopped' })
      expect(fixture.events).toEqual(fullOrder.slice(0, prefix))
    },
  )

  it('classifies a missing geteuid separately from malformed or throwing access', () => {
    const missing = readerFixture({
      euid: vi.fn(() => ({ available: false, value: null })),
    })
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        missing.readers,
      ),
    ).toEqual({ stage: 'host-euid' })
    expect(missing.readers.environmentValue).not.toHaveBeenCalled()
  })

  it('preserves precedence when multiple synthetic predicates differ', () => {
    const environmentFirst = readerFixture({
      environmentKeys: vi.fn(() => ['LANG', 'TZ']),
      platform: vi.fn(() => 'linux'),
    })
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        environmentFirst.readers,
      ),
    ).toEqual({ stage: 'host-environment-keyset' })
    expect(environmentFirst.readers.platform).not.toHaveBeenCalled()

    const cwdFirst = readerFixture({
      cwd: vi.fn(() => '/tmp'),
      euid: vi.fn(() => ({ available: true, value: 0 })),
    })
    expect(
      discriminator.classifyPublicHostAdmissionForFixture(
        argv,
        cwdFirst.readers,
      ),
    ).toEqual({ stage: 'host-cwd' })
    expect(cwdFirst.readers.euid).not.toHaveBeenCalled()
  })

  it.each(stages)('formats the closed %s result and exact exit', (stage) => {
    expect(
      discriminator.formatPublicHostAdmissionForFixture({ stage }),
    ).toEqual({
      line: `{"stage":"${stage}"}\n`,
      exitCode: stage === 'stopped' ? 1 : 0,
    })
  })

  it.each([
    null,
    [],
    {},
    { stage: 'private-sentinel' },
    { stage: 'host-pass', extra: true },
  ])('maps malformed formatter input to the sole stopped line', (value) => {
    expect(discriminator.formatPublicHostAdmissionForFixture(value)).toEqual({
      line: '{"stage":"stopped"}\n',
      exitCode: 1,
    })
  })

  it('maps a throwing formatter snapshot to the sole stopped line', () => {
    const ambiguous = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('private-formatter-sentinel')
        },
      },
    )
    expect(
      discriminator.formatPublicHostAdmissionForFixture(ambiguous),
    ).toEqual({
      line: '{"stage":"stopped"}\n',
      exitCode: 1,
    })
  })

  it.each([
    Object.create({ stage: 'host-pass' }) as object,
    new Proxy({ stage: 'host-pass' }, {}),
    Object.defineProperty({}, 'stage', {
      enumerable: true,
      get: () => 'host-pass',
    }),
    { wrong: 'host-pass' },
  ])(
    'rejects inherited, proxied, accessor, and wrong-key formatter shapes',
    (value) => {
      expect(discriminator.formatPublicHostAdmissionForFixture(value)).toEqual({
        line: '{"stage":"stopped"}\n',
        exitCode: 1,
      })
    },
  )

  it('exposes no fixture facade on a cache-busted non-test import and does not run main', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write')
    const stderrWrite = vi.spyOn(process.stderr, 'write')
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const nonTest = (await import(
        `${new URL(modulePath, import.meta.url).href}?non-test`
      )) as {
        classifyPublicHostAdmissionForFixture: unknown
        formatPublicHostAdmissionForFixture: unknown
        writePublicHostAdmissionForFixture: unknown
      }
      expect(nonTest.classifyPublicHostAdmissionForFixture).toBeUndefined()
      expect(nonTest.formatPublicHostAdmissionForFixture).toBeUndefined()
      expect(nonTest.writePublicHostAdmissionForFixture).toBeUndefined()
      expect(stdoutWrite).not.toHaveBeenCalled()
      expect(stderrWrite).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      stdoutWrite.mockRestore()
      stderrWrite.mockRestore()
    }
  })

  it('writes an already-formatted closed line exactly once', async () => {
    const write = vi.fn(async () => undefined)
    await expect(
      discriminator.writePublicHostAdmissionForFixture(
        '{"stage":"host-pass"}\n',
        write,
      ),
    ).resolves.toBe(0)
    expect(write).toHaveBeenCalledExactlyOnceWith('{"stage":"host-pass"}\n')
  })

  it('writes stopped exactly once while preserving its exit 1', async () => {
    const write = vi.fn(async () => undefined)
    await expect(
      discriminator.writePublicHostAdmissionForFixture(
        '{"stage":"stopped"}\n',
        write,
      ),
    ).resolves.toBe(1)
    expect(write).toHaveBeenCalledExactlyOnceWith('{"stage":"stopped"}\n')
  })

  it.each([
    vi.fn(() => {
      throw new Error('private-write-sentinel')
    }),
    vi.fn(async () => {
      throw new Error('private-write-sentinel')
    }),
  ])(
    'maps write failure to exit 1 with one attempt and no reflection',
    async (write) => {
      await expect(
        discriminator.writePublicHostAdmissionForFixture(
          '{"stage":"host-pass"}\n',
          write,
        ),
      ).resolves.toBe(1)
      expect(write).toHaveBeenCalledOnce()
    },
  )

  it.each([
    null,
    '',
    '{"stage":"private-sentinel"}\n',
    '{ "stage": "host-pass" }\n',
  ])(
    'rejects non-closed writer input without an output attempt',
    async (line) => {
      const write = vi.fn()
      await expect(
        discriminator.writePublicHostAdmissionForFixture(line, write),
      ).resolves.toBe(1)
      expect(write).not.toHaveBeenCalled()
    },
  )

  it('has the exact tiny production surface and predicate order', async () => {
    const source = await readFile(modulePath, 'utf8')
    expect(source).toContain('Object.keys(process.env).sort()')
    expect(source).toContain("'diagnose-public-host-admission'")
    expect(source).toContain("'--confirm-m45-public-host-admission-v1'")
    expect(source).toContain(
      'process.argv[1] === fileURLToPath(import.meta.url)',
    )
    expect(source).not.toContain('resolve(process.argv[1])')
    expect(source).not.toContain('confirm-m45-public-scratch')
    expect(source).not.toContain('/private/')
    expect(source).not.toContain('xattr')

    const sequence = [
      'environmentKeys()',
      'platform()',
      'nodeVersion()',
      'execPath()',
      'cwd()',
      'resolveCwd(cwd)',
      'euid()',
      "environmentValue('LC_ALL')",
      "environmentValue('LANG')",
      "environmentValue('TZ')",
    ]
    let position = -1
    for (const needle of sequence) {
      const next = source.indexOf(needle, position + 1)
      expect(next).toBeGreaterThan(position)
      position = next
    }
  })

  it('statically excludes filesystem, child, timer, network, mutation, and logging capability', async () => {
    const source = await readFile(modulePath, 'utf8')
    const forbidden = [
      'node:fs',
      'node:child_process',
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
      'm45-policy',
      'provider',
      'database',
    ]
    for (const needle of forbidden) expect(source).not.toContain(needle)
    expect(source.match(/^import /gmu)).toHaveLength(3)
    expect(source.match(/process\.stdout\.write/gmu)).toHaveLength(1)
  })

  it('has no tracked non-test consumer or reverse import', async () => {
    const repositoryRoot = join(fileURLToPath(new URL('..', import.meta.url)))
    const tracked = execFileSync(
      'git',
      ['ls-files', '--', '*.js', '*.jsx', '*.mjs', '*.ts', '*.tsx'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
      },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(
        (path) =>
          path !== 'scripts/m45-public-host-admission-discriminator.mjs' &&
          path !== 'src/m45-public-host-admission-discriminator.test.ts',
      )
    const forbidden = [
      'm45-public-host-admission-discriminator',
      'classifyPublicHostAdmissionForFixture',
      'formatPublicHostAdmissionForFixture',
      'writePublicHostAdmissionForFixture',
    ]
    for (const path of tracked) {
      const source = await readFile(join(repositoryRoot, path), 'utf8')
      for (const needle of forbidden) expect(source).not.toContain(needle)
    }
  })
})

const environmentValues = { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' }
