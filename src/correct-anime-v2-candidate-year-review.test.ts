import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  parseCandidateYearCorrectionArguments,
  runCandidateYearCorrection,
  type CandidateYearCorrectionPaths,
} from '@/../scripts/correct-anime-v2-candidate-year-review'

const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex')
const execFileAsync = promisify(execFile)

type InventoryRow = { path: string; bytes: number; sha256: string }

async function inventory(directory: string): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = []
  for (const entry of await readdir(directory, { recursive: true })) {
    const path = join(directory, entry)
    const state = await lstat(path)
    if (!state.isFile()) continue
    const bytes = await readFile(path)
    rows.push({
      path: relative(directory, path),
      bytes: bytes.length,
      sha256: sha256(bytes),
    })
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path))
}

async function absent(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'm45-year-correction-'))
  const reviewRoot = join(base, 'candidate-review')
  const source = join(reviewRoot, 'review-round-2')
  const paths: CandidateYearCorrectionPaths = {
    reviewRoot,
    source,
    stage: join(reviewRoot, '.decision-086-round-staging'),
    quarantine: join(
      reviewRoot,
      'quarantine/frozen-year-review-round-original',
    ),
    journal: join(reviewRoot, '.decision-086-round-journal.json'),
    journalStage: join(reviewRoot, '.decision-086-round-journal.staging.json'),
    docket: join(reviewRoot, 'frozen-format-year-audit.v1.json'),
    finalized: join(reviewRoot, 'finalized'),
    finalizeStage: join(reviewRoot, '.finalize-staging'),
  }
  await Promise.all(
    ['verdicts', 'completed', 'locks', 'revalidations'].map((name) =>
      mkdir(join(source, name), { recursive: true }),
    ),
  )
  await mkdir(join(reviewRoot, 'quarantine'), { recursive: true })
  for (let ordinal = 1; ordinal <= 160; ordinal += 1) {
    const manifest = String(ordinal).padStart(3, '0')
    await writeFile(
      join(source, 'locks', `${manifest}.locked.json`),
      `lock-${manifest}\n`,
    )
    if (ordinal <= 41)
      await writeFile(
        join(source, 'revalidations', `${manifest}.json`),
        `revalidation-${manifest}\n`,
      )
    else if (ordinal <= 160) {
      await writeFile(
        join(source, 'verdicts', `${manifest}.json`),
        `verdict-${manifest}\n`,
      )
      await writeFile(
        join(source, 'completed', `${manifest}.json`),
        `completed-${manifest}\n`,
      )
    }
  }
  await writeFile(join(source, 'recovery-plan.json'), 'recovery-plan\n')
  await writeFile(
    join(source, 'active-collision-audit.v1.json'),
    'active-audit\n',
  )
  const targetManifest = '042'
  const targetQid = 'Q42'
  const docketCore = {
    schema: 'zedarchive.anime-v2-frozen-format-year-audit',
    version: 1,
    receiptFileSha256: 'a'.repeat(64),
    acquisitionFileSha256: 'b'.repeat(64),
    records: 7_958,
    mismatches: [
      {
        manifest: targetManifest,
        qid: targetQid,
        lineage: 'fresh',
        expectedFormat: 'tv',
        projectedFormat: 'tv',
        expectedYear: 2020,
        projectedYear: 2021,
        formatMismatch: false,
        yearMismatch: true,
      },
    ],
  } as const
  const docket = {
    ...docketCore,
    auditSha256: sha256(JSON.stringify(docketCore)),
  }
  const docketText = `${JSON.stringify(docket, null, 2)}\n`
  await writeFile(paths.docket, docketText)
  const rows = await inventory(source)
  const tuple = [
    `verdicts/${targetManifest}.json`,
    `completed/${targetManifest}.json`,
    `locks/${targetManifest}.locked.json`,
  ].map((path) => {
    const row = rows.find((candidate) => candidate.path === path)!
    return { kind: path.split('/')[0], bytes: row.bytes, sha256: row.sha256 }
  })
  const expected = {
    docketFileSha256: sha256(docketText),
    docketAuditSha256: docket.auditSha256,
    sourceInventorySha256: sha256(JSON.stringify(rows)),
    targetTupleSha256: sha256(JSON.stringify(tuple)),
    recoveryPlanFileSha256: rows.find(
      ({ path }) => path === 'recovery-plan.json',
    )!.sha256,
    activeAuditFileSha256: rows.find(
      ({ path }) => path === 'active-collision-audit.v1.json',
    )!.sha256,
    counts: { verdicts: 119, completed: 119, locks: 160, revalidations: 41 },
  }
  const removed = new Set([
    `verdicts/${targetManifest}.json`,
    `completed/${targetManifest}.json`,
    `locks/${targetManifest}.locked.json`,
    'active-collision-audit.v1.json',
  ])
  return {
    base,
    paths,
    expected,
    targetManifest,
    originalRows: rows,
    retainedRows: rows.filter(({ path }) => !removed.has(path)),
  }
}

