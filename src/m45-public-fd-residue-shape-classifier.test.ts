import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

const moduleUrl = new URL(
  '../scripts/m45-public-fd-residue-shape-classifier.mjs',
  import.meta.url,
).href
const classifier = (await import(moduleUrl)) as {
  runPublicFdResidueShapeClassifierForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
  ) => Promise<Readonly<{ residueState: string }>>
  formatPublicFdResidueShapeResultForFixture: (
    result: unknown,
  ) => Readonly<{ line: string; exitCode: number }>
  writePublicFdResidueShapeResultForFixture: (
    line: unknown,
    write: unknown,
  ) => Promise<number>
  executePublicFdResidueShapeClassifierForFixture: (
    argv: readonly string[],
    dependencies: Record<string, unknown>,
    write: (line: string) => Promise<void>,
  ) => Promise<number>
}

const argv = [
  'classify-a-fd-map-residue-shape',
  '--confirm-m45-public-a-fd-map-residue-shape-classifier-v1',
] as const
const repositoryRoot = '/Users/zelmari/projects/zedarchive'
const parentPath = '/private/tmp'
const scratchPath = '/private/tmp/zedarchive-m45-fd-admission-probe'
const probePath = `${scratchPath}/probe`
const parent = {
  uid: 0,
  gid: 0,
  dev: 16777231,
  ino: 13457399,
  mode: 0o1777,
  nlink: 11,
  size: 352,
  directory: true,
  symbolicLink: false,
  regular: false,
}
const scratch = {
  uid: 501,
  gid: 20,
  dev: 16777231,
  ino: 42,
  mode: 0o700,
  nlink: 2,
  size: 64,
  directory: true,
  symbolicLink: false,
  regular: false,
}
const probe = {
  uid: 501,
  gid: 20,
  dev: 16777231,
  ino: 43,
  mode: 0o500,
  nlink: 1,
  size: 4096,
  directory: false,
  symbolicLink: false,
  regular: true,
}

type Role = 'parent' | 'scratch' | 'probe'
type Scope = 'held' | 'named'
type Pass = readonly ('empty' | 'probe' | 'other')[]

const driftFields = [
  'uid',
  'gid',
  'dev',
  'ino',
  'mode',
  'nlink',
  'size',
  'directory',
  'symbolicLink',
  'regular',
] as const
const driftCases = (['parent', 'scratch', 'probe'] as const).flatMap((role) =>
  (['held', 'named'] as const).flatMap((scope) =>
    (role === 'parent'
      ? ([
          'uid',
          'gid',
          'dev',
          'ino',
          'mode',
          'directory',
          'symbolicLink',
          'regular',
        ] as const)
      : driftFields
    ).map(
      (field) =>
        [
          `${role}-${scope}-${field}`,
          {
            role,
            scope,
            field: field as (typeof driftFields)[number],
          },
        ] as const satisfies [
          string,
          { role: Role; scope: Scope; field: (typeof driftFields)[number] },
        ],
    ),
  ),
)

function statValue(value: typeof parent | typeof scratch | typeof probe) {
  return {
    ...value,
    isDirectory: () => value.directory,
    isSymbolicLink: () => value.symbolicLink,
    isFile: () => value.regular,
  }
}

