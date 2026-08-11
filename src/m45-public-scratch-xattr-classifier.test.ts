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
  ) => Promise<Readonly<{ stage: string } | { class: string }>>
  runPublicScratchStageChildForFixture: (
    operations: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  formatPublicScratchStageForFixture: (
    result: Record<string, unknown>,
  ) => Readonly<{ line: string; exitCode: number }>
  writePublicScratchResultForFixture: (
    line: unknown,
    write: unknown,
  ) => Promise<number>
}

const fixedPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const argv = [
  'classify-public-scratch-xattr',
  '--confirm-m45-public-scratch-xattr-classifier-v3',
] as const
const retiredArgv = [
  [
    'classify-public-scratch-xattr',
    '--confirm-m45-public-scratch-xattr-classifier-v2',
  ],
  [
    'classify-public-scratch-xattr',
    '--confirm-m45-public-scratch-xattr-classifier-v1',
  ],
  [
    'diagnose-public-scratch-classifier-stop',
    '--confirm-m45-public-scratch-classifier-stop-v1',
  ],
  ['diagnose-public-host-admission', '--confirm-m45-public-host-admission-v1'],
  [
    'classify-public-host-environment-keyset',
    '--confirm-m45-public-host-environment-keyset-v1',
  ],
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
  'parse-continuation-layout',
  'parse-xattr-row-delimiter',
  'parse-xattr-row-name',
  'parse-xattr-row-size',
  'parse-xattr-row-duplicate',
  'parse-acl-shaped-row',
  'parse-marker',
  'budget',
  'close',
  'stopped',
] as const
const privateClasses = [
  'only-provenance-11',
  'no-xattr',
  'other-xattr-set',
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
const attribute = (
  name: string,
  size: string,
  leadingSpaces = ' ',
  trailing = ' ',
) => `${name}\t${leadingSpaces}${size}${trailing}`
const output = (mode: string, rows: readonly string[] = []) =>
  Buffer.from(
    `${base(mode)}\n${rows.map((row) => `\t${row}`).join('\n')}${rows.length === 0 ? '' : '\n'}`,
  )
const continuationOutput = (mode: string, lines: readonly string[]) =>
  Buffer.from(`${base(mode)}\n${lines.join('\n')}\n`)
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
  environmentKeys: ['LANG', 'LC_ALL', 'TZ', '__CF_USER_TEXT_ENCODING'],
  platform: 'darwin',
  nodeVersion: '24.18.1',
  execPath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
  cwd: '/',
  resolvedCwd: '/',
  euid: 501,
  lcAll: 'C',
  lang: 'C',
  tz: 'UTC',
}
const hostReadOrder = [
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
    hostReaders?: Record<string, unknown>
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
  const hostEvents: string[] = []
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
  const hostValues = options.host ?? host
  const hostReaders = {
    environmentKeys: vi.fn(() => {
      hostEvents.push('environment-keyset')
      return hostValues.environmentKeys
    }),
    platform: vi.fn(() => {
      hostEvents.push('platform')
      return hostValues.platform
    }),
    nodeVersion: vi.fn(() => {
      hostEvents.push('node-version')
      return hostValues.nodeVersion
    }),
    execPath: vi.fn(() => {
      hostEvents.push('exec-path')
      return hostValues.execPath
    }),
    cwd: vi.fn(() => {
      hostEvents.push('cwd')
      return hostValues.cwd
    }),
    resolveCwd: vi.fn(() => {
      hostEvents.push('cwd-resolution')
      return hostValues.resolvedCwd
    }),
    euid: vi.fn(() => {
      hostEvents.push('euid')
      return hostValues.euid
    }),
    lcAll: vi.fn(() => {
      hostEvents.push('lc-all')
      return hostValues.lcAll
    }),
    lang: vi.fn(() => {
      hostEvents.push('lang')
      return hostValues.lang
    }),
    tz: vi.fn(() => {
      hostEvents.push('tz')
      return hostValues.tz
    }),
    ...options.hostReaders,
  }
  const dependencies = {
    hostReaders,
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
  return { dependencies, events, hostEvents, handles, hostReaders }
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

describe('D138 public scratch continuation-row classifier', () => {
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
        classifier.formatPublicScratchStageForFixture(
          Object.freeze({ stage: 'stopped' }),
        ),
      ).toThrow('fixture-only')
      await expect(
        classifier.writePublicScratchResultForFixture(
          '{"stage":"stopped"}\n',
          vi.fn(),
        ),
      ).rejects.toThrow('fixture-only')
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
    [Buffer.from(`${base()}\n\téxample\t 1 \n`), 'parse-envelope'],
    [Buffer.from(`${base()}\n${'x'.repeat(513)}\n`), 'parse-envelope'],
    [
      Buffer.from(`${base()}\n${Array(8).fill('\tcom.x\t 1 ').join('\n')}\n`),
      'parse-envelope',
    ],
    [Buffer.from(` ${base()}\n`), 'parse-base'],
    [Buffer.from(`${base()} extra\n`), 'parse-base'],
    [
      Buffer.from(`${base('drwx------@', ['1'])}\n\tcom.x\t 1 \n`),
      'parse-base',
    ],
    [output('drwx------@', ['bad+name\t 1 ']), 'parse-xattr-row-name'],
    [output('drwx------@', [attribute('com.x', '01')]), 'parse-xattr-row-size'],
    [
      output('drwx------@', [attribute('com.x', '1'), attribute('com.x', '2')]),
      'parse-xattr-row-duplicate',
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
        'parse-continuation-layout',
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
      ])
        expect(route(output('drwx------@', [row]))).toBe('parse-xattr-row-name')
      for (const row of [
        attribute('valid', '01'),
        attribute('valid', '10000000000'),
      ])
        expect(route(output('drwx------@', [row]))).toBe('parse-xattr-row-size')
      expect(
        route(continuationOutput('drwx------@', ['0: user:501 allow read'])),
      ).toBe('parse-continuation-layout')
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

  it.each([
    [
      continuationOutput('drwx------@', ['private-layout-sentinel']),
      'parse-continuation-layout',
    ],
    [
      output('drwx------@', ['private-no-delimiter']),
      'parse-xattr-row-delimiter',
    ],
    [
      output('drwx------@', ['private\t 1 \tprivate-extra']),
      'parse-xattr-row-delimiter',
    ],
    [output('drwx------@', ['private\t 1 \t']), 'parse-xattr-row-delimiter'],
    [output('drwx------@', ['\t 1 ']), 'parse-xattr-row-name'],
    [output('drwx------@', ['private+name\t 1 ']), 'parse-xattr-row-name'],
    [
      output('drwx------@', [`a${'b'.repeat(127)}\t 1 `]),
      'parse-xattr-row-name',
    ],
    [output('drwx------@', ['private-size\t']), 'parse-xattr-row-size'],
    [output('drwx------@', ['private-size\t 1']), 'parse-xattr-row-size'],
    [output('drwx------@', ['private-size\t 1  ']), 'parse-xattr-row-size'],
    [output('drwx------@', ['private-size\t +1 ']), 'parse-xattr-row-size'],
    [output('drwx------@', ['private-size\t 01 ']), 'parse-xattr-row-size'],
    [
      output('drwx------@', ['private-size\t 10000000000 ']),
      'parse-xattr-row-size',
    ],
    [output('drwx------@', ['private-size\t 1X ']), 'parse-xattr-row-size'],
    [output('drwx------@', ['private-size\t 1 X']), 'parse-xattr-row-size'],
    [
      output('drwx------@', [
        attribute('private-duplicate', '1'),
        attribute('private-duplicate', '2'),
      ]),
      'parse-xattr-row-duplicate',
    ],
    [
      continuationOutput('drwx------@', [' 0: private-acl-sentinel']),
      'parse-acl-shaped-row',
    ],
    [
      continuationOutput('drwx------@', [' 9999999999: private-acl-sentinel']),
      'parse-acl-shaped-row',
    ],
  ] as const)(
    'routes ordered continuation case %# to closed stage %s without reflection',
    (bytes, failureStage) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const result = classifier.routePublicScratchLsBytesForFixture(
          bytes,
          gid,
        )
        expect(result).toEqual({ failureStage, privateClass: null })
        expect(Object.keys(result)).toEqual(['failureStage', 'privateClass'])
        expect(JSON.stringify(result)).not.toMatch(/private-|sentinel/u)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('accepts only the published xattr size presentation and preserves boundaries', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const route = (row: string) =>
        classifier.routePublicScratchLsBytesForFixture(
          output('drwx------@', [row]),
          gid,
        )
      expect(route('com.apple.provenance\t 11 ')).toEqual({
        failureStage: null,
        privateClass: 'only-provenance-11',
      })
      for (const leadingSpaces of ['', ' ', '  ', ' '.repeat(64)])
        expect(route(attribute('valid', '0', leadingSpaces))).toEqual({
          failureStage: null,
          privateClass: 'other-xattr-set',
        })
      expect(route(attribute('valid', '9999999999', ''))).toEqual({
        failureStage: null,
        privateClass: 'other-xattr-set',
      })
      for (const trailing of ['', '  ', 'X', ' X', '!'])
        expect(route(attribute('valid', '1', ' ', trailing)).failureStage).toBe(
          'parse-xattr-row-size',
        )
      expect(route(attribute('valid', '1', ' ', ' \t')).failureStage).toBe(
        'parse-xattr-row-delimiter',
      )
      expect(route('valid\t 1\u0001').failureStage).toBe('parse-envelope')
      expect(route('valid\t 1 é').failureStage).toBe('parse-envelope')
      expect(
        classifier.routePublicScratchLsBytesForFixture(
          continuationOutput('drwx------@', [' 0: private-acl-sentinel\u0001']),
          gid,
        ).failureStage,
      ).toBe('parse-envelope')
      expect(
        classifier.routePublicScratchLsBytesForFixture(
          continuationOutput('drwx------@', [' 0: private-acl-sentinel-é']),
          gid,
        ).failureStage,
      ).toBe('parse-envelope')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ' 00: private-acl-sentinel',
    ' +1: private-acl-sentinel',
    ' -1: private-acl-sentinel',
    ' 10000000000: private-acl-sentinel',
    ' 1 private-acl-sentinel',
    ' 1:private-acl-sentinel',
    '  1: private-acl-sentinel',
  ])(
    'rejects malformed ACL-shaped prefix without suffix inspection: %s',
    (line) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const result = classifier.routePublicScratchLsBytesForFixture(
          continuationOutput('drwx------@', [line]),
          gid,
        )
        expect(result).toEqual({
          failureStage: 'parse-continuation-layout',
          privateClass: null,
        })
        expect(JSON.stringify(result)).not.toContain('private-acl-sentinel')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['', 'x', 'private-acl-sentinel', ' !@#$%^&*()[]{}'])(
    'routes every envelope-valid ACL suffix to one nonreflecting stage: %j',
    (suffix) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const parsed = classifier.routePublicScratchLsBytesForFixture(
          continuationOutput('drwx------@', [` 0: ${suffix}`]),
          gid,
        )
        expect(parsed).toEqual({
          failureStage: 'parse-acl-shaped-row',
          privateClass: null,
        })
        const formatted = classifier.formatPublicScratchStageForFixture(
          Object.freeze({ stage: parsed.failureStage }),
        )
        expect(formatted).toEqual({
          line: '{"stage":"parse-acl-shaped-row"}\n',
          exitCode: 0,
        })
        if (suffix.includes('sentinel'))
          expect(JSON.stringify({ parsed, formatted })).not.toContain(suffix)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('applies continuation order before marker and reports only the first failure', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const route = (bytes: Buffer) =>
        classifier.routePublicScratchLsBytesForFixture(bytes, gid).failureStage
      expect(
        route(output('drwx------@', ['private+name\t bad', 'valid\t 01 '])),
      ).toBe('parse-xattr-row-name')
      expect(route(output('drwx------@', ['private\tbad\textra']))).toBe(
        'parse-xattr-row-delimiter',
      )
      expect(
        route(continuationOutput('drwx------', ['private-layout-sentinel'])),
      ).toBe('parse-continuation-layout')
      expect(
        route(continuationOutput('drwx------@', ['\t 0: private-acl'])),
      ).toBe('parse-xattr-row-delimiter')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(validOutputs)(
    'releases terminal class only after custody closes for valid class %#',
    async (bytes, privateClass) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child: goodChild(bytes) })
      try {
        await expect(runCore(current)).resolves.toEqual({ class: privateClass })
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
        const result = await runCore(coreFixture({ child: goodChild(bytes) }))
        expect(result).toEqual({ class: privateClass })
        expect(Object.isFrozen(result)).toBe(true)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(validOutputs)(
    'passes terminal class %# through core, formatter, and one-shot writer',
    async (bytes, privateClass) => {
      vi.stubEnv('NODE_ENV', 'test')
      const write = vi.fn(async () => undefined)
      try {
        const result = await runCore(coreFixture({ child: goodChild(bytes) }))
        const formatted = classifier.formatPublicScratchStageForFixture(result)
        expect(formatted).toEqual({
          line: `${JSON.stringify({ class: privateClass })}\n`,
          exitCode: 0,
        })
        await expect(
          classifier.writePublicScratchResultForFixture(formatted.line, write),
        ).resolves.toBe(0)
        expect(write).toHaveBeenCalledExactlyOnceWith(formatted.line)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(
    validOutputs.flatMap(([bytes, privateClass]) =>
      (['scratch', 'parent'] as const).map(
        (role) => [privateClass, role, bytes] as const,
      ),
    ),
  )(
    'suppresses terminal class %s when %s close fails',
    async (privateClass, role, bytes) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ child: goodChild(bytes), closeError: role })
      try {
        const result = await runCore(current)
        expect(result).toEqual({ stage: 'close' })
        expect(JSON.stringify(result)).not.toContain(privateClass)
        expect(current.handles.scratch.close).toHaveBeenCalledOnce()
        expect(current.handles.parent.close).toHaveBeenCalledOnce()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(
    [[], [argv[0]], [argv[0], 'wrong'], [...argv, 'extra'], ...retiredArgv].map(
      (args) => ({ args }),
    ),
  )(
    'rejects retired or malformed grammar before every boundary',
    async ({ args }) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture()
      try {
        await expect(runCore(current, args)).resolves.toEqual({
          stage: 'stopped',
        })
        expect(current.dependencies.now).not.toHaveBeenCalled()
        expect(current.hostReaders.environmentKeys).not.toHaveBeenCalled()
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
        expect(current.dependencies.runChild).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(
    [
      new Proxy([...argv], {}),
      (() => {
        const sparse = new Array<string>(2)
        sparse[0] = argv[0]
        return sparse
      })(),
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
    ].map((args) => [args] as const),
  )('rejects noncanonical argv before every boundary', async (args) => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = coreFixture()
    try {
      await expect(runCore(current, args)).resolves.toEqual({
        stage: 'stopped',
      })
      expect(current.hostReaders.environmentKeys).not.toHaveBeenCalled()
      expect(current.dependencies.now).not.toHaveBeenCalled()
      expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      expect(current.dependencies.runChild).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reads the exact four-name host profile lazily in fixed order', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = coreFixture()
    try {
      await expect(runCore(current)).resolves.toEqual({
        class: 'only-provenance-11',
      })
      expect(current.hostEvents).toEqual(hostReadOrder)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['platform', 'linux', 2],
    ['nodeVersion', '24.18.0', 3],
    ['execPath', '/usr/bin/node', 4],
    ['cwd', '/tmp', 5],
    ['resolvedCwd', '/private', 6],
    ['euid', 0, 7],
    ['lcAll', 'POSIX', 8],
    ['lang', 'en_GB.UTF-8', 9],
    ['tz', 'Europe/London', 10],
  ] as const)(
    'routes host %s drift to host-admission without later reads',
    async (field, value, reads) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ host: { ...host, [field]: value } })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'host-admission',
        })
        expect(current.hostEvents).toEqual(hostReadOrder.slice(0, reads))
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(
    [
      ['LANG', 'LC_ALL', 'TZ'],
      ['LANG', 'LC_ALL', 'TZ', 'MallocNanoZone'],
      ['LANG', 'LC_ALL', 'TZ', 'MallocNanoZone', '__CF_USER_TEXT_ENCODING'],
      ['LANG', 'LC_ALL', 'TZ', '__CF_USER_TEXT_ENCODING', 'UNKNOWN'],
      ['LANG', '__CF_USER_TEXT_ENCODING'],
      ['__CF_USER_TEXT_ENCODING'],
      [],
      ['TZ', 'LANG', 'LC_ALL', '__CF_USER_TEXT_ENCODING'],
      ['LANG', 'LANG', 'LC_ALL', 'TZ'],
    ].map((environmentKeys) => [environmentKeys] as const),
  )(
    'rejects every non-exact environment-name profile: %j',
    async (environmentKeys) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ host: { ...host, environmentKeys } })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'host-admission',
        })
        expect(current.hostEvents).toEqual(['environment-keyset'])
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    null,
    ['LANG', 1, 'TZ', '__CF_USER_TEXT_ENCODING'],
    Object.assign([...host.environmentKeys], { extra: 'private' }),
    Object.setPrototypeOf([...host.environmentKeys], null),
    new Proxy([...host.environmentKeys], {}),
    (() => {
      const sparse = new Array<string>(4)
      sparse[0] = 'LANG'
      sparse[3] = '__CF_USER_TEXT_ENCODING'
      return sparse
    })(),
    (() => {
      const accessor = [...host.environmentKeys]
      Object.defineProperty(accessor, '1', {
        enumerable: true,
        get: () => 'LC_ALL',
      })
      return accessor
    })(),
  ])(
    'maps malformed environment-name snapshots to host-admission',
    async (environmentKeys) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = coreFixture({ host: { ...host, environmentKeys } })
      try {
        await expect(runCore(current)).resolves.toEqual({
          stage: 'host-admission',
        })
        expect(current.hostEvents).toEqual(['environment-keyset'])
        expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('enumerates the CF name without reading its value or forwarding it', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const valueRead = vi.fn(() => {
      throw new Error('private-cf-value')
    })
    const environment = Object.defineProperty(
      { LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      '__CF_USER_TEXT_ENCODING',
      { enumerable: true, get: valueRead },
    )
    const current = coreFixture({
      hostReaders: {
        environmentKeys: vi.fn(() => Object.keys(environment).sort()),
      },
    })
    try {
      const result = await runCore(current)
      expect(result).toEqual({ class: 'only-provenance-11' })
      expect(valueRead).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toContain('private-cf-value')
    } finally {
      vi.unstubAllEnvs()
    }
  })

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
    [
      continuationOutput('drwx------@', ['private-layout-sentinel']),
      'parse-continuation-layout',
    ],
    [output('drwx------@', ['private-no-tab']), 'parse-xattr-row-delimiter'],
    [output('drwx------@', ['private+sentinel\t 1 ']), 'parse-xattr-row-name'],
    [output('drwx------@', ['private-size\t 01 ']), 'parse-xattr-row-size'],
    [
      output('drwx------@', [
        attribute('private-duplicate', '1'),
        attribute('private-duplicate', '2'),
      ]),
      'parse-xattr-row-duplicate',
    ],
    [
      continuationOutput('drwx------@', [' 0: private-acl-sentinel']),
      'parse-acl-shaped-row',
    ],
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
          class: 'only-provenance-11',
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

  it('formats only the exact frozen stage/class union with exact exits', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const stage of stages)
        expect(
          classifier.formatPublicScratchStageForFixture(
            Object.freeze({ stage }),
          ),
        ).toEqual({
          line: `${JSON.stringify({ stage })}\n`,
          exitCode: stage === 'stopped' ? 1 : 0,
        })
      for (const privateClass of privateClasses)
        expect(
          classifier.formatPublicScratchStageForFixture(
            Object.freeze({ class: privateClass }),
          ),
        ).toEqual({
          line: `${JSON.stringify({ class: privateClass })}\n`,
          exitCode: 0,
        })
      expect(stages).toHaveLength(26)
      expect(stages.filter((stage) => stage !== 'stopped')).toHaveLength(25)
      expect(stages.length + privateClasses.length).toBe(29)
      expect(
        stages.filter((stage) => stage !== 'stopped').length +
          privateClasses.length,
      ).toBe(28)
      for (const malformed of [
        {},
        { stage: 'private-secret' },
        { stage: 'budget' },
        Object.freeze({ stage: 'pipeline-complete' }),
        Object.freeze({ stage: 'parse-xattr-row' }),
        { stage: 'budget', extra: 'private-secret' },
        Object.freeze({ stage: 'budget', class: 'only-provenance-11' }),
        Object.create({ stage: 'budget' }),
        new Proxy(Object.freeze({ stage: 'budget' }), {}),
        Object.freeze(
          Object.defineProperty({}, 'stage', {
            enumerable: true,
            get: () => 'budget',
          }),
        ),
      ]) {
        const result = classifier.formatPublicScratchStageForFixture(malformed)
        expect(result).toEqual({ line: '{"stage":"stopped"}\n', exitCode: 1 })
        expect(JSON.stringify(result)).not.toContain('private-secret')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ...stages.map(
      (stage) =>
        [
          `${JSON.stringify({ stage })}\n`,
          stage === 'stopped' ? 1 : 0,
        ] as const,
    ),
    ...privateClasses.map(
      (privateClass) =>
        [`${JSON.stringify({ class: privateClass })}\n`, 0] as const,
    ),
  ])('writes closed terminal line %s exactly once', async (line, exitCode) => {
    vi.stubEnv('NODE_ENV', 'test')
    const write = vi.fn(async () => undefined)
    try {
      await expect(
        classifier.writePublicScratchResultForFixture(line, write),
      ).resolves.toBe(exitCode)
      expect(write).toHaveBeenCalledExactlyOnceWith(line)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('maps writer failure to exit 1 with one attempt and no retry', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const write = vi.fn(async () => {
      throw new Error('private-write')
    })
    try {
      await expect(
        classifier.writePublicScratchResultForFixture(
          '{"class":"only-provenance-11"}\n',
          write,
        ),
      ).resolves.toBe(1)
      expect(write).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    null,
    '',
    '{"stage":"pipeline-complete"}\n',
    '{"stage":"budget","class":"only-provenance-11"}\n',
    '{ "stage": "budget" }\n',
  ])(
    'rejects malformed writer input without an output attempt',
    async (line) => {
      vi.stubEnv('NODE_ENV', 'test')
      const write = vi.fn()
      try {
        await expect(
          classifier.writePublicScratchResultForFixture(line, write),
        ).resolves.toBe(1)
        expect(write).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('keeps the production module isolated, fixed, and privacy-closed', async () => {
    const source = await readFile(
      new URL(
        '../scripts/m45-public-scratch-xattr-classifier.mjs',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain(
      "const operation = 'classify-public-scratch-xattr'",
    )
    expect(source).toContain(
      "const confirmation = '--confirm-m45-public-scratch-xattr-classifier-v3'",
    )
    expect(source).not.toContain(
      '--confirm-m45-public-scratch-xattr-classifier-v2',
    )
    expect(source).not.toContain(
      '--confirm-m45-public-scratch-xattr-classifier-v1',
    )
    expect(source).not.toContain(
      '--confirm-m45-public-scratch-classifier-stop-v1',
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
    expect(source).toContain(
      "const fixedEnvironment = Object.freeze({ LC_ALL: 'C', LANG: 'C', TZ: 'UTC' })",
    )
    expect(source).toContain(
      'environmentKeys: () => Object.keys(process.env).sort()',
    )
    expect(source).toContain('lcAll: () => process.env.LC_ALL')
    expect(source).toContain('lang: () => process.env.LANG')
    expect(source).toContain('tz: () => process.env.TZ')
    expect(source).not.toContain('...process.env')
    expect(source).not.toContain('Object.entries(process.env)')
    expect(source).not.toContain('process.env.__CF_USER_TEXT_ENCODING')
    expect(source).not.toContain('process.env[')
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
      expect(consumer, path).not.toMatch(/PublicScratch(?:Ls|Stage|Result)/u)
    }
  })
})