async function expectCompletedState(
  paths: CandidateYearCorrectionPaths,
  targetManifest: string,
  originalRows: readonly InventoryRow[],
  retainedRows: readonly InventoryRow[],
) {
  expect(await inventory(paths.source)).toEqual(retainedRows)
  expect(await inventory(paths.quarantine)).toEqual(originalRows)
  await absent(join(paths.source, 'verdicts', `${targetManifest}.json`))
  await absent(join(paths.source, 'completed', `${targetManifest}.json`))
  await absent(join(paths.source, 'locks', `${targetManifest}.locked.json`))
  await absent(join(paths.source, 'active-collision-audit.v1.json'))
  await absent(paths.stage)
  await absent(paths.journal)
  await absent(paths.journalStage)
}

describe('Decision 086 candidate year correction custody', () => {
  it('requires the exact one-shot live confirmation', () => {
    expect(
      parseCandidateYearCorrectionArguments([
        'apply',
        '--confirm-decision-086',
      ]),
    ).toEqual({ mode: 'apply' })
    for (const args of [
      [],
      ['apply'],
      ['apply', '--confirm'],
      ['recover', '--confirm-decision-086'],
    ])
      expect(() => parseCandidateYearCorrectionArguments(args)).toThrow()
  })

  it('rejects wrong CLI arguments with only the generic stopped terminal', async () => {
    const script = fileURLToPath(
      new URL(
        '../scripts/correct-anime-v2-candidate-year-review.ts',
        import.meta.url,
      ),
    )
    const outcome = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', script, 'apply'],
      { cwd: process.cwd() },
    ).then(
      () => null,
      (error: unknown) =>
        error as Readonly<{ code: number; stdout: string; stderr: string }>,
    )
    expect(outcome).toMatchObject({
      code: 1,
      stdout: '',
      stderr:
        '{"schema":"zedarchive.anime-v2-year-review-correction-terminal","version":1,"outcome":"stopped"}\n',
    })
  })

  it('promotes one exact fresh vacancy and retains the original namespace', async () => {
    const {
      base,
      paths,
      expected,
      targetManifest,
      originalRows,
      retainedRows,
    } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected),
      ).resolves.toEqual({ sourceFiles: 437, quarantinedFiles: 441 })
      await expectCompletedState(
        paths,
        targetManifest,
        originalRows,
        retainedRows,
      )
      await expect(runCandidateYearCorrection(paths, expected)).rejects.toThrow(
        'correction-quarantine',
      )
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  for (const crash of [
    'afterJournal',
    'afterQuarantine',
    'afterPromotion',
  ] as const) {
    it(`recovers only the exact ${crash} state`, async () => {
      const {
        base,
        paths,
        expected,
        targetManifest,
        originalRows,
        retainedRows,
      } = await fixture()
      try {
        await expect(
          runCandidateYearCorrection(paths, expected, {
            [crash]: async () => {
              throw new Error(crash)
            },
          }),
        ).rejects.toThrow(crash)
        await expect(
          runCandidateYearCorrection(paths, expected),
        ).resolves.toEqual({ sourceFiles: 437, quarantinedFiles: 441 })
        await expectCompletedState(
          paths,
          targetManifest,
          originalRows,
          retainedRows,
        )
      } finally {
        await rm(base, { recursive: true, force: true })
      }
    })
  }

  it('stops on docket, source, symlink, staging, and quarantine drift', async () => {
    const cases = [
      async (fixtureValue: Awaited<ReturnType<typeof fixture>>) =>
        writeFile(fixtureValue.paths.docket, '{}\n'),
      async (fixtureValue: Awaited<ReturnType<typeof fixture>>) =>
        writeFile(
          join(fixtureValue.paths.source, 'locks', '001.locked.json'),
          'drift\n',
        ),
      async (fixtureValue: Awaited<ReturnType<typeof fixture>>) =>
        symlink(
          join(fixtureValue.paths.source, 'recovery-plan.json'),
          join(fixtureValue.paths.source, 'unexpected-link'),
        ),
      async (fixtureValue: Awaited<ReturnType<typeof fixture>>) =>
        mkdir(fixtureValue.paths.stage),
      async (fixtureValue: Awaited<ReturnType<typeof fixture>>) =>
        mkdir(fixtureValue.paths.quarantine),
    ]
    for (const alter of cases) {
      const fixtureValue = await fixture()
      try {
        await alter(fixtureValue)
        await expect(
          runCandidateYearCorrection(fixtureValue.paths, fixtureValue.expected),
        ).rejects.toThrow()
        await absent(fixtureValue.paths.journal)
      } finally {
        await rm(fixtureValue.base, { recursive: true, force: true })
      }
    }
  })

  it('stops on a forged journal instead of trusting a recoverable-looking state', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await writeFile(paths.journal, '{}\n')
      await expect(
        runCandidateYearCorrection(paths, expected),
      ).rejects.toThrow()
      expect((await inventory(paths.source)).length).toBe(441)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('rejects a self-consistent journal whose staged inventory is not the exact subtraction', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          afterJournal: async () => {
            throw new Error('after-journal')
          },
        }),
      ).rejects.toThrow('after-journal')
      const journal = JSON.parse(await readFile(paths.journal, 'utf8')) as {
        sourceInventory: InventoryRow[]
        stagedInventory: InventoryRow[]
        stagedInventorySha256: string
        journalSha256?: string
        [key: string]: unknown
      }
      journal.stagedInventory = journal.sourceInventory
      journal.stagedInventorySha256 = sha256(
        JSON.stringify(journal.stagedInventory),
      )
      const core = { ...journal }
      delete core.journalSha256
      journal.journalSha256 = sha256(JSON.stringify(core))
      await writeFile(paths.journal, `${JSON.stringify(journal, null, 2)}\n`)
      await expect(runCandidateYearCorrection(paths, expected)).rejects.toThrow(
        'staged-inventory',
      )
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('revalidates the pinned docket before journal recovery', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          afterJournal: async () => {
            throw new Error('after-journal')
          },
        }),
      ).rejects.toThrow('after-journal')
      await writeFile(paths.docket, '{}\n')
      await expect(
        runCandidateYearCorrection(paths, expected),
      ).rejects.toThrow()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('binds the journal target identity to the pinned docket', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          afterJournal: async () => {
            throw new Error('after-journal')
          },
        }),
      ).rejects.toThrow('after-journal')
      const journal = JSON.parse(await readFile(paths.journal, 'utf8')) as {
        targetQid: string
        journalSha256?: string
        [key: string]: unknown
      }
      journal.targetQid = 'Q43'
      const core = { ...journal }
      delete core.journalSha256
      journal.journalSha256 = sha256(JSON.stringify(core))
      await writeFile(paths.journal, `${JSON.stringify(journal, null, 2)}\n`)
      await expect(runCandidateYearCorrection(paths, expected)).rejects.toThrow(
        'journal-target',
      )
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('cleans an exclusively owned partial stage after copy failure', async () => {
    const { base, paths, expected } = await fixture()
    let copies = 0
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          copyEntry: async (source, destination) => {
            copies += 1
            if (copies === 2) throw new Error('copy-failure')
            await cp(source, destination, { recursive: true })
          },
        }),
      ).rejects.toThrow('copy-failure')
      await absent(paths.stage)
      await absent(paths.journal)
      expect((await inventory(paths.source)).length).toBe(441)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('removes both journal links when publication stops after linking', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          afterJournalLink: async () => {
            throw new Error('after-journal-link')
          },
        }),
      ).rejects.toThrow('after-journal-link')
      await absent(paths.stage)
      await absent(paths.journal)
      await absent(paths.journalStage)
      expect((await inventory(paths.source)).length).toBe(441)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('stops before journalling when namespace devices differ', async () => {
    const { base, paths, expected } = await fixture()
    try {
      await expect(
        runCandidateYearCorrection(paths, expected, {
          directoryDevice: async (path) => (path === paths.stage ? 2 : 1),
        }),
      ).rejects.toThrow('cross-device')
      await absent(paths.stage)
      await absent(paths.journal)
      expect((await inventory(paths.source)).length).toBe(441)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  for (const destinationRace of [
    'beforeQuarantineRename',
    'beforePromotionRename',
  ] as const) {
    it(`stops without overwriting a ${destinationRace} destination race`, async () => {
      const { base, paths, expected } = await fixture()
      const racedPath =
        destinationRace === 'beforeQuarantineRename'
          ? paths.quarantine
          : paths.source
      try {
        await expect(
          runCandidateYearCorrection(paths, expected, {
            [destinationRace]: async () => {
              await mkdir(racedPath)
            },
          }),
        ).rejects.toThrow('destination-exists')
        expect((await lstat(racedPath)).isDirectory()).toBe(true)
      } finally {
        await rm(base, { recursive: true, force: true })
      }
    })
  }

  it('rejects every unexpected journalled namespace-presence combination', async () => {
    const alterations = [
      async (paths: CandidateYearCorrectionPaths) => {
        await rm(paths.source, { recursive: true })
        await rm(paths.stage, { recursive: true })
      },
      async (paths: CandidateYearCorrectionPaths) => {
        await rm(paths.source, { recursive: true })
        await rm(paths.stage, { recursive: true })
        await mkdir(paths.quarantine)
      },
      async (paths: CandidateYearCorrectionPaths) => {
        await rm(paths.source, { recursive: true })
      },
      async (paths: CandidateYearCorrectionPaths) => {
        await rm(paths.stage, { recursive: true })
      },
      async (paths: CandidateYearCorrectionPaths) => {
        await mkdir(paths.quarantine)
      },
    ]
    for (const alter of alterations) {
      const { base, paths, expected } = await fixture()
      try {
        await expect(
          runCandidateYearCorrection(paths, expected, {
            afterJournal: async () => {
              throw new Error('after-journal')
            },
          }),
        ).rejects.toThrow('after-journal')
        await alter(paths)
        await expect(
          runCandidateYearCorrection(paths, expected),
        ).rejects.toThrow()
      } finally {
        await rm(base, { recursive: true, force: true })
      }
    }
  }, 15_000)

  it('rejects symlinked review, source, and quarantine-parent roots', async () => {
    for (const rootKind of ['review', 'source', 'quarantine-parent'] as const) {
      const fixtureValue = await fixture()
      try {
        if (rootKind === 'review') {
          const linkedRoot = join(fixtureValue.base, 'linked-review-root')
          await symlink(fixtureValue.paths.reviewRoot, linkedRoot)
          const linkedPaths = Object.fromEntries(
            Object.entries(fixtureValue.paths).map(([key, path]) => [
              key,
              path.replace(fixtureValue.paths.reviewRoot, linkedRoot),
            ]),
          ) as CandidateYearCorrectionPaths
          await expect(
            runCandidateYearCorrection(linkedPaths, fixtureValue.expected),
          ).rejects.toThrow('directory-shape')
        } else if (rootKind === 'source') {
          const realSource = join(fixtureValue.paths.reviewRoot, 'real-source')
          await rename(fixtureValue.paths.source, realSource)
          await symlink(realSource, fixtureValue.paths.source)
          await expect(
            runCandidateYearCorrection(
              fixtureValue.paths,
              fixtureValue.expected,
            ),
          ).rejects.toThrow('directory-shape')
        } else {
          const quarantineParent = join(
            fixtureValue.paths.reviewRoot,
            'quarantine',
          )
          const realParent = join(fixtureValue.base, 'real-quarantine')
          await rm(quarantineParent, { recursive: true })
          await mkdir(realParent)
          await symlink(realParent, quarantineParent)
          await expect(
            runCandidateYearCorrection(
              fixtureValue.paths,
              fixtureValue.expected,
            ),
          ).rejects.toThrow('directory-shape')
        }
      } finally {
        await rm(fixtureValue.base, { recursive: true, force: true })
      }
    }
  })
})