function fixture(
  options: {
    presence?: readonly ('absent' | 'present')[]
    passes?: readonly Pass[]
    rejectedScratch?: Partial<typeof scratch>
    rejectedProbe?: Partial<typeof probe>
    fail?: string
    failAt?: { event: string; occurrence: number }
    result?: unknown
    drift?: { role: Role; scope: Scope; field: keyof typeof parent }
    firstEntryMode?: 'proxy' | 'accessor'
    host?: Partial<{
      environmentKeys: readonly string[]
      platform: string
      nodeVersion: string
      execPath: string
      cwd: string
      euid: number
      flags: {
        directory: number
        noFollow: number
        closeOnExec: number | undefined
      }
      values: Record<string, string>
    }>
  } = {},
) {
  const events: string[] = []
  const eventOccurrences = new Map<string, number>()
  const lookupOccurrences = new Map<string, number>()
  const record = (event: string) => {
    events.push(event)
    const occurrence = (eventOccurrences.get(event) ?? 0) + 1
    eventOccurrences.set(event, occurrence)
    return (
      options.fail === event ||
      (options.failAt?.event === event &&
        options.failAt.occurrence === occurrence)
    )
  }
  const valueFor = (role: Role, scope: Scope) => {
    const source =
      role === 'parent'
        ? parent
        : role === 'scratch'
          ? { ...scratch, ...options.rejectedScratch }
          : { ...probe, ...options.rejectedProbe }
    const key = `${role}-${scope}`
    const occurrence = lookupOccurrences.get(key) ?? 0
    lookupOccurrences.set(key, occurrence + 1)
    if (
      options.drift?.role === role &&
      options.drift.scope === scope &&
      occurrence > 0
    ) {
      const field = options.drift.field
      if (
        field === 'directory' ||
        field === 'symbolicLink' ||
        field === 'regular'
      )
        return { ...source, [field]: !source[field] }
      return { ...source, [field]: Number(source[field]) + 1 }
    }
    return source
  }
  const makeHandle = (role: Role) => ({
    stat: vi.fn(async () => {
      if (record(`stat-${role}`)) throw new Error('fixture-stat')
      return statValue(valueFor(role, 'held') as typeof parent)
    }),
    close: vi.fn(async () => {
      if (record(`close-${role}`)) throw new Error('fixture-close')
    }),
  })
  const handles = {
    parent: makeHandle('parent'),
    scratch: makeHandle('scratch'),
    probe: makeHandle('probe'),
  }
  const host = {
    environmentKeys: [
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'TZ',
      '__CF_USER_TEXT_ENCODING',
    ],
    platform: 'darwin',
    nodeVersion: '24.18.1',
    execPath: '/opt/homebrew/Cellar/node@24/24.18.1/bin/node',
    cwd: repositoryRoot,
    euid: 501,
    flags: {
      directory: 0x00100000,
      noFollow: 0x00000100,
      closeOnExec: undefined,
    },
    values: { LANG: 'C', LC_ALL: 'C', TMPDIR: '/private/tmp', TZ: 'UTC' },
    ...options.host,
  }
  let scratchLookup = 0
  let occupancyPass = 0
  let firstNameReads = 0
  const dependencies = {
    hostReaders: {
      environmentKeys: vi.fn(() => [...host.environmentKeys]),
      environmentValue: vi.fn((key: string) => host.values[key]),
      platform: vi.fn(() => host.platform),
      nodeVersion: vi.fn(() => host.nodeVersion),
      execPath: vi.fn(() => host.execPath),
      cwd: vi.fn(() => host.cwd),
      euid: vi.fn(() => host.euid),
      flagValues: vi.fn(() => ({ ...host.flags })),
    },
    realpath: vi.fn(async () => {
      if (record('realpath')) throw new Error('fixture-realpath')
      return repositoryRoot
    }),
    openParent: vi.fn(async (path: string, flags: number) => {
      if (record('open-parent')) throw new Error('fixture-open')
      expect(path).toBe(parentPath)
      expect(flags).toBe(0x01100100)
      return handles.parent
    }),
    openScratch: vi.fn(async (path: string, flags: number) => {
      if (record('open-scratch')) throw new Error('fixture-open')
      expect(path).toBe(scratchPath)
      expect(flags).toBe(0x01100100)
      return handles.scratch
    }),
    openProbe: vi.fn(async (path: string, flags: number) => {
      if (record('open-probe')) throw new Error('fixture-open')
      expect(path).toBe(probePath)
      expect(flags).toBe(0x01000100)
      return handles.probe
    }),
    lstat: vi.fn(async (path: string) => {
      const role: Role =
        path === parentPath
          ? 'parent'
          : path === probePath
            ? 'probe'
            : 'scratch'
      if (record(`lstat-${role}`)) throw new Error('fixture-lstat')
      if (role === 'scratch') {
        const presence = options.presence?.[scratchLookup++] ?? 'present'
        if (presence === 'absent') {
          const error = new Error('fixture-absent') as NodeJS.ErrnoException
          error.code = 'ENOENT'
          throw error
        }
      }
      return statValue(valueFor(role, 'named') as typeof parent)
    }),
    openOccupancy: vi.fn(async (path: string, settings: unknown) => {
      if (record(`open-occupancy-${occupancyPass + 1}`))
        throw new Error('fixture-occupancy-open')
      expect(path).toBe(scratchPath)
      expect(settings).toEqual({
        encoding: 'utf8',
        bufferSize: 1,
        recursive: false,
      })
      const pass = options.passes?.[occupancyPass] ?? []
      occupancyPass += 1
      let readCount = 0
      const entry =
        options.firstEntryMode === 'accessor'
          ? (() => {
              const value = {}
              Object.defineProperty(value, 'name', {
                configurable: false,
                enumerable: true,
                get: () => {
                  firstNameReads += 1
                  return 'probe'
                },
              })
              return value
            })()
          : new Proxy(
              {},
              {
                get: (_target, key) => {
                  if (key === 'then') return undefined
                  if (key === 'name') {
                    firstNameReads += 1
                    return 'probe'
                  }
                  throw new Error('fixture-dirent-property')
                },
              },
            )
      return {
        read: vi.fn(async () => {
          readCount += 1
          if (record(`read-occupancy-${occupancyPass}`))
            throw new Error('fixture-occupancy-read')
          const state = pass[readCount - 1]
          if (state === undefined || state === 'empty') return null
          if (state === 'probe') return entry
          return new Proxy(
            {},
            {
              get: (_target, key) => {
                if (key === 'then') return undefined
                if (key === 'name') return 'not-probe'
                throw new Error('fixture-dirent-property')
              },
            },
          )
        }),
        close: vi.fn(async () => {
          if (record(`close-occupancy-${occupancyPass}`))
            throw new Error('fixture-occupancy-close')
        }),
      }
    }),
    formResult: vi.fn((residueState: string) => {
      if (record('form-result')) throw new Error('fixture-result')
      if (Object.prototype.hasOwnProperty.call(options, 'result'))
        return options.result
      return Object.freeze({ residueState })
    }),
  }
  return {
    dependencies,
    events,
    handles,
    get firstNameReads() {
      return firstNameReads
    },
  }
}

