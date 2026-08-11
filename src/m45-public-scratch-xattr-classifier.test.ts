import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const moduleUrl = new URL(
  '../scripts/m45-public-scratch-xattr-classifier.mjs',
  import.meta.url,
).href
const classifier = (await import(moduleUrl)) as {
  routePublicScratchLsBytesForFixture: (
    bytes: unknown,
    gid: number,
  ) => Readonly<{ failureStage: string | null; privateClass: string | null }>
  runPublicScratchStageCoreForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
  ) => Promise<Readonly<{ stage: string }>>
  runPublicScratchStageChildForFixture: (
    operations: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  formatPublicScratchStageForFixture: (
    result: Record<string, unknown>,
  ) => Readonly<{ line: string; exitCode: number }>
}

const fixedPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const argv = [
  'diagnose-public-scratch-classifier-stop',
  '--confirm-m45-public-scratch-classifier-stop-v1',
] as const
const retiredArgv = [
  'classify-public-scratch-xattr',
  '--confirm-m45-public-scratch-xattr-classifier-v1',
] as const
const gid = 20
const stages = [
  'host-admission',
  'directory-flags',
  'parent-open',
  'scratch-open',
  'pre-identity',
  'child-spawn',
  'child-timeout',
  'child-overflow',
  'child-stderr',
  'child-stream',
  'child-exit',
  'child-group',
  'post-identity',
  'parse-encoding',
  'parse-envelope',
  'parse-base',
  'parse-xattr-row',
  'parse-marker',
  'budget',
  'close',
  'pipeline-complete',
  'stopped',
] as const
const childFailureStages = [
  'child-spawn',
  'child-timeout',
  'child-overflow',
  'child-stderr',
  'child-stream',
  'child-exit',
  'child-group',
] as const
const base = (mode = 'drwx------@', overrides: readonly string[] = []) =>
  [
    '13940765',
    mode,
    '2',
    '501',
    String(gid),
    '64',
    'Aug',
    '11',
    '12:34',
    fixedPath,
  ]
    .map((value, index) => overrides[index] ?? value)
    .join(' ')
const attribute = (name: string, size: string, spaces = ' ') =>
  `${name}\t${spaces}${size}`
const output = (mode: string, rows: readonly string[] = []) =>
  Buffer.from(
    `${base(mode)}\n${rows.map((row) => `\t${row}`).join('\n')}${rows.length === 0 ? '' : '\n'}`,
  )
const validOutputs = [
  [
    output('drwx------@', [attribute('com.apple.provenance', '11')]),
    'only-provenance-11',
  ],
  [output('drwx------'), 'no-xattr'],
  [
    output('drwx------@', [attribute('com.example.unknown', '7')]),
    'other-xattr-set',
  ],
] as const

