import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const moduleUrl = new URL(
  '../scripts/m45-public-scratch-xattr-classifier.mjs',
  import.meta.url,
).href
const classifier = (await import(moduleUrl)) as {
  classifyPublicScratchLsBytesForFixture: (
    bytes: Buffer,
    expectedGid: number,
  ) => string
  runPublicScratchXattrClassifierCoreForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
  ) => Promise<Readonly<{ class: string }>>
  runPublicScratchXattrChildForFixture: (
    operations: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  formatPublicScratchXattrResultForFixture: (
    result: Record<string, unknown>,
  ) => string
}

const fixedPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const argv = [
  'classify-public-scratch-xattr',
  '--confirm-m45-public-scratch-xattr-classifier-v1',
] as const
const gid = 20
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
const output = (mode: string, rows: readonly string[] = []) =>
  Buffer.from(
    `${base(mode)}\n${rows.map((row) => `\t${row}`).join('\n')}${rows.length === 0 ? '' : '\n'}`,
  )
const attribute = (name: string, size: string, spaces = ' ') =>
  `${name}\t${spaces}${size}`

const parentMetadata = {
  uid: 0,
  gid: 0,
  dev: 16777231,
  ino: 13457399,
  mode: 0o1777,
  nlink: 8,
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
  directory: true,
  symbolicLink: false,
}
const goodChild = {
  stdout: output('drwx------@', [attribute('com.apple.provenance', '11')]),
  stderr: Buffer.alloc(0),
  code: 0,
  signal: null,
  streamsClosed: true,
  groupAbsent: true,
  timedOut: false,
  overflow: false,
}
const host = {
  platform: 'darwin',
  nodeVersion: '24.18.1',
  execPath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
  cwd: '/',
  euid: 501,
  environment: { LC_ALL: 'C', LANG: 'C', TZ: 'UTC' },
}

function metadataWithDrift(
  metadata: typeof scratchMetadata,
  field: string | undefined,
) {
  if (field === undefined) return { ...metadata }
  if (field === 'directory') return { ...metadata, directory: false }
  if (field === 'symbolicLink') return { ...metadata, symbolicLink: true }
  return {
    ...metadata,
    [field]: Number(metadata[field as keyof typeof metadata]) + 1,
  }
}