const run = async (
  current: ReturnType<typeof fixture>,
  args: readonly string[] = argv,
) =>
  classifier.runPublicFdResidueShapeClassifierForFixture(
    args,
    current.dependencies,
  )

describe('Decision 143 fixed-probe residue shape classifier', () => {
  it('keeps every fixture seam test-only', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const current = fixture()
    try {
      await expect(run(current)).rejects.toThrow('fixture-only')
      expect(() =>
        classifier.formatPublicFdResidueShapeResultForFixture({}),
      ).toThrow('fixture-only')
      expect(() =>
        classifier.writePublicFdResidueShapeResultForFixture(
          'private\n',
          vi.fn(),
        ),
      ).toThrow('fixture-only')
      expect(() =>
        classifier.executePublicFdResidueShapeClassifierForFixture(
          argv,
          current.dependencies,
          vi.fn(async () => {}),
        ),
      ).toThrow('fixture-only')
      expect(current.dependencies.realpath).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [{ presence: ['absent', 'absent'] }, 'absent'],
    [{ passes: [[], []] }, 'observed-empty-candidate'],
    [{ passes: [['probe'], ['probe']] }, 'sole-normalized-probe-candidate'],
    [{ passes: [['other'], ['other']] }, 'other-present'],
    [{ rejectedScratch: { mode: 0o755 } }, 'other-present'],
    [
      { passes: [['probe'], ['probe']], rejectedProbe: { mode: 0o644 } },
      'other-present',
    ],
  ] as const)('classifies state %# as %s', async (options, state) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      await expect(run(fixture(options))).resolves.toEqual({
        residueState: state,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    [[[], []], 'observed-empty-candidate'],
    [[[], ['probe']], 'stopped'],
    [[[], ['other']], 'stopped'],
    [[['probe'], []], 'stopped'],
    [[['probe'], ['probe']], 'sole-normalized-probe-candidate'],
    [[['probe'], ['other']], 'stopped'],
    [[['other'], []], 'stopped'],
    [[['other'], ['probe']], 'stopped'],
    [[['other'], ['other']], 'other-present'],
  ] as const)('maps pass pairing %# to %s', async (passes, expected) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({ passes })
      if (expected === 'stopped')
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
      else
        await expect(run(current)).resolves.toEqual({
          residueState: expected,
        })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('uses two independent passes and exact occupancy options', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({ passes: [['probe'], ['probe']] })
      await expect(run(current)).resolves.toEqual({
        residueState: 'sole-normalized-probe-candidate',
      })
      expect(
        current.events.filter((event) => event.startsWith('read-occupancy')),
      ).toEqual([
        'read-occupancy-1',
        'read-occupancy-1',
        'read-occupancy-2',
        'read-occupancy-2',
      ])
      expect(
        current.events.filter((event) => event.startsWith('close-occupancy')),
      ).toEqual(['close-occupancy-1', 'close-occupancy-2'])
      expect(current.dependencies.openOccupancy).toHaveBeenCalledTimes(2)
      expect(current.dependencies.openScratch).toHaveBeenCalledOnce()
      expect(current.dependencies.openProbe).toHaveBeenCalledOnce()
      expect(current.firstNameReads).toBe(2)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['proxy', 'accessor'] as const)(
    'reads only the first Dirent name once per pass for a %s entry',
    async (firstEntryMode) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const current = fixture({
          firstEntryMode,
          passes: [['probe'], ['probe']],
        })
        await expect(run(current)).resolves.toEqual({
          residueState: 'sole-normalized-probe-candidate',
        })
        expect(current.firstNameReads).toBe(2)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('keeps absent and rejected roots on the no-inventory path', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const absent = fixture({ presence: ['absent', 'absent'] })
      await expect(run(absent)).resolves.toEqual({ residueState: 'absent' })
      expect(absent.dependencies.openScratch).not.toHaveBeenCalled()
      expect(absent.dependencies.openOccupancy).not.toHaveBeenCalled()
      expect(absent.dependencies.openProbe).not.toHaveBeenCalled()
      expect(absent.events.slice(-4)).toEqual([
        'stat-parent',
        'lstat-parent',
        'close-parent',
        'form-result',
      ])

      const rejected = fixture({ rejectedScratch: { mode: 0o755 } })
      await expect(run(rejected)).resolves.toEqual({
        residueState: 'other-present',
      })
      expect(rejected.dependencies.openScratch).not.toHaveBeenCalled()
      expect(rejected.dependencies.openOccupancy).not.toHaveBeenCalled()
      expect(rejected.dependencies.openProbe).not.toHaveBeenCalled()
      expect(rejected.events.slice(-4)).toEqual([
        'stat-parent',
        'lstat-parent',
        'close-parent',
        'form-result',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('stops at the second non-null entry without reading its name or a third entry', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({
        passes: [
          ['probe', 'other'],
          ['probe', 'other'],
        ],
      })
      await expect(run(current)).resolves.toEqual({
        residueState: 'other-present',
      })
      expect(
        current.events.filter((event) => event.startsWith('read-occupancy')),
      ).toEqual([
        'read-occupancy-1',
        'read-occupancy-1',
        'read-occupancy-2',
        'read-occupancy-2',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['open-occupancy-1', 'open-occupancy-2'] as const)(
    'stops on %s and closes every already-acquired handle',
    async (failure) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const current = fixture({
          passes: [['probe'], ['probe']],
          fail: failure,
        })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.events).toContain('close-scratch')
        expect(current.events).toContain('close-parent')
        expect(current.events).not.toContain('form-result')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(driftCases)(
    'stops on complete %s metadata drift matrix',
    async (_, drift) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        await expect(
          run(fixture({ passes: [['probe'], ['probe']], drift })),
        ).rejects.toThrow('shape-classifier-stopped')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    ['absent-to-present', ['absent', 'present']],
    ['present-to-absent', ['present', 'absent']],
  ] as const)('stops on %s fixed-name presence drift', async (_, presence) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({ presence })
      await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
      expect(current.dependencies.openScratch).not.toHaveBeenCalled()
      expect(current.dependencies.openOccupancy).not.toHaveBeenCalled()
      expect(current.dependencies.openProbe).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects every inventory disagreement', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const passes of [
        [[], ['other']],
        [['other'], []],
        [['probe'], []],
        [['probe'], ['other']],
        [['other'], ['probe']],
      ] as const)
        await expect(run(fixture({ passes }))).rejects.toThrow(
          'shape-classifier-stopped',
        )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('routes rejected probe shape only after candidate/candidate agreement', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const stableRejected = fixture({
        passes: [['probe'], ['probe']],
        rejectedProbe: { mode: 0o644 },
      })
      await expect(run(stableRejected)).resolves.toEqual({
        residueState: 'other-present',
      })
      expect(stableRejected.dependencies.openProbe).not.toHaveBeenCalled()
      for (const passes of [
        [['probe'], []],
        [['probe'], ['other']],
      ] as const)
        await expect(
          run(
            fixture({
              passes,
              rejectedProbe: { mode: 0o644 },
            }),
          ),
        ).rejects.toThrow('shape-classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['kind', { regular: false, directory: true }],
    ['symlink', { symbolicLink: true }],
    ['uid', { uid: 500 }],
    ['device', { dev: 16777232 }],
    ['mode', { mode: 0o501 }],
    ['link-count', { nlink: 2 }],
    ['size-zero', { size: 0 }],
    ['size-over-bound', { size: 16_777_217 }],
  ] as const)(
    'maps rejected probe predicate %s to other-present',
    async (_, rejectedProbe) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        await expect(
          run(fixture({ passes: [['probe'], ['probe']], rejectedProbe })),
        ).resolves.toEqual({ residueState: 'other-present' })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    ['size-one', { size: 1 }],
    ['size-maximum', { size: 16_777_216 }],
  ] as const)('accepts normalized probe boundary %s', async (_, probeShape) => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({
        passes: [['probe'], ['probe']],
        rejectedProbe: probeShape,
      })
      await expect(run(current)).resolves.toEqual({
        residueState: 'sole-normalized-probe-candidate',
      })
      expect(current.dependencies.openProbe).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('holds scratch and normalized probe custody through pass two', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({ passes: [['probe'], ['probe']] })
      await run(current)
      expect(current.events.indexOf('open-scratch')).toBeGreaterThan(-1)
      expect(current.events.indexOf('open-probe')).toBeGreaterThan(
        current.events.indexOf('close-occupancy-1'),
      )
      expect(current.events.indexOf('close-probe')).toBeGreaterThan(
        current.events.indexOf('close-occupancy-2'),
      )
      expect(current.events.slice(-4)).toEqual([
        'close-probe',
        'close-scratch',
        'close-parent',
        'form-result',
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects old grammar and malformed host before filesystem access', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      // BEGIN RETIRED D142 REJECTED-INPUT FIXTURES
      for (const args of [
        [],
        ['classify-a-fd-map-residue-shape'],
        [...argv, 'extra'],
        ['classify-a-fd-map-residue-shape', '--invented'],
        [
          'classify-a-fd-map-residue',
          '--confirm-m45-public-a-fd-map-residue-classifier-v1',
        ],
        [
          'diagnose-a-fd-map',
          '--confirm-m45-policy-native-a-fd-map-diagnostic-v3',
        ],
        [
          'recover-a-fd-map-scratch',
          '--confirm-m45-policy-native-a-fd-map-scratch-recovery-v1',
        ],
        (() => {
          const sparse = Array(2) as string[]
          sparse[0] = argv[0]
          return sparse
        })(),
        (() => {
          const accessor = [...argv]
          Object.defineProperty(accessor, '1', {
            enumerable: true,
            configurable: true,
            get: () => argv[1],
          })
          return accessor
        })(),
        Object.setPrototypeOf([...argv], { inherited: true }),
        new Proxy([...argv], {}),
      ]) {
        const current = fixture()
        await expect(run(current, args)).rejects.toThrow(
          'shape-classifier-stopped',
        )
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
        expect(current.dependencies.openParent).not.toHaveBeenCalled()
      }
      // END RETIRED D142 REJECTED-INPUT FIXTURES
      for (const host of [
        {
          environmentKeys: [
            'LANG',
            'LC_ALL',
            'TMPDIR',
            'TZ',
            '__CF_USER_TEXT_ENCODING',
            'EXTRA',
          ],
        },
        { environmentKeys: ['LANG'] },
        {
          values: {
            LANG: 'en_US.UTF-8',
            LC_ALL: 'C',
            TMPDIR: '/private/tmp',
            TZ: 'UTC',
          },
        },
        {
          values: {
            LANG: 'C',
            LC_ALL: 'en_US.UTF-8',
            TMPDIR: '/private/tmp',
            TZ: 'UTC',
          },
        },
        {
          values: {
            LANG: 'C',
            LC_ALL: 'C',
            TMPDIR: '/tmp',
            TZ: 'UTC',
          },
        },
        {
          values: {
            LANG: 'C',
            LC_ALL: 'C',
            TMPDIR: '/private/tmp',
            TZ: 'GMT',
          },
        },
        { platform: 'linux' },
        { nodeVersion: '24.18.0' },
        { execPath: '/usr/bin/node' },
        { cwd: '/tmp' },
        { euid: 0 },
        { flags: { directory: 1, noFollow: 0x100, closeOnExec: undefined } },
        {
          flags: {
            directory: 0x00100000,
            noFollow: 0x00000100,
            closeOnExec: 1,
          },
        },
      ]) {
        const current = fixture({ host })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
        expect(current.dependencies.openParent).not.toHaveBeenCalled()
      }

      {
        const current = fixture()
        current.dependencies.hostReaders = new Proxy(
          current.dependencies.hostReaders,
          {},
        )
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        Object.defineProperty(current.dependencies.hostReaders, 'platform', {
          configurable: true,
          enumerable: true,
          get: () => 'darwin',
        })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        current.dependencies.hostReaders = Object.assign(
          Object.create({ inherited: true }),
          current.dependencies.hostReaders,
        )
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        current.dependencies.hostReaders.environmentKeys = vi.fn(
          () =>
            new Proxy(
              [...current.dependencies.hostReaders.environmentKeys()],
              {},
            ),
        )
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        const original = current.dependencies.hostReaders.environmentKeys
        current.dependencies.hostReaders.environmentKeys = vi.fn(() => {
          const keys = [...original()]
          Object.defineProperty(keys, '0', {
            configurable: true,
            enumerable: true,
            get: () => 'LANG',
          })
          return keys
        })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        const original = current.dependencies.hostReaders.environmentKeys
        current.dependencies.hostReaders.environmentKeys = vi.fn(() =>
          Object.setPrototypeOf([...original()], { inherited: true }),
        )
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        current.dependencies.hostReaders.flagValues = vi.fn(
          () =>
            new Proxy({ ...current.dependencies.hostReaders.flagValues() }, {}),
        )
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.dependencies.realpath).not.toHaveBeenCalled()
      }
      {
        const current = fixture()
        const original = current.dependencies.hostReaders.environmentValue
        const environmentValue = vi.fn((key: string) => {
          if (key === '__CF_USER_TEXT_ENCODING')
            throw new Error('fixture-cf-read')
          return original(key)
        })
        current.dependencies.hostReaders.environmentValue = environmentValue
        await expect(run(current)).resolves.toEqual({
          residueState: 'observed-empty-candidate',
        })
        expect(environmentValue).not.toHaveBeenCalledWith(
          '__CF_USER_TEXT_ENCODING',
        )
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('rejects custody drift and every close failure', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const drift of [
        { role: 'parent', scope: 'named', field: 'ino' },
        { role: 'scratch', scope: 'named', field: 'size' },
        { role: 'probe', scope: 'named', field: 'ino' },
      ] as const)
        await expect(
          run(fixture({ passes: [['probe'], ['probe']], drift })),
        ).rejects.toThrow('shape-classifier-stopped')
      for (const fail of [
        'open-parent',
        'open-scratch',
        'open-probe',
        'close-occupancy-1',
        'close-occupancy-2',
        'close-probe',
        'close-scratch',
        'close-parent',
      ])
        await expect(
          run(fixture({ passes: [['probe'], ['probe']], fail })),
        ).rejects.toThrow('shape-classifier-stopped')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    ['parent-held', { role: 'parent', scope: 'held', field: 'ino' }],
    ['parent-named', { role: 'parent', scope: 'named', field: 'ino' }],
    ['scratch-held', { role: 'scratch', scope: 'held', field: 'ino' }],
    ['scratch-named', { role: 'scratch', scope: 'named', field: 'ino' }],
    ['probe-held', { role: 'probe', scope: 'held', field: 'ino' }],
    ['probe-named', { role: 'probe', scope: 'named', field: 'ino' }],
  ] as const)(
    'stops on %s identity drift across observations',
    async (_, drift) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        await expect(
          run(fixture({ passes: [['probe'], ['probe']], drift })),
        ).rejects.toThrow('shape-classifier-stopped')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each([
    'stat-parent',
    'lstat-parent',
    'stat-scratch',
    'lstat-scratch',
    'stat-probe',
    'lstat-probe',
    'read-occupancy-1',
    'read-occupancy-2',
    'form-result',
  ] as const)(
    'stops on %s failure and keeps cleanup generic',
    async (failure) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const current = fixture({
          passes: [['probe'], ['probe']],
          fail: failure,
        })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        if (failure !== 'stat-parent' && failure !== 'lstat-parent')
          expect(current.events).toContain('close-parent')
        if (failure === 'form-result')
          expect(current.events).toContain('form-result')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('continues closing acquired handles after an occupancy close failure', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({
        passes: [['probe'], ['probe']],
        fail: 'close-occupancy-1',
      })
      await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
      expect(current.events).toEqual(
        expect.arrayContaining([
          'close-occupancy-1',
          'close-scratch',
          'close-parent',
        ]),
      )
      expect(current.events).not.toContain('form-result')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(['close-probe', 'close-scratch', 'close-parent'] as const)(
    'closes probe, scratch, and parent exactly once after %s failure',
    async (failure) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const current = fixture({
          passes: [['probe'], ['probe']],
          fail: failure,
        })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.events.slice(-3)).toEqual([
          'close-probe',
          'close-scratch',
          'close-parent',
        ])
        for (const event of ['close-probe', 'close-scratch', 'close-parent'])
          expect(
            current.events.filter((currentEvent) => currentEvent === event),
          ).toHaveLength(1)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('formats and writes only exact closed results once', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      for (const residueState of [
        'absent',
        'observed-empty-candidate',
        'sole-normalized-probe-candidate',
        'other-present',
      ]) {
        const line = `{"mode":"classify-a-fd-map-residue-shape","status":"a-fd-map-residue-shape-classified","residueState":"${residueState}"}\n`
        expect(
          classifier.formatPublicFdResidueShapeResultForFixture(
            Object.freeze({ residueState }),
          ),
        ).toEqual({ line, exitCode: 0 })
        const write = vi.fn(async () => {})
        await expect(
          classifier.writePublicFdResidueShapeResultForFixture(line, write),
        ).resolves.toBe(0)
        expect(write).toHaveBeenCalledExactlyOnceWith(line)
      }
      const stopped =
        '{"mode":"classify-a-fd-map-residue-shape","status":"stopped"}\n'
      for (const malformed of [
        undefined,
        {},
        Object.freeze({ residueState: 'unknown' }),
        Object.freeze({ residueState: 'absent', extra: true }),
        new Proxy(Object.freeze({ residueState: 'absent' }), {}),
      ])
        expect(
          classifier.formatPublicFdResidueShapeResultForFixture(malformed),
        ).toEqual({ line: stopped, exitCode: 1 })
      await expect(
        classifier.writePublicFdResidueShapeResultForFixture(
          'private\n',
          vi.fn(),
        ),
      ).resolves.toBe(1)
      await expect(
        classifier.writePublicFdResidueShapeResultForFixture(
          stopped,
          vi.fn(async () => {
            throw new Error('fixture-write')
          }),
        ),
      ).resolves.toBe(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    undefined,
    null,
    [],
    { residueState: 'absent' },
    Object.freeze({ residueState: 'unknown' }),
    Object.freeze({ residueState: 'absent', extra: true }),
    new Proxy(Object.freeze({ residueState: 'absent' }), {}),
    (() => {
      const result = Object.create(Object.prototype)
      Object.defineProperty(result, 'residueState', {
        configurable: true,
        enumerable: true,
        get: () => 'absent',
      })
      return Object.freeze(result)
    })(),
  ])(
    'rejects malformed formResult value %# before publication',
    async (result) => {
      vi.stubEnv('NODE_ENV', 'test')
      try {
        const current = fixture({ result })
        await expect(run(current)).rejects.toThrow('shape-classifier-stopped')
        expect(current.events.slice(-2)).toEqual([
          'close-parent',
          'form-result',
        ])
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('uses the shared execute and writer path without default filesystem access', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const current = fixture({ presence: ['absent', 'absent'] })
      const write = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueShapeClassifierForFixture(
          argv,
          current.dependencies,
          write,
        ),
      ).resolves.toBe(0)
      expect(write).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue-shape","status":"a-fd-map-residue-shape-classified","residueState":"absent"}\n',
      )
      const stopped = fixture({ fail: 'realpath' })
      const stoppedWrite = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueShapeClassifierForFixture(
          argv,
          stopped.dependencies,
          stoppedWrite,
        ),
      ).resolves.toBe(1)
      expect(stoppedWrite).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue-shape","status":"stopped"}\n',
      )
      const resultFailure = fixture({ fail: 'form-result' })
      const resultFailureWrite = vi.fn(async () => {})
      await expect(
        classifier.executePublicFdResidueShapeClassifierForFixture(
          argv,
          resultFailure.dependencies,
          resultFailureWrite,
        ),
      ).resolves.toBe(1)
      expect(resultFailureWrite).toHaveBeenCalledExactlyOnceWith(
        '{"mode":"classify-a-fd-map-residue-shape","status":"stopped"}\n',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('statically closes production privacy and retirement surfaces', async () => {
    const source = await readFile(
      new URL(
        '../scripts/m45-public-fd-residue-shape-classifier.mjs',
        import.meta.url,
      ),
      'utf8',
    )
    const focusedTestSource = await readFile(
      new URL(
        './m45-public-fd-residue-shape-classifier.test.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).not.toMatch(/child_process|\bspawn\b|\bexec(?:File)?\b/u)
    expect(source).not.toMatch(
      /\b(?:writeFile|appendFile|mkdir|chmod|rename|unlink|rmdir|rm)\b/u,
    )
    expect(source).not.toMatch(
      /xattr|acl|readFile|createHash|readdir|recursive:\s*true/iu,
    )
    expect(source).not.toMatch(
      /node:(?:net|http|https|tls|dns|dgram)|\bfetch\b|WebSocket|database|postgres|provider|uuid|randomUUID|retry|persist|application\//iu,
    )
    expect(source).toContain('recursive: false')
    expect(source).toContain('bufferSize: 1')
    expect(source).toContain('O_DIRECTORY')
    expect(source).toContain('O_NOFOLLOW')
    expect(source).toContain('O_CLOEXEC')
    await expect(
      lstat(
        new URL(
          '../scripts/m45-public-fd-residue-classifier.mjs',
          import.meta.url,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      lstat(
        new URL('./m45-public-fd-residue-classifier.test.ts', import.meta.url),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })

    const trackedBytes = execFileSync(
      '/usr/bin/git',
      ['-C', repositoryRoot, 'ls-files', '-z', '--', 'scripts', 'src'],
      {
        cwd: '/',
        encoding: 'buffer',
        env: {
          PATH: '/usr/bin:/bin',
          LC_ALL: 'C',
          LANG: 'C',
          TZ: 'UTC',
          NODE_ENV: 'test',
        },
      },
    )
    const trackedPaths = trackedBytes
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
    const retiredPaths = new Set([
      'scripts/m45-public-fd-residue-classifier.mjs',
      'src/m45-public-fd-residue-classifier.test.ts',
    ])
    const fixtureStart = focusedTestSource.indexOf(
      '// BEGIN RETIRED D142 REJECTED-INPUT FIXTURES',
    )
    const fixtureEnd = focusedTestSource.indexOf(
      '// END RETIRED D142 REJECTED-INPUT FIXTURES',
    )
    const fixtureRegion =
      fixtureStart >= 0 && fixtureEnd > fixtureStart
        ? focusedTestSource.slice(fixtureStart, fixtureEnd)
        : ''
    const retiredOperation = [
      ...fixtureRegion.matchAll(/['"](classify-[a-z0-9-]+residue[^'"]*)['"]/gu),
    ]
      .map((match) => match[1])
      .find((value) => value !== argv[0])
    const retiredConfirmation =
      retiredOperation === undefined
        ? undefined
        : fixtureRegion
            .slice(fixtureRegion.indexOf(retiredOperation))
            .match(/['"](--confirm-[^'"]+residue-classifier-v1)['"]/u)?.[1]
    const retiredConfirmations =
      retiredConfirmation === undefined ? [] : [retiredConfirmation]
    const fixtureLiterals = [
      ...(retiredOperation === undefined ? [] : [retiredOperation]),
      ...retiredConfirmations,
    ]
    const fixtureBefore = focusedTestSource.slice(0, fixtureStart)
    const fixtureAfter = focusedTestSource.slice(fixtureEnd)
    const fixtureOnlyAllowance =
      fixtureStart >= 0 &&
      fixtureEnd > fixtureStart &&
      fixtureLiterals.length >= 2 &&
      fixtureLiterals.every((literal) => fixtureRegion.includes(literal)) &&
      fixtureLiterals.every((literal) => {
        if (literal === retiredOperation)
          return (
            !fixtureBefore.includes(`'${literal}'`) &&
            !fixtureBefore.includes(`"${literal}"`) &&
            !fixtureAfter.includes(`'${literal}'`) &&
            !fixtureAfter.includes(`"${literal}"`)
          )
        return (
          !fixtureBefore.includes(literal) && !fixtureAfter.includes(literal)
        )
      })
    const retiredStatus =
      retiredOperation === undefined
        ? undefined
        : `${retiredOperation.replace(/^classify-/u, '')}-classified`
    let regularFileKindPolicy = true
    const productionSources: string[] = [source]
    for (const relativePath of trackedPaths) {
      let stat
      try {
        stat = await lstat(`${repositoryRoot}/${relativePath}`)
      } catch {
        if (retiredPaths.has(relativePath)) continue
        regularFileKindPolicy = false
        continue
      }
      if (!stat.isFile()) {
        regularFileKindPolicy = false
        continue
      }
      if (
        relativePath.startsWith('scripts/') &&
        !relativePath.endsWith('.test.mjs') &&
        !relativePath.endsWith('.test.ts')
      )
        productionSources.push(
          await readFile(`${repositoryRoot}/${relativePath}`, 'utf8'),
        )
      if (relativePath.startsWith('src/') && !relativePath.endsWith('.test.ts'))
        productionSources.push(
          await readFile(`${repositoryRoot}/${relativePath}`, 'utf8'),
        )
    }
    const deletedPathsAbsent = await Promise.all(
      [...retiredPaths].map(async (relativePath) => {
        try {
          await lstat(`${repositoryRoot}/${relativePath}`)
          return false
        } catch (error) {
          return (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        }
      }),
    ).then((values) => values.every(Boolean))
    const productionRetirementScan = productionSources.every(
      (currentSource) =>
        !currentSource.includes('m45-public-fd-residue-classifier.mjs') &&
        !currentSource.includes(
          'src/m45-public-fd-residue-classifier.test.ts',
        ) &&
        (retiredOperation === undefined ||
          (!currentSource.includes(`'${retiredOperation}'`) &&
            !currentSource.includes(`"${retiredOperation}"`))) &&
        retiredConfirmations.every(
          (confirmation) => !currentSource.includes(confirmation),
        ) &&
        (retiredStatus === undefined || !currentSource.includes(retiredStatus)),
    )
    expect({
      deletedPathsAbsent,
      regularFileKindPolicy,
      productionRetirementScan,
      testFixtureOnlyAllowance: fixtureOnlyAllowance,
    }).toEqual({
      deletedPathsAbsent: true,
      regularFileKindPolicy: true,
      productionRetirementScan: true,
      testFixtureOnlyAllowance: true,
    })
  })
})