const parentMetadata = {
  uid: 0,
  gid: 0,
  dev: 16777231,
  ino: 13457399,
  mode: 0o1777,
  nlink: 8,
  size: 192,
  directory: true,
  symbolicLink: false,
}
const scratchMetadata = {
  uid: 501,
  gid,
  dev: 16777231,
  ino: 13940765,
  mode: 0o700,
  nlink: 2,
  size: 64,
  directory: true,
  symbolicLink: false,
}
const host = {
  platform: 'darwin',
  nodeVersion: '24.18.1',
  execPath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
  cwd: '/',
  euid: 501,
  environment: { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' },
}
const goodChild = (stdout = validOutputs[0][0]) => ({
  failureStage: null,
  spawnFault: false,
  streamFault: false,
  groupFault: false,
  stdout,
  stderr: Buffer.alloc(0),
  code: 0,
  signal: null,
  streamsClosed: true,
  groupAbsent: true,
  timedOut: false,
  overflow: false,
})
const childWithStage = (failureStage: (typeof childFailureStages)[number]) => ({
  ...goodChild(),
  failureStage,
  spawnFault: failureStage === 'child-spawn',
  streamFault: failureStage === 'child-stream',
  groupFault: failureStage === 'child-group',
  timedOut: failureStage === 'child-timeout',
  overflow: failureStage === 'child-overflow',
  stderr:
    failureStage === 'child-stderr'
      ? Buffer.from('private-sentinel')
      : Buffer.alloc(0),
  code: failureStage === 'child-exit' ? 1 : 0,
})

function driftMetadata(metadata: typeof scratchMetadata, field?: string) {
  if (field === undefined) return { ...metadata }
  if (field === 'directory') return { ...metadata, directory: false }
  if (field === 'symbolicLink') return { ...metadata, symbolicLink: true }
  return {
    ...metadata,
    [field]: Number(metadata[field as keyof typeof metadata]) + 1,
  }
}

function coreFixture(
  options: {
    child?: Record<string, unknown>
    childError?: boolean
    openError?: 'parent' | 'scratch'
    closeError?: 'parent' | 'scratch'
    flagsError?: boolean
    host?: Record<string, unknown>
    now?: () => number
    drift?: {
      role: 'parent' | 'scratch'
      scope: 'held' | 'named'
      phase: 'pre' | 'post'
      field: string
    }
  } = {},
) {
  const events: string[] = []
  const counts = {
    parentHeld: 0,
    parentNamed: 0,
    scratchHeld: 0,
    scratchNamed: 0,
  }
  const observed = (role: 'parent' | 'scratch', scope: 'held' | 'named') => {
    const key =
      `${role}${scope === 'held' ? 'Held' : 'Named'}` as keyof typeof counts
    counts[key] += 1
    const phase = counts[key] === 1 ? 'pre' : 'post'
    const field =
      options.drift?.role === role &&
      options.drift.scope === scope &&
      options.drift.phase === phase
        ? options.drift.field
        : undefined
    return driftMetadata(
      role === 'parent'
        ? (parentMetadata as typeof scratchMetadata)
        : scratchMetadata,
      field,
    )
  }
  const handle = (role: 'parent' | 'scratch') => ({
    stat: vi.fn(async () => observed(role, 'held')),
    close: vi.fn(async () => {
      events.push(`close-${role}`)
      if (options.closeError === role) throw new Error('private-close')
    }),
  })
  const handles = { parent: handle('parent'), scratch: handle('scratch') }
  const dependencies = {
    host: options.host ?? host,
    now: vi.fn(options.now ?? (() => 0)),
    directoryFlags: vi.fn(() => {
      if (options.flagsError) throw new Error('private-flags')
      return 0x01100100
    }),
    openDirectory: vi.fn(async (path: string) => {
      const role = path === '/private/tmp' ? 'parent' : 'scratch'
      events.push(`open-${role}`)
      if (options.openError === role) throw new Error('private-open')
      return handles[role]
    }),
    lstat: vi.fn(async (path: string) =>
      observed(path === '/private/tmp' ? 'parent' : 'scratch', 'named'),
    ),
    runChild: vi.fn(async () => {
      events.push('child')
      if (options.childError) throw new Error('private-child')
      return options.child ?? goodChild()
    }),
  }
  return { dependencies, events, handles }
}

function childFixture(
  options: {
    stdout?: Buffer
    stderr?: Buffer
    code?: number | null
    signal?: string | null
    streamError?: boolean
    childError?: boolean
    timeout?: boolean
    spawnError?: boolean
    invalidPid?: boolean
    missingClose?: 'child' | 'stdout' | 'stderr'
    closeFirst?: boolean
    simultaneous?: boolean
    groupAbsent?: readonly boolean[]
    groupErrorAt?: number
    delayErrorAt?: number
    setupError?: 'access' | 'listener' | 'timer'
    setupEarlyErrors?: boolean
    timerOperationError?:
      'clearTimer' | 'setCompletionTimer' | 'clearCompletionTimer'
  } = {},
) {
  const stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  const stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  const child = new EventEmitter() as EventEmitter & {
    pid: number
    stdout: typeof stdout
    stderr: typeof stderr
    stdio: [null, typeof stdout, typeof stderr]
    unref: ReturnType<typeof vi.fn>
  }
  child.pid = options.invalidPid ? -1 : 123
  child.stdout = stdout
  child.stderr = stderr
  child.stdio = [null, stdout, stderr]
  child.unref = vi.fn()
  if (options.setupError === 'access')
    Object.defineProperty(child, 'stdout', {
      configurable: true,
      get: () => {
        throw new Error('private-access-setup')
      },
    })
  if (options.setupError === 'listener') {
    const originalOn = stdout.on.bind(stdout)
    stdout.on = ((event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'data') throw new Error('private-listener-setup')
      return originalOn(event, listener)
    }) as typeof stdout.on
  }
  let deadline: (() => void) | undefined
  let completion: (() => void) | undefined
  let groupCalls = 0
  let delayCalls = 0
  let earlyErrorThrown: unknown
  const absence = [...(options.groupAbsent ?? [true])]
  const operations = {
    spawnChild: vi.fn(() => {
      if (options.spawnError) throw new Error('private-spawn')
      queueMicrotask(() => {
        if (options.setupEarlyErrors)
          try {
            stdout.emit('error', new Error('private-early-stdout'))
            stderr.emit('error', new Error('private-early-stderr'))
            child.emit('error', new Error('private-early-child'))
          } catch (error) {
            earlyErrorThrown = error
          }
        if (options.closeFirst)
          child.emit('close', options.code ?? 0, options.signal ?? null)
        if (options.timeout) deadline?.()
        if (options.stdout) stdout.emit('data', options.stdout)
        if (options.stderr) stderr.emit('data', options.stderr)
        if (options.streamError || options.simultaneous)
          stdout.emit('error', new Error('private-stream'))
        if (options.childError || options.simultaneous)
          child.emit('error', new Error('private-child-error'))
        if (options.missingClose !== 'stdout') stdout.emit('close')
        if (options.missingClose !== 'stderr') stderr.emit('close')
        if (!options.closeFirst && options.missingClose !== 'child')
          child.emit('close', options.code ?? 0, options.signal ?? null)
        if (options.missingClose) {
          if (
            !options.timeout &&
            !options.stderr &&
            !options.streamError &&
            !options.childError &&
            options.code === undefined &&
            options.signal === undefined
          )
            deadline?.()
          queueMicrotask(() => completion?.())
        }
        if (options.setupError) queueMicrotask(() => completion?.())
      })
      return child
    }),
    killGroup: vi.fn(),
    groupAbsent: vi.fn(() => {
      groupCalls += 1
      if (groupCalls === options.groupErrorAt) throw new Error('private-probe')
      return absence.shift() ?? true
    }),
    delay: vi.fn(async () => {
      delayCalls += 1
      if (delayCalls === options.delayErrorAt) throw new Error('private-delay')
    }),
    setTimer: vi.fn((callback: () => void) => {
      if (options.setupError === 'timer') throw new Error('private-timer-setup')
      deadline = callback
      return 1
    }),
    clearTimer: vi.fn(() => {
      deadline = undefined
      if (options.timerOperationError === 'clearTimer')
        throw new Error('private-clear-timer')
    }),
    setCompletionTimer: vi.fn((callback: () => void) => {
      if (options.timerOperationError === 'setCompletionTimer')
        throw new Error('private-set-completion')
      completion = callback
      return 2
    }),
    clearCompletionTimer: vi.fn(() => {
      completion = undefined
      if (options.timerOperationError === 'clearCompletionTimer')
        throw new Error('private-clear-completion')
    }),
  }
  return {
    operations,
    child,
    stdout,
    stderr,
    fireDeadline: () => deadline?.(),
    earlyErrorThrown: () => earlyErrorThrown,
  }
}