function fixture(
  options: {
    child?: Record<string, unknown>
    childError?: boolean
    openError?: 'parent' | 'scratch'
    closeError?: 'parent' | 'scratch'
    drift?: {
      role: 'parent' | 'scratch'
      scope: 'held' | 'named'
      phase: 'pre' | 'post'
      field: string
    }
    now?: () => number
    host?: Record<string, unknown>
  } = {},
) {
  const events: string[] = []
  const calls = {
    parentHeld: 0,
    parentNamed: 0,
    scratchHeld: 0,
    scratchNamed: 0,
  }
  const observed = (role: 'parent' | 'scratch', scope: 'held' | 'named') => {
    const key =
      `${role}${scope === 'held' ? 'Held' : 'Named'}` as keyof typeof calls
    calls[key] += 1
    const phase = calls[key] === 1 ? 'pre' : 'post'
    const field =
      options.drift?.role === role &&
      options.drift.scope === scope &&
      options.drift.phase === phase
        ? options.drift.field
        : undefined
    return metadataWithDrift(
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
      if (options.closeError === role) throw new Error('sensitive-close-error')
    }),
  })
  const handles = { parent: handle('parent'), scratch: handle('scratch') }
  const dependencies = {
    host: options.host ?? host,
    now: options.now ?? (() => 0),
    directoryFlags: vi.fn(() => 0x01100100),
    openDirectory: vi.fn(async (path: string) => {
      const role = path === '/private/tmp' ? 'parent' : 'scratch'
      events.push(`open-${role}`)
      if (options.openError === role) throw new Error('sensitive-open-error')
      return handles[role]
    }),
    lstat: vi.fn(async (path: string) =>
      observed(path === '/private/tmp' ? 'parent' : 'scratch', 'named'),
    ),
    runChild: vi.fn(async () => {
      events.push('child')
      if (options.childError) throw new Error('sensitive-child-error')
      return options.child ?? goodChild
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
    groupAbsent?: readonly boolean[]
    missingClose?: 'child' | 'stdout' | 'stderr'
    simultaneousFaults?: boolean
    closeFirst?: boolean
  } = {},
) {
  const stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  const stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  const child = new EventEmitter() as EventEmitter & {
    pid: number
    stdout: EventEmitter
    stderr: EventEmitter
    unref: ReturnType<typeof vi.fn>
  }
  child.pid = 123
  child.stdout = stdout
  child.stderr = stderr
  child.unref = vi.fn()
  let timerCallback: (() => void) | undefined
  let completionTimerCallback: (() => void) | undefined
  const absence = [...(options.groupAbsent ?? [true])]
  const operations = {
    spawnChild: vi.fn(() => {
      if (options.spawnError) throw new Error('private-spawn-error')
      queueMicrotask(() => {
        if (options.closeFirst)
          child.emit('close', options.code ?? 0, options.signal ?? null)
        if (options.timeout || options.missingClose) timerCallback?.()
        if (options.stdout) stdout.emit('data', options.stdout)
        if (options.stderr) stderr.emit('data', options.stderr)
        if (options.streamError || options.simultaneousFaults)
          stdout.emit('error', new Error('private-stream-error'))
        if (options.childError || options.simultaneousFaults)
          child.emit('error', new Error('private-child-error'))
        if (options.missingClose !== 'stdout') stdout.emit('close')
        if (options.missingClose !== 'stderr') stderr.emit('close')
        if (!options.closeFirst && options.missingClose !== 'child')
          child.emit('close', options.code ?? 0, options.signal ?? null)
        if (options.missingClose)
          queueMicrotask(() => completionTimerCallback?.())
      })
      return child
    }),
    killGroup: vi.fn(),
    groupAbsent: vi.fn(() => absence.shift() ?? true),
    delay: vi.fn(async () => {}),
    setTimer: vi.fn((callback: () => void) => {
      timerCallback = callback
      return 1
    }),
    clearTimer: vi.fn(),
    setCompletionTimer: vi.fn((callback: () => void) => {
      completionTimerCallback = callback
      return 2
    }),
    clearCompletionTimer: vi.fn(),
  }
  return { operations, stdout, stderr, child }
}

function trackedRepositorySourceFiles(directory: string): string[] {
  const paths = execFileSync(
    '/usr/bin/git',
    ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs', '*.ts', '*.tsx'],
    { cwd: directory, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  )
  return paths
    .split('\0')
    .filter((path) => path.length !== 0)
    .map((path) => join(directory, path))
}

describe('D133 public scratch xattr classifier', () => {
  it('keeps every synthetic seam closed outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const current = fixture()
    const child = childFixture()
    try {
      expect(() =>
        classifier.classifyPublicScratchLsBytesForFixture(
          output('drwx------'),
          gid,
        ),
      ).toThrow('fixture-only')
      await expect(
        classifier.runPublicScratchXattrClassifierCoreForFixture(
          argv,
          current.dependencies,
        ),
      ).rejects.toThrow('fixture-only')
      await expect(
        classifier.runPublicScratchXattrChildForFixture(child.operations),
      ).rejects.toThrow('fixture-only')
      expect(() =>
        classifier.formatPublicScratchXattrResultForFixture({
          class: 'no-xattr',
        }),
      ).toThrow('fixture-only')
      expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      expect(child.operations.spawnChild).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [
      output('drwx------@', [attribute('com.apple.provenance', '11')]),
      'only-provenance-11',
    ],
    [output('drwx------'), 'no-xattr'],
    [
      output('drwx------@', [attribute('com.example.unknown', '7')]),
      'other-xattr-set',
    ],
    [
      output('drwx------@', [
        attribute('com.apple.provenance', '11'),
        attribute('com.example.other', '1'),
      ]),
      'other-xattr-set',
    ],
    [
      output('drwx------@', [attribute('com.apple.provenance', '12')]),
      'other-xattr-set',
    ],
  ])('maps a well-formed synthetic ls shape to %s', (bytes, expected) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      expect(
        classifier.classifyPublicScratchLsBytesForFixture(bytes, gid),
      ).toBe(expected)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('never reflects a sensitive unknown attribute name', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const sensitive = 'private.customer-secret-token'
    try {
      const parsed = classifier.classifyPublicScratchLsBytesForFixture(
        output('drwx------@', [attribute(sensitive, '9')]),
        gid,
      )
      expect(parsed).toBe('other-xattr-set')
      expect(JSON.stringify({ class: parsed })).not.toContain(sensitive)

      let message = ''
      try {
        classifier.classifyPublicScratchLsBytesForFixture(
          output('drwx------@', [`${sensitive}\t 09`]),
          gid,
        )
      } catch (error) {
        message = String(error)
      }
      expect(message).not.toContain(sensitive)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    Buffer.from([0xff, 0x0a]),
    Buffer.from(`${base()}\0\n`),
    Buffer.from(`${base()}\r\n`),
    Buffer.from(base()),
    Buffer.alloc(4097, 0x20),
    Buffer.from(`${base()}\n${'x'.repeat(512)}\n`),
    Buffer.from(`${base()}\n${'x'.repeat(513)}\n`),
    Buffer.from(
      `${base()}\n${Array(8).fill('\tcom.example.x\t 1').join('\n')}\n`,
    ),
    Buffer.from(`${base()}\n 0: user:501 allow read\n`),
    output('drwx------@'),
    output('drwx------', [attribute('com.example.x', '1')]),
    output('drwx------@', [
      attribute('com.example.x', '1'),
      attribute('com.example.x', '2'),
    ]),
    output('drwx------@', ['com.example.x\t 01']),
    Buffer.from(`${base('drwx------@', ['1'])}\n\tcom.example.x\t 1\n`),
    Buffer.from(
      `${base('drwx------@', Array(9).fill(undefined).concat('/private/tmp/other') as string[])}\n\tcom.example.x\t 1\n`,
    ),
  ])('rejects a malformed or ambiguous synthetic byte shape', (bytes) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      expect(() =>
        classifier.classifyPublicScratchLsBytesForFixture(bytes, gid),
      ).toThrow('classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('enforces exact base-field and surrounding-whitespace boundaries', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const fields = base().split(' ')
      for (const malformed of [
        `${fields.slice(0, 9).join(' ')}\n`,
        `${[...fields, 'extra'].join(' ')}\n`,
        ` ${base()}\n`,
        `${base()} \n`,
        `${base().replace(' ', '\n')}\n`,
      ])
        expect(() =>
          classifier.classifyPublicScratchLsBytesForFixture(
            Buffer.from(malformed),
            gid,
          ),
        ).toThrow('classifier-stopped')
      expect(
        classifier.classifyPublicScratchLsBytesForFixture(
          Buffer.from(`${base('drwx------', []).replaceAll(' ', '\t')}\n`),
          gid,
        ),
      ).toBe('no-xattr')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('enforces exact xattr name, size, charset, and row-count boundaries', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const name127 = `a${'b'.repeat(126)}`
      expect(
        classifier.classifyPublicScratchLsBytesForFixture(
          output('drwx------@', [attribute(name127, '9999999999', '')]),
          gid,
        ),
      ).toBe('other-xattr-set')
      expect(
        classifier.classifyPublicScratchLsBytesForFixture(
          output(
            'drwx------@',
            Array.from({ length: 7 }, (_, index) =>
              attribute(`a-${index}._x`, String(index)),
            ),
          ),
          gid,
        ),
      ).toBe('other-xattr-set')
      for (const row of [
        attribute(`a${'b'.repeat(127)}`, '1'),
        attribute('-leading', '1'),
        attribute('bad+character', '1'),
        attribute('bad\\escape', '1'),
        attribute('nonascii-\u00e9', '1'),
        attribute('valid', '000'),
        attribute('valid', '10000000000'),
      ])
        expect(() =>
          classifier.classifyPublicScratchLsBytesForFixture(
            output('drwx------@', [row]),
            gid,
          ),
        ).toThrow('classifier-stopped')
      expect(() =>
        classifier.classifyPublicScratchLsBytesForFixture(
          output(
            'drwx------@',
            Array.from({ length: 8 }, (_, index) =>
              attribute(`a${index}`, '1'),
            ),
          ),
          gid,
        ),
      ).toThrow('classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('accepts the closed base numeric and time boundaries only', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const overrides of [
        ['13940765', 'drwx------', '2', '501', String(gid), '0'],
        [
          '13940765',
          'drwx------',
          '2',
          '501',
          String(gid),
          '64',
          'Aug',
          '1',
          '0000',
        ],
      ])
        expect(
          classifier.classifyPublicScratchLsBytesForFixture(
            Buffer.from(`${base('drwx------', overrides)}\n`),
            gid,
          ),
        ).toBe('no-xattr')
      for (const overrides of [
        Array(5).fill(undefined).concat('01'),
        Array(7).fill(undefined).concat('0'),
        Array(7).fill(undefined).concat('32'),
        Array(8).fill(undefined).concat('24:00'),
        Array(8).fill(undefined).concat('1:00'),
        Array(6).fill(undefined).concat('aug'),
      ] as string[][])
        expect(() =>
          classifier.classifyPublicScratchLsBytesForFixture(
            Buffer.from(`${base('drwx------', overrides)}\n`),
            gid,
          ),
        ).toThrow('classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('runs the exact closed core order and closes scratch before parent', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = fixture()
    try {
      await expect(
        classifier.runPublicScratchXattrClassifierCoreForFixture(
          argv,
          current.dependencies,
        ),
      ).resolves.toEqual({ class: 'only-provenance-11' })
      expect(current.events).toEqual([
        'open-parent',
        'open-scratch',
        'child',
        'close-scratch',
        'close-parent',
      ])
      expect(current.dependencies.directoryFlags).toHaveBeenCalledOnce()
      expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
        1,
        '/private/tmp',
        0x01100100,
      )
      expect(current.dependencies.openDirectory).toHaveBeenNthCalledWith(
        2,
        fixedPath,
        0x01100100,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    { args: [] },
    { args: ['classify-public-scratch-xattr'] },
    { args: ['classify-public-scratch-xattr', 'wrong'] },
    { args: [...argv, 'extra'] },
  ])('rejects grammar before every boundary', async ({ args }) => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = fixture()
    try {
      await expect(
        classifier.runPublicScratchXattrClassifierCoreForFixture(
          args,
          current.dependencies,
        ),
      ).resolves.toEqual({ class: 'stopped' })
      expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
      expect(current.dependencies.runChild).not.toHaveBeenCalled()
      expect(current.events).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['platform', 'linux'],
    ['nodeVersion', '24.18.0'],
    ['execPath', '/usr/bin/node'],
    ['cwd', '/tmp'],
    ['euid', 0],
    ['environment', { LC_ALL: 'C', LANG: 'C', TZ: 'UTC', EXTRA: '1' }],
  ] as const)('stops on host %s drift before open', async (field, value) => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = fixture({ host: { ...host, [field]: value } })
    try {
      await expect(
        classifier.runPublicScratchXattrClassifierCoreForFixture(
          argv,
          current.dependencies,
        ),
      ).resolves.toEqual({ class: 'stopped' })
      expect(current.dependencies.openDirectory).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    { code: 1 },
    { signal: 'SIGKILL' },
    { stderr: Buffer.from('private-child-error') },
    { streamsClosed: false },
    { groupAbsent: false },
    { timedOut: true },
    { overflow: true },
    { stdout: Buffer.alloc(4096), stderr: Buffer.from('x') },
  ])('maps child lifecycle ambiguity to stopped', async (change) => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = fixture({ child: { ...goodChild, ...change } })
    try {
      const result =
        await classifier.runPublicScratchXattrClassifierCoreForFixture(
          argv,
          current.dependencies,
        )
      expect(result).toEqual({ class: 'stopped' })
      expect(JSON.stringify(result)).not.toMatch(/private-child-error/u)
      expect(current.events.slice(-2)).toEqual([
        'close-scratch',
        'close-parent',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [{ stdout: Buffer.from('safe\n') }, false, false],
    [{ stderr: Buffer.from('private-stderr') }, true, false],
    [{ stdout: Buffer.alloc(4097) }, true, true],
    [{ code: 1 }, false, false],
    [{ signal: 'SIGTERM' }, false, false],
    [{ streamError: true }, true, false],
    [{ childError: true }, true, false],
    [{ timeout: true }, true, false],
    [{ groupAbsent: [false, true] }, false, false],
  ] as const)(
    'shares the bounded child event lifecycle for case %#',
    async (options, killed, overflow) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture(options)
      try {
        const result = await classifier.runPublicScratchXattrChildForFixture(
          current.operations,
        )
        expect(result.streamsClosed).toBe(true)
        expect(result.groupAbsent).toBe(true)
        expect(result.overflow).toBe(overflow)
        expect(current.operations.killGroup.mock.calls.length > 0).toBe(killed)
        expect(JSON.stringify(result)).not.toMatch(/private-/u)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('maps a synchronous spawn exception to a closed child result', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ spawnError: true })
    try {
      const result = await classifier.runPublicScratchXattrChildForFixture(
        current.operations,
      )
      expect(result).toMatchObject({
        code: null,
        streamsClosed: true,
        groupAbsent: false,
      })
      expect(JSON.stringify(result)).not.toContain('private-spawn-error')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('makes simultaneous lifecycle faults idempotent', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({
      timeout: true,
      stderr: Buffer.from('private-simultaneous-error'),
      simultaneousFaults: true,
    })
    try {
      const result = await classifier.runPublicScratchXattrChildForFixture(
        current.operations,
      )
      expect(result).toMatchObject({
        streamsClosed: true,
        groupAbsent: true,
        timedOut: true,
      })
      expect(current.operations.killGroup).toHaveBeenCalledOnce()
      expect(current.operations.clearTimer).toHaveBeenCalledOnce()
      expect(current.operations.setCompletionTimer).toHaveBeenCalledOnce()
      expect(current.operations.clearCompletionTimer).toHaveBeenCalledOnce()
      expect(JSON.stringify(result)).not.toContain('private-simultaneous-error')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['child', 'stdout', 'stderr'] as const)(
    'boundedly stops and releases outer custody when %s close is missing',
    async (missingClose) => {
      vi.stubEnv('NODE_ENV', 'test')
      const child = childFixture({ missingClose })
      const current = fixture()
      current.dependencies.runChild.mockImplementation(async () =>
        classifier.runPublicScratchXattrChildForFixture(child.operations),
      )
      try {
        await expect(
          classifier.runPublicScratchXattrClassifierCoreForFixture(
            argv,
            current.dependencies,
          ),
        ).resolves.toEqual({ class: 'stopped' })
        expect(child.operations.killGroup).toHaveBeenCalledOnce()
        expect(child.operations.clearTimer).toHaveBeenCalledOnce()
        expect(child.operations.setCompletionTimer).toHaveBeenCalledOnce()
        expect(child.operations.clearCompletionTimer).toHaveBeenCalledOnce()
        expect(child.stdout.destroy).toHaveBeenCalledTimes(
          missingClose === 'stdout' ? 1 : 0,
        )
        expect(child.stderr.destroy).toHaveBeenCalledTimes(
          missingClose === 'stderr' ? 1 : 0,
        )
        expect(child.child.unref).toHaveBeenCalledTimes(
          missingClose === 'child' ? 1 : 0,
        )
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

  it('never signals after child close and safely sinks late errors', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ missingClose: 'stdout', closeFirst: true })
    try {
      const result = await classifier.runPublicScratchXattrChildForFixture(
        current.operations,
      )
      expect(result).toMatchObject({
        streamsClosed: false,
        groupAbsent: true,
        timedOut: true,
      })
      expect(current.operations.killGroup).not.toHaveBeenCalled()
      expect(current.stdout.destroy).toHaveBeenCalledOnce()
      expect(current.stderr.destroy).not.toHaveBeenCalled()
      expect(current.child.unref).not.toHaveBeenCalled()
      expect(() => {
        current.stdout.emit('error', new Error('private-late-stdout'))
        current.stdout.emit('error', new Error('private-late-stdout-again'))
        current.stderr.emit('error', new Error('private-late-stderr'))
        current.child.emit('error', new Error('private-late-child'))
        current.child.emit('error', new Error('private-late-child-again'))
      }).not.toThrow()
      expect(current.stdout.listenerCount('error')).toBe(1)
      expect(current.stderr.listenerCount('error')).toBe(1)
      expect(current.child.listenerCount('error')).toBe(1)
      expect(JSON.stringify(result)).not.toContain('private-late')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('read-only probes a closed child group at most twenty times', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const current = childFixture({ groupAbsent: Array(21).fill(false) })
    try {
      const result = await classifier.runPublicScratchXattrChildForFixture(
        current.operations,
      )
      expect(result).toMatchObject({ groupAbsent: false })
      expect(current.operations.groupAbsent).toHaveBeenCalledTimes(20)
      expect(current.operations.killGroup).not.toHaveBeenCalled()
      expect(current.operations.delay).toHaveBeenCalledTimes(19)
      expect(current.operations.clearTimer).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [Buffer.alloc(4096, 0x61), undefined, false, 4096],
    [Buffer.alloc(4095, 0x61), Buffer.from('x'), false, 4095],
    [Buffer.alloc(4096, 0x61), Buffer.from('x'), true, 4096],
    [Buffer.alloc(4097, 0x61), undefined, true, 0],
  ] as const)(
    'enforces the combined chunk cap at %#',
    async (stdout, stderr, overflow, retainedStdout) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = childFixture({ stdout, stderr })
      try {
        const result = await classifier.runPublicScratchXattrChildForFixture(
          current.operations,
        )
        expect(result.overflow).toBe(overflow)
        expect((result.stdout as Buffer).byteLength).toBe(retainedStdout)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['parent', 'scratch'] as const)(
    'closes remaining handles after %s open failure',
    async (role) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = fixture({ openError: role })
      try {
        await expect(
          classifier.runPublicScratchXattrClassifierCoreForFixture(
            argv,
            current.dependencies,
          ),
        ).resolves.toEqual({ class: 'stopped' })
        expect(current.dependencies.runChild).not.toHaveBeenCalled()
        expect(current.events).toEqual(
          role === 'parent'
            ? ['open-parent']
            : ['open-parent', 'open-scratch', 'close-parent'],
        )
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['parent', 'scratch'] as const)(
    'attempts each close once and stops on %s close ambiguity',
    async (role) => {
      vi.stubEnv('NODE_ENV', 'test')
      const current = fixture({ closeError: role })
      try {
        await expect(
          classifier.runPublicScratchXattrClassifierCoreForFixture(
            argv,
            current.dependencies,
          ),
        ).resolves.toEqual({ class: 'stopped' })
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
          it(`stops on ${phase} ${scope} ${role} ${field} drift`, async () => {
            vi.stubEnv('NODE_ENV', 'test')
            const current = fixture({
              drift: { role, scope, phase, field },
            })
            try {
              await expect(
                classifier.runPublicScratchXattrClassifierCoreForFixture(
                  argv,
                  current.dependencies,
                ),
              ).resolves.toEqual({ class: 'stopped' })
              expect(current.events.slice(-2)).toEqual([
                'close-scratch',
                'close-parent',
              ])
            } finally {
              vi.unstubAllEnvs()
            }
          })

  it('stops on spawn, parser, flag, and operation-budget failures', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const current of [
        fixture({ childError: true }),
        fixture({
          child: { ...goodChild, stdout: Buffer.from('malformed\n') },
        }),
        (() => {
          const value = fixture()
          value.dependencies.directoryFlags.mockImplementation(() => {
            throw new Error('flags')
          })
          return value
        })(),
        (() => {
          const times = [0, 0, 2001]
          return fixture({ now: () => times.shift() ?? 2001 })
        })(),
      ])
        await expect(
          classifier.runPublicScratchXattrClassifierCoreForFixture(
            argv,
            current.dependencies,
          ),
        ).resolves.toEqual({ class: 'stopped' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('formats only the four closed production JSON lines without reflection', () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const resultClass of [
        'only-provenance-11',
        'no-xattr',
        'other-xattr-set',
        'stopped',
      ])
        expect(
          classifier.formatPublicScratchXattrResultForFixture({
            class: resultClass,
          }),
        ).toBe(`${JSON.stringify({ class: resultClass })}\n`)
      const sensitive = 'private-formatter-secret'
      for (const malformed of [
        { class: sensitive },
        { class: 'no-xattr', extra: sensitive },
        {},
      ]) {
        const formatted =
          classifier.formatPublicScratchXattrResultForFixture(malformed)
        expect(formatted).toBe('{"class":"stopped"}\n')
        expect(formatted).not.toContain(sensitive)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('has no repository consumer outside its synthetic test boundary', async () => {
    const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
    const classifierPath = join(
      repositoryRoot,
      'scripts/m45-public-scratch-xattr-classifier.mjs',
    )
    const testPath = fileURLToPath(import.meta.url)
    const fixtureNames = [
      'classifyPublicScratchLsBytesForFixture',
      'runPublicScratchXattrClassifierCoreForFixture',
      'runPublicScratchXattrChildForFixture',
      'formatPublicScratchXattrResultForFixture',
    ]
    for (const path of trackedRepositorySourceFiles(repositoryRoot)) {
      if (path === classifierPath || path === testPath) continue
      const source = await readFile(path, 'utf8')
      expect(source, path).not.toContain(
        'm45-public-scratch-xattr-classifier.mjs',
      )
      for (const fixtureName of fixtureNames)
        expect(source, path).not.toContain(fixtureName)
    }
  })

  it('keeps the isolated production surface fixed and privacy-closed', async () => {
    const source = await readFile(
      new URL(
        '../scripts/m45-public-scratch-xattr-classifier.mjs',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain('spawn(lsPath, lsArguments, {')
    expect(source).toContain("const lsPath = '/bin/ls'")
    expect(source).toContain("['-lidne@B', scratchPath]")
    expect(source).toContain('shell: false')
    expect(source).toContain('detached: true')
    expect(source).toContain('const outputCap = 4096')
    expect(source).toContain('const childTimeoutMs = 1000')
    expect(source).toContain('const operationBudgetMs = 2000')
    expect(source).toContain('const darwinDirectory = 0x00100000')
    expect(source).toContain('fsConstants.O_DIRECTORY !== darwinDirectory')
    expect(source).toContain('darwinDirectory |')
    expect(source.match(/process\.stdout\.write/gu)).toHaveLength(1)
    expect(source.match(/\bspawn\(/gu)).toHaveLength(1)
    expect(source).toContain('env: fixedEnvironment')
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']")
    expect(source).not.toContain('console.')
    expect(source).not.toContain('process.stderr')
    expect(source).not.toMatch(
      /from ['"](?:@\/|\.\/m45-|\.\.\/src|next|drizzle|provider)/u,
    )
    for (const forbidden of [
      'xattr -',
      'listxattr',
      'getxattr',
      'setxattr',
      'removexattr',
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
      'runXcrun',
      'diagnostic',
      'helper',
      'compiler',
      'provider',
      'database',
      'UUID',
      'release',
    ])
      expect(source).not.toContain(forbidden)
  })
})