const runCore = async (
  current: ReturnType<typeof coreFixture>,
  args: readonly string[] = argv,
) => classifier.runPublicScratchStageCoreForFixture(args, current.dependencies)
const runChild = async (current: ReturnType<typeof childFixture>) =>
  classifier.runPublicScratchStageChildForFixture(current.operations)

describe('D134 public scratch classifier stop-stage diagnostic', () => {
  it('keeps every fixture seam closed outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const core = coreFixture()
    const child = childFixture()
    try {
      expect(() =>
        classifier.routePublicScratchLsBytesForFixture(Buffer.from('x'), gid),
      ).toThrow('fixture-only')
      await expect(runCore(core)).rejects.toThrow('fixture-only')
      await expect(runChild(child)).rejects.toThrow('fixture-only')
      expect(() =>
        classifier.formatPublicScratchStageForFixture({ stage: 'stopped' }),
      ).toThrow('fixture-only')
      expect(core.dependencies.openDirectory).not.toHaveBeenCalled()
      expect(child.operations.spawnChild).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(validOutputs)(
    'privately parses a valid underlying class without exposing it from core',
    (bytes, privateClass) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        expect(
          classifier.routePublicScratchLsBytesForFixture(bytes, gid),
        ).toEqual({ failureStage: null, privateClass })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    [Buffer.from([0xff, 0x0a]), 'parse-encoding'],
    [Buffer.alloc(0), 'parse-envelope'],
    [Buffer.alloc(4097), 'parse-envelope'],
    [Buffer.from(base()), 'parse-envelope'],
    [Buffer.from(`${base()}\r\n`), 'parse-envelope'],
    [Buffer.from(`${base()}\0\n`), 'parse-envelope'],
    [Buffer.from(`${base()}\n\téxample\t 1\n`), 'parse-envelope'],
    [Buffer.from(`${base()}\n${'x'.repeat(513)}\n`), 'parse-envelope'],
    [
      Buffer.from(`${base()}\n${Array(8).fill('\tcom.x\t 1').join('\n')}\n`),
      'parse-envelope',
    ],
    [Buffer.from(` ${base()}\n`), 'parse-base'],
    [Buffer.from(`${base()} extra\n`), 'parse-base'],
    [Buffer.from(`${base('drwx------@', ['1'])}\n\tcom.x\t 1\n`), 'parse-base'],
    [output('drwx------@', ['bad+name\t 1']), 'parse-xattr-row'],
    [output('drwx------@', [attribute('com.x', '01')]), 'parse-xattr-row'],
    [
      output('drwx------@', [attribute('com.x', '1'), attribute('com.x', '2')]),
      'parse-xattr-row',
    ],
    [output('drwx------@'), 'parse-marker'],
    [output('drwx------', [attribute('com.x', '1')]), 'parse-marker'],
  ])('routes synthetic parser failure %# to %s', (bytes, failureStage) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const result = classifier.routePublicScratchLsBytesForFixture(bytes, gid)
      expect(result).toEqual({ failureStage, privateClass: null })
      expect(JSON.stringify(result)).not.toMatch(/bad\+name|com\.x/u)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('enforces exact parser envelope, base, row, and marker boundaries', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const route = (bytes: Buffer) =>
        classifier.routePublicScratchLsBytesForFixture(bytes, gid).failureStage
      expect(route(Buffer.alloc(4096, 0x20))).toBe('parse-envelope')
      expect(route(Buffer.from(`${base()}\n${'x'.repeat(512)}\n`))).toBe(
        'parse-xattr-row',
      )
      expect(route(Buffer.from(`${base()}\n${'x'.repeat(513)}\n`))).toBe(
        'parse-envelope',
      )
      expect(route(Buffer.from(`${base()}\u0001\n`))).toBe('parse-envelope')
      expect(route(Buffer.from(`${base()}\u007f\n`))).toBe('parse-envelope')
      expect(
        route(Buffer.from(`${base().split(' ').slice(0, 9).join(' ')}\n`)),
      ).toBe('parse-base')
      expect(route(Buffer.from(`${base()} extra\n`))).toBe('parse-base')

      const name127 = `a${'b'.repeat(126)}`
      expect(
        classifier.routePublicScratchLsBytesForFixture(
          output('drwx------@', [attribute(name127, '9999999999', '')]),
          gid,
        ),
      ).toEqual({ failureStage: null, privateClass: 'other-xattr-set' })
      for (const row of [
        attribute(`a${'b'.repeat(127)}`, '1'),
        attribute('-leading', '1'),
        attribute('bad+character', '1'),
        attribute('valid', '01'),
        attribute('valid', '10000000000'),
        '0: user:501 allow read',
      ])
        expect(route(output('drwx------@', [row]))).toBe('parse-xattr-row')
      expect(
        classifier.routePublicScratchLsBytesForFixture(
          output('drwx------@', [attribute('valid', '0')]),
          gid,
        ).failureStage,
      ).toBeNull()
      expect(
        classifier.routePublicScratchLsBytesForFixture(
          output(
            'drwx------@',
            Array.from({ length: 7 }, (_, index) =>
              attribute(`a${index}`, String(index)),
            ),
          ),
          gid,
        ).failureStage,
      ).toBeNull()
      expect(
        route(
          output(
            'drwx------@',
            Array.from({ length: 8 }, (_, index) =>
              attribute(`a${index}`, '1'),
            ),
          ),
        ),
      ).toBe('parse-envelope')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(validOutputs)(
    'latches pipeline-complete only after custody closes for valid class %#',
    async (bytes) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child: goodChild(bytes) })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'pipeline-complete',
        })
        expect(current.events).toEqual([
          'open-parent',
          'open-scratch',
          'child',
          'close-scratch',
          'close-parent',
        ])
        expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
          1,
          '/private/tmp',
          0x01100100,
        )
        expect(current.dependencies.directoryFlags).toHaveBeenCalledOnce()
        expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
          2,
          fixedPath,
          0x01100100,
        )
        expect(
          JSON.stringify(
            await runCore(coreFixture({ child: goodChild(bytes) })),
          ),
        ).not.toMatch(/xattr|provenance|unknown/u)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    { args: [] },
    { args: [argv[0]] },
    { args: [argv[0], 'wrong'] },
    { args: [...argv, 'extra'] },
    { args: retiredArgv },
  ])(
    'rejects retired or malformed grammar before every boundary',
    async ({ args }) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture()
      try {
        await expect(runCore(current, args)).resolves.toEqual({
          stage: 'stopped',
        })
        expect(current.dependencies.now).not.toHaveBeenCalled()
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
        expect(current.dependencies.runChild).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    ['platform', 'linux'],
    ['nodeVersion', '24.18.0'],
    ['execPath', '/usr/bin/node'],
    ['cwd', '/tmp'],
    ['euid', 0],
    ['environment', { LC_ALL: 'C', LANG: 'C', TZ: 'UTC', EXTRA: '1' }],
  ] as const)(
    'routes host %s drift to host-admission',
    async (field, value) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ host: { ...host, [field]: value } })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'host-admission',
        })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    { ...host, extra: 'closed' },
    { ...host, environment: { LC_ALL: 'C', LANG: 'C' } },
    { ...host, environment: { LC_ALL: 'C', LANG: 'C', TZ: 'UTC', EXTRA: '1' } },
    { ...host, environment: { LC_ALL: 'wrong', LANG: 'C', TZ: 'UTC' } },
    { ...host, environment: { LC_ALL: 'C', LANG: 'wrong', TZ: 'UTC' } },
    { ...host, environment: { LC_ALL: 'C', LANG: 'C', TZ: 'wrong' } },
    { ...host, environment: null },
  ])(
    'rejects missing or extra host/environment keys exactly',
    async (driftedHost) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ host: driftedHost })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'host-admission',
        })
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(childFailureStages)(
    'copies outer child stage %s before the later budget boundary',
    async (failureStage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({
        child: childWithStage(failureStage),
      })
      try {
        const result = await runCore(current)
        expect(result).toEqual({ stage: failureStage })
        expect(JSON.stringify(result)).not.toContain('private-sentinel')
        expect(current.events.slice(-2)).toEqual([
          'close-scratch',
          'close-parent',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    [Buffer.from([0xff, 0x0a]), 'parse-encoding'],
    [Buffer.from(base()), 'parse-envelope'],
    [Buffer.from(`${base()} extra\n`), 'parse-base'],
    [output('drwx------@', ['private+sentinel\t 1']), 'parse-xattr-row'],
    [output('drwx------@'), 'parse-marker'],
  ] as const)(
    'routes full-pipeline parser boundary %# to %s after child custody',
    async (stdout, stage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child: goodChild(stdout) })
      try {
        const result = await runCore(current)
        expect(result).toEqual({ stage })
        expect(JSON.stringify(result)).not.toContain('private+sentinel')
        expect(current.events.slice(-2)).toEqual([
          'close-scratch',
          'close-parent',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('performs exactly twenty read-only probes and no twenty-first', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ groupAbsent: Array(21).fill(false) })
    try {
      expect((await runChild(current)).failureStage).toBe('child-group')
      expect(current.operations.groupAbsent).toHaveBeenCalledTimes(20)
      expect(current.operations.delay).toHaveBeenCalledTimes(19)
      expect(current.operations.killGroup).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [coreFixture({ flagsError: true }), 'directory-flags'],
    [coreFixture({ openError: 'parent' }), 'parent-open'],
    [coreFixture({ openError: 'scratch' }), 'scratch-open'],
    [coreFixture({ childError: true }), 'child-spawn'],
  ] as const)(
    'routes injected boundary failure %# to %s',
    async (current, stage) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        await expect(runCore(current)).resolves.toEqual({ stage })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  const identityFields = {
    parent: ['directory', 'symbolicLink', 'uid', 'dev', 'ino', 'mode'],
    scratch: [
      'directory',
      'symbolicLink',
      'uid',
      'gid',
      'dev',
      'ino',
      'mode',
      'nlink',
    ],
  } as const
  for (const role of ['parent', 'scratch'] as const)
    for (const scope of ['held', 'named'] as const)
      for (const phase of ['pre', 'post'] as const)
        for (const field of identityFields[role])
          it(`routes ${phase} ${scope} ${role} ${field} drift exactly`, async () => {
            vi.stubEnv('NODE_ENV', 'test')
            const current = coreFixture({
              drift: { role, scope, phase, field },
            })
            try {
              await expect(runCore(current)).resolves.toEqual({
                stage: phase === 'pre' ? 'pre-identity' : 'post-identity',
              })
              expect(current.events.slice(-2)).toEqual([
                'close-scratch',
                'close-parent',
              ])
            } finally {
              vi.unstubAllEnvs()
            }
          })

  it.each([
    ['parent', 'gid'],
    ['parent', 'nlink'],
    ['parent', 'size'],
    ['scratch', 'size'],
  ] as const)(
    'ignores code-approved %s %s nonpredicate drift',
    async (role, field) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({
        drift: { role, scope: 'held', phase: 'pre', field },
      })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'pipeline-complete',
        })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['parent', 'scratch'] as const)(
    'makes %s close custody dominant while attempting both once',
    async (role) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({
        closeError: role,
        child: childWithStage('child-group'),
      })
      try {
        await expect(runCore(current)).resolves.toEqual({ stage: 'close' })
        expect(current.handles.scratch.close).toHaveBeenCalledOnce()
        expect(current.handles.parent.close).toHaveBeenCalledOnce()
        expect(current.events.slice(-2)).toEqual([
          'close-scratch',
          'close-parent',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('preserves an earlier child stage across a later nondominant budget failure', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const times = [0, 0, 0, 0, 0, 0, 0, 2001, 0, 0, 0, 0]
    const current = coreFixture({
      child: {
        ...childWithStage('child-stderr'),
        stderr: Buffer.from('private'),
      },
      now: () => times.shift() ?? 0,
    })
    try {
      await expect(runCore(current)).resolves.toEqual({ stage: 'child-stderr' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('routes a pre-boundary budget failure to budget', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const times = [0, 2001]
    const current = coreFixture({ now: () => times.shift() ?? 2001 })
    try {
      await expect(runCore(current)).resolves.toEqual({ stage: 'budget' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('makes close-phase budget ambiguity custody-dominant', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const times = Array(10).fill(0).concat(2001, 2001, 2001, 2001)
    const current = coreFixture({ now: () => times.shift() ?? 2001 })
    try {
      await expect(runCore(current)).resolves.toEqual({ stage: 'close' })
      expect(current.handles.scratch.close).toHaveBeenCalledOnce()
      expect(current.handles.parent.close).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    (() => {
      const missing: Record<string, unknown> = { ...goodChild() }
      delete missing.failureStage
      return missing
    })(),
    { ...goodChild(), extra: 'private-extra' },
    { ...goodChild(), failureStage: 'not-a-stage' },
  ])(
    'maps malformed child result shape to stopped without leakage',
    async (child) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child })
      try {
        const result = await runCore(current)
        expect(result).toEqual({ stage: 'stopped' })
        expect(JSON.stringify(result)).not.toContain('private-extra')
        expect(current.events.slice(-2)).toEqual([
          'close-scratch',
          'close-parent',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    { ...goodChild(), failureStage: 'child-spawn' },
    { ...goodChild(), failureStage: 'child-timeout' },
    { ...goodChild(), failureStage: 'child-overflow' },
    { ...goodChild(), failureStage: 'child-stderr' },
    { ...goodChild(), failureStage: 'child-stream' },
    { ...goodChild(), failureStage: 'child-exit' },
    { ...goodChild(), failureStage: 'child-group' },
    { ...goodChild(), spawnFault: true },
    { ...childWithStage('child-stderr'), groupFault: true },
    { ...childWithStage('child-exit'), code: {} },
    { ...childWithStage('child-exit'), code: 0, signal: 'private-signal' },
  ])(
    'maps impossible stage/evidence combination %# to stopped',
    async (child) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child })
      try {
        await expect(runCore(current)).resolves.toEqual({ stage: 'stopped' })
        expect(current.events.slice(-2)).toEqual([
          'close-scratch',
          'close-parent',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    [{ spawnError: true }, 'child-spawn'],
    [{ invalidPid: true }, 'child-spawn'],
    [{ timeout: true }, 'child-timeout'],
    [{ stdout: Buffer.alloc(4097) }, 'child-overflow'],
    [{ stderr: Buffer.from('private-stderr') }, 'child-stderr'],
    [{ streamError: true }, 'child-stream'],
    [{ childError: true }, 'child-spawn'],
    [{ code: 1 }, 'child-exit'],
    [{ signal: 'SIGTERM' }, 'child-exit'],
  ] as const)(
    'routes child lifecycle case %# to %s',
    async (options, failureStage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture(options)
      try {
        const result = await runChild(current)
        expect(result.failureStage).toBe(failureStage)
        expect(JSON.stringify(result)).not.toMatch(/private-/u)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['access', 'listener', 'timer'] as const)(
    'boundedly cleans a validated child after post-spawn %s setup failure',
    async (setupError) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture({ setupError, setupEarlyErrors: true })
      try {
        const result = await runChild(current)
        expect(result.failureStage).toBe('child-spawn')
        expect(result.spawnFault).toBe(true)
        expect(current.operations.spawnChild).toHaveBeenCalledOnce()
        expect(current.operations.killGroup).toHaveBeenCalledOnce()
        expect(current.stdout.destroy).toHaveBeenCalledOnce()
        expect(current.stderr.destroy).toHaveBeenCalledOnce()
        expect(current.child.unref).toHaveBeenCalledOnce()
        expect(current.earlyErrorThrown()).toBeUndefined()
        expect(current.stdout.listenerCount('error')).toBe(1)
        expect(current.stderr.listenerCount('error')).toBe(1)
        expect(current.child.listenerCount('error')).toBe(1)
        expect(result.groupAbsent).toBe(true)
        expect(JSON.stringify(result)).not.toMatch(
          /private-(?:access|listener|timer)/u,
        )
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('clears the ordinary timer exactly when invalid pid starts the fault path', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ invalidPid: true })
    try {
      const result = await runChild(current)
      expect(result.failureStage).toBe('child-spawn')
      expect(result.spawnFault).toBe(true)
      expect(current.operations.setTimer).toHaveBeenCalledOnce()
      expect(current.operations.clearTimer).toHaveBeenCalledOnce()
      expect(current.operations.killGroup).not.toHaveBeenCalled()
      current.fireDeadline()
      expect(current.operations.killGroup).not.toHaveBeenCalled()
      expect(result.timedOut).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['clearTimer', {}, 'child-stream'],
    [
      'setCompletionTimer',
      { stderr: Buffer.from('private-timer-sentinel') },
      'child-stderr',
    ],
    [
      'clearCompletionTimer',
      { stderr: Buffer.from('private-timer-sentinel') },
      'child-stderr',
    ],
  ] as const)(
    'fails closed without hanging when %s throws',
    async (timerOperationError, eventOptions, expectedStage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture({ ...eventOptions, timerOperationError })
      try {
        const result = await runChild(current)
        expect(result.failureStage).toBe(expectedStage)
        expect(result.streamFault).toBe(true)
        expect(JSON.stringify(result)).not.toContain('private-timer-sentinel')
        expect(current.operations.groupAbsent).toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('checks combined cap before stderr and preserves sticky first fault', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const cap = await runChild(
        childFixture({
          stdout: Buffer.alloc(4096),
          stderr: Buffer.from('private'),
        }),
      )
      expect(cap.failureStage).toBe('child-overflow')
      const sticky = await runChild(
        childFixture({
          timeout: true,
          stderr: Buffer.from('private'),
          simultaneous: true,
        }),
      )
      expect(sticky.failureStage).toBe('child-timeout')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [{ groupAbsent: [true] }, null],
    [{ groupAbsent: [false, true] }, 'child-group'],
    [{ groupErrorAt: 1, groupAbsent: [true] }, 'child-group'],
    [{ groupAbsent: [false, true], delayErrorAt: 1 }, 'child-group'],
    [{ groupAbsent: Array(21).fill(false) }, 'child-group'],
  ] as const)(
    'applies custody-dominant group matrix %#',
    async (options, failureStage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture(options)
      try {
        const result = await runChild(current)
        expect(result.failureStage).toBe(failureStage)
        expect(
          current.operations.groupAbsent.mock.calls.length,
        ).toBeLessThanOrEqual(20)
        expect(current.operations.killGroup).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('makes child-group dominate an earlier child-stderr stage', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({
      stderr: Buffer.from('private'),
      groupAbsent: [false, true],
    })
    try {
      expect((await runChild(current)).failureStage).toBe('child-group')
      expect(current.operations.killGroup).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [
      { stderr: Buffer.from('private'), missingClose: 'stdout' },
      'child-stderr',
    ],
    [{ code: 1, missingClose: 'stdout' }, 'child-exit'],
  ] as const)(
    'does not let watchdog timeout overwrite %s',
    async (options, stage) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture(options)
      try {
        expect((await runChild(current)).failureStage).toBe(stage)
        expect(current.stdout.destroy).toHaveBeenCalledOnce()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['stdout', 'stderr', 'child'] as const)(
    'boundedly disposes the missing %s close branch',
    async (missingClose) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture({ missingClose })
      try {
        const result = await runChild(current)
        expect(result.failureStage).toBe('child-timeout')
        expect(result.timedOut).toBe(true)
        expect(current.stdout.destroy).toHaveBeenCalledTimes(
          missingClose === 'stdout' ? 1 : 0,
        )
        expect(current.stderr.destroy).toHaveBeenCalledTimes(
          missingClose === 'stderr' ? 1 : 0,
        )
        expect(current.child.unref).toHaveBeenCalledTimes(
          missingClose === 'child' ? 1 : 0,
        )
        expect(current.operations.killGroup).toHaveBeenCalledTimes(
          missingClose === 'child' ? 1 : 0,
        )
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('never signals after close and permanently sinks late errors', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ closeFirst: true, missingClose: 'stdout' })
    try {
      expect((await runChild(current)).failureStage).toBe('child-timeout')
      expect(current.operations.killGroup).not.toHaveBeenCalled()
      expect(current.stdout.destroy).toHaveBeenCalledOnce()
      expect(() => {
        current.stdout.emit('error', new Error('private-late'))
        current.stderr.emit('error', new Error('private-late'))
        current.child.emit('error', new Error('private-late'))
      }).not.toThrow()
      expect(current.stdout.listenerCount('error')).toBe(1)
      expect(current.stderr.listenerCount('error')).toBe(1)
      expect(current.child.listenerCount('error')).toBe(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('formats every closed stage with its exact exit and reflects nothing else', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const stage of stages)
        expect(
          classifier.formatPublicScratchStageForFixture({ stage }),
        ).toEqual({
          line: `${JSON.stringify({ stage })}\n`,
          exitCode: stage === 'stopped' ? 1 : 0,
        })
      for (const malformed of [
        {},
        { stage: 'private-secret' },
        { stage: 'budget', extra: 'private-secret' },
      ]) {
        const result = classifier.formatPublicScratchStageForFixture(malformed)
        expect(result).toEqual({ line: '{"stage":"stopped"}\n', exitCode: 1 })
        expect(JSON.stringify(result)).not.toContain('private-secret')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps the production module isolated, fixed, and privacy-closed', async () => {
    const source = await readFile(
      new URL(
        '../scripts/m45-public-scratch-xattr-classifier.mjs',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain(
      "const operation = 'diagnose-public-scratch-classifier-stop'",
    )
    expect(source).toContain(
      "const confirmation = '--confirm-m45-public-scratch-classifier-stop-v1'",
    )
    expect(source).not.toContain(
      '--confirm-m45-public-scratch-xattr-classifier-v1',
    )
    const executeSource = source.slice(
      source.indexOf('async function executeClassifier'),
    )
    expect(executeSource).toMatch(
      /if \(exactProductionArgv\(argv\)\)[\s\S]*defaultDependencies\(\)/u,
    )
    expect(source.match(/\bspawn\(/gu)).toHaveLength(1)
    expect(source).toContain('spawn(lsPath, lsArguments, {')
    expect(source).toContain("['-lidne@B', scratchPath]")
    expect(source).toContain('detached: true')
    expect(source).toContain("cwd: '/'")
    expect(source).toContain('env: fixedEnvironment')
    expect(source).toContain('shell: false')
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']")
    expect(source).toContain('const outputCap = 4096')
    expect(source).toContain('const childTimeoutMs = 1000')
    expect(source).toContain('const operationBudgetMs = 2000')
    expect(source).toContain('const groupProbeCount = 20')
    expect(source).toContain('const groupProbeDelayMs = 10')
    expect(source).toContain('const darwinDirectory = 0x00100000')
    expect(source).toContain('fsConstants.O_DIRECTORY !== darwinDirectory')
    expect(source.match(/process\.stdout\.write/gu)).toHaveLength(1)
    expect(source).not.toContain('console.')
    expect(source).not.toContain('process.stderr')
    for (const forbidden of [
      'getxattr',
      'setxattr',
      'removexattr',
      'listxattr',
      'readFile',
      'readdir',
      'writeFile',
      'mkdir',
      'unlink',
      'rmdir',
      'rename',
      'execFile',
      'execSync',
      'spawnSync',
      'fork(',
      'createHash',
      'crypto',
      'database',
      'provider',
      'UUID',
      'release',
      'runXcrun',
    ])
      expect(source).not.toContain(forbidden)

    const root = fileURLToPath(new URL('../', import.meta.url))
    const tracked = execFileSync(
      '/usr/bin/git',
      ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs', '*.ts', '*.tsx'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean)
      .map((path) => join(root, path))
    const self = fileURLToPath(import.meta.url)
    const modulePath = join(
      root,
      'scripts/m45-public-scratch-xattr-classifier.mjs',
    )
    for (const path of tracked) {
      if (path === self || path === modulePath) continue
      const consumer = await readFile(path, 'utf8')
      expect(consumer, path).not.toContain(
        'm45-public-scratch-xattr-classifier.mjs',
      )
      expect(consumer, path).not.toMatch(/PublicScratch(?:Ls|Stage)/u)
    }
  })
})
