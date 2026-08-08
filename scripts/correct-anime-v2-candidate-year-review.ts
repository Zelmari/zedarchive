import { createHash } from 'node:crypto'
import {
  cp,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from '@/config/zod'

const root = fileURLToPath(new URL('../', import.meta.url))
const reviewRoot = join(root, '.local/m45/candidate-review')
const livePaths = {
  reviewRoot,
  source: join(reviewRoot, 'review-round-2'),
  stage: join(reviewRoot, '.decision-086-round-staging'),
  quarantine: join(reviewRoot, 'quarantine/frozen-year-review-round-original'),
  journal: join(reviewRoot, '.decision-086-round-journal.json'),
  journalStage: join(reviewRoot, '.decision-086-round-journal.staging.json'),
  docket: join(reviewRoot, 'frozen-format-year-audit.v1.json'),
  finalized: join(reviewRoot, 'finalized'),
  finalizeStage: join(reviewRoot, '.finalize-staging'),
} as const

const shaSchema = z.string().regex(/^[a-f0-9]{64}$/)
const qidSchema = z.string().regex(/^Q[1-9][0-9]*$/)
const mismatchSchema = z.strictObject({
  manifest: z.string().regex(/^[0-9]{3}$/),
  qid: qidSchema,
  lineage: z.literal('fresh'),
  expectedFormat: z.string(),
  projectedFormat: z.string(),
  expectedYear: z.number().int().nullable(),
  projectedYear: z.number().int().nullable(),
  formatMismatch: z.literal(false),
  yearMismatch: z.literal(true),
})
const docketSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-frozen-format-year-audit'),
  version: z.literal(1),
  receiptFileSha256: shaSchema,
  acquisitionFileSha256: shaSchema,
  records: z.literal(7_958),
  mismatches: z.array(mismatchSchema).length(1),
  auditSha256: shaSchema,
})

const inventoryRowSchema = z.strictObject({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: shaSchema,
})
type InventoryRow = z.infer<typeof inventoryRowSchema>
const journalCoreSchema = z.strictObject({
  schema: z.literal('zedarchive.anime-v2-year-review-correction-journal'),
  version: z.literal(1),
  docketFileSha256: shaSchema,
  docketAuditSha256: shaSchema,
  targetManifest: z.string().regex(/^[0-9]{3}$/),
  targetQid: qidSchema,
  sourceInventory: z.array(inventoryRowSchema),
  sourceInventorySha256: shaSchema,
  stagedInventory: z.array(inventoryRowSchema),
  stagedInventorySha256: shaSchema,
  targetTupleSha256: shaSchema,
})
const journalSchema = journalCoreSchema.extend({ journalSha256: shaSchema })
type Journal = z.infer<typeof journalSchema>

export type CandidateYearCorrectionPaths = Readonly<typeof livePaths>
type Hooks = Readonly<{
  copyEntry?: (source: string, destination: string) => Promise<void>
  directoryDevice?: (path: string) => Promise<number>
  afterJournalLink?: () => Promise<void>
  afterJournal?: () => Promise<void>
  beforeQuarantineRename?: () => Promise<void>
  afterQuarantine?: () => Promise<void>
  beforePromotionRename?: () => Promise<void>
  afterPromotion?: () => Promise<void>
}>
type Expectations = Readonly<{
  docketFileSha256: string
  docketAuditSha256: string
  sourceInventorySha256: string
  targetTupleSha256: string
  recoveryPlanFileSha256: string
  activeAuditFileSha256: string
  counts: Readonly<{
    verdicts: number
    completed: number
    locks: number
    revalidations: number
  }>
}>

const liveExpectations: Expectations = {
  docketFileSha256:
    '903016f0f23936a316f963937dd2fde74b118545e6a0eca9f9e72d851480f721',
  docketAuditSha256:
    '0f562b0a00af0793108df802a162bfe57abd70252ad3dc3b13bfaf119d5a1891',
  sourceInventorySha256:
    '1a3e614db8abd7718f472f412d09a86a6d804f5d83ee61deec4b6cda709fa6eb',
  targetTupleSha256:
    'fb6baa0769178836273f4cd30a18c2b02eda955284ed8f0575f10d18015e8205',
  recoveryPlanFileSha256:
    '895c0f13a05fec92e098e5e7f30e6f099034fbc70a2fd3980d0abdeb4e76a574',
  activeAuditFileSha256:
    '6918fb458093f9212d46bb9e80bd5b078c6b3c370d471bab6dfd6a3bbe51defa',
  counts: { verdicts: 119, completed: 119, locks: 160, revalidations: 41 },
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertDirectory(path: string): Promise<number> {
  const state = await lstat(path)
  if (state.isSymbolicLink() || !state.isDirectory())
    throw new Error('directory-shape')
  return state.dev
}

async function assertRegularFile(path: string): Promise<void> {
  const state = await lstat(path)
  if (state.isSymbolicLink() || !state.isFile()) throw new Error('file-shape')
}

async function assertSameDevice(
  paths: readonly string[],
  directoryDevice?: (path: string) => Promise<number>,
): Promise<void> {
  await Promise.all(paths.map(assertDirectory))
  const devices = await Promise.all(
    paths.map((path) =>
      directoryDevice
        ? directoryDevice(path)
        : lstat(path).then(({ dev }) => dev),
    ),
  )
  if (new Set(devices).size !== 1) throw new Error('cross-device')
}

async function assertVacant(path: string): Promise<void> {
  if (await exists(path)) throw new Error('destination-exists')
}

async function inventory(directory: string): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = []
  for (const entry of await readdir(directory, { recursive: true })) {
    const path = join(directory, entry)
    const state = await lstat(path)
    if (state.isSymbolicLink()) throw new Error('symlink')
    if (state.isDirectory()) continue
    if (!state.isFile()) throw new Error('non-regular')
    const bytes = await readFile(path)
    rows.push({
      path: relative(directory, path),
      bytes: bytes.length,
      sha256: sha256(bytes),
    })
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path))
}

function inventorySha256(rows: readonly InventoryRow[]): string {
  return sha256(JSON.stringify(rows))
}

function countPrefix(rows: readonly InventoryRow[], prefix: string): number {
  return rows.filter(({ path }) => path.startsWith(`${prefix}/`)).length
}

function targetPaths(manifest: string) {
  return [
    `verdicts/${manifest}.json`,
    `completed/${manifest}.json`,
    `locks/${manifest}.locked.json`,
  ] as const
}

function tupleSha256(rows: readonly InventoryRow[], manifest: string): string {
  const tuple = targetPaths(manifest).map((path) => {
    const row = rows.find((candidate) => candidate.path === path)
    if (!row) throw new Error('target-tuple')
    return { kind: path.split('/')[0], bytes: row.bytes, sha256: row.sha256 }
  })
  return sha256(JSON.stringify(tuple))
}

function assertSourceInventory(
  rows: readonly InventoryRow[],
  targetManifest: string,
  expected: Expectations,
): void {
  if (
    rows.length !== 441 ||
    inventorySha256(rows) !== expected.sourceInventorySha256 ||
    countPrefix(rows, 'verdicts') !== expected.counts.verdicts ||
    countPrefix(rows, 'completed') !== expected.counts.completed ||
    countPrefix(rows, 'locks') !== expected.counts.locks ||
    countPrefix(rows, 'revalidations') !== expected.counts.revalidations ||
    rows.find(({ path }) => path === 'recovery-plan.json')?.sha256 !==
      expected.recoveryPlanFileSha256 ||
    rows.find(({ path }) => path === 'active-collision-audit.v1.json')
      ?.sha256 !== expected.activeAuditFileSha256 ||
    tupleSha256(rows, targetManifest) !== expected.targetTupleSha256
  )
    throw new Error('source-inventory')
}

function assertStagedInventory(
  source: readonly InventoryRow[],
  staged: readonly InventoryRow[],
  targetManifest: string,
): void {
  const removed = new Set([
    ...targetPaths(targetManifest),
    'active-collision-audit.v1.json',
  ])
  const expected = source.filter(({ path }) => !removed.has(path))
  if (
    staged.length !== 437 ||
    countPrefix(staged, 'verdicts') !== 118 ||
    countPrefix(staged, 'completed') !== 118 ||
    countPrefix(staged, 'locks') !== 159 ||
    countPrefix(staged, 'revalidations') !== 41 ||
    staged.some(({ path }) => removed.has(path)) ||
    JSON.stringify(staged) !== JSON.stringify(expected)
  )
    throw new Error('staged-inventory')
}

async function publishFileCreateNew(
  staging: string,
  destination: string,
  text: string,
  afterLink?: () => Promise<void>,
): Promise<void> {
  let staged = false
  let published = false
  try {
    await writeFile(staging, text, { flag: 'wx' })
    staged = true
    await link(staging, destination)
    published = true
    await afterLink?.()
    await unlink(staging)
    staged = false
  } catch (error) {
    if (published) await unlink(destination).catch(() => undefined)
    if (staged) await unlink(staging).catch(() => undefined)
    throw error
  }
}

function parseJournal(value: unknown): Journal {
  const journal = journalSchema.parse(value)
  const { journalSha256, ...core } = journal
  if (
    inventorySha256(journal.sourceInventory) !==
      journal.sourceInventorySha256 ||
    inventorySha256(journal.stagedInventory) !==
      journal.stagedInventorySha256 ||
    sha256(JSON.stringify(core)) !== journalSha256
  )
    throw new Error('journal-hash')
  return journal
}

async function readJournal(path: string): Promise<Journal> {
  await assertRegularFile(path)
  return parseJournal(JSON.parse(await readFile(path, 'utf8')) as unknown)
}

function assertExpectedJournal(journal: Journal, expected: Expectations): void {
  if (
    journal.docketFileSha256 !== expected.docketFileSha256 ||
    journal.docketAuditSha256 !== expected.docketAuditSha256 ||
    journal.sourceInventorySha256 !== expected.sourceInventorySha256 ||
    journal.targetTupleSha256 !== expected.targetTupleSha256
  )
    throw new Error('journal-authority')
}

async function assertInventoryEquals(
  directory: string,
  expected: readonly InventoryRow[],
): Promise<void> {
  if (JSON.stringify(await inventory(directory)) !== JSON.stringify(expected))
    throw new Error('inventory-changed')
}

async function readPinnedDocket(
  path: string,
  expected: Expectations,
): Promise<z.infer<typeof mismatchSchema>> {
  await assertRegularFile(path)
  const docketText = await readFile(path, 'utf8')
  const docket = docketSchema.parse(JSON.parse(docketText) as unknown)
  const { auditSha256, ...docketCore } = docket
  if (
    sha256(docketText) !== expected.docketFileSha256 ||
    auditSha256 !== expected.docketAuditSha256 ||
    sha256(JSON.stringify(docketCore)) !== auditSha256
  )
    throw new Error('docket-authority')
  return docket.mismatches[0]!
}

function assertJournalAuthority(
  journal: Journal,
  target: z.infer<typeof mismatchSchema>,
  expected: Expectations,
): void {
  assertExpectedJournal(journal, expected)
  if (
    journal.targetManifest !== target.manifest ||
    journal.targetQid !== target.qid
  )
    throw new Error('journal-target')
  assertSourceInventory(journal.sourceInventory, target.manifest, expected)
  assertStagedInventory(
    journal.sourceInventory,
    journal.stagedInventory,
    target.manifest,
  )
}

async function copySourceToOwnedStage(
  source: string,
  stage: string,
  copyEntry: (source: string, destination: string) => Promise<void>,
): Promise<void> {
  await mkdir(stage, { recursive: false })
  try {
    for (const entry of (await readdir(source)).sort())
      await copyEntry(join(source, entry), join(stage, entry))
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}

async function resumeTransition(
  paths: CandidateYearCorrectionPaths,
  journal: Journal,
  hooks: Hooks,
): Promise<void> {
  const state = {
    source: await exists(paths.source),
    stage: await exists(paths.stage),
    quarantine: await exists(paths.quarantine),
  }
  if (state.source && state.stage && !state.quarantine) {
    await assertSameDevice(
      [paths.source, paths.stage, dirname(paths.quarantine)],
      hooks.directoryDevice,
    )
    await assertInventoryEquals(paths.source, journal.sourceInventory)
    await assertInventoryEquals(paths.stage, journal.stagedInventory)
    await hooks.beforeQuarantineRename?.()
    await assertVacant(paths.quarantine)
    await rename(paths.source, paths.quarantine)
    await hooks.afterQuarantine?.()
    await hooks.beforePromotionRename?.()
    await assertVacant(paths.source)
    await rename(paths.stage, paths.source)
    await hooks.afterPromotion?.()
  } else if (!state.source && state.stage && state.quarantine) {
    await assertSameDevice(
      [dirname(paths.source), paths.stage, paths.quarantine],
      hooks.directoryDevice,
    )
    await assertInventoryEquals(paths.quarantine, journal.sourceInventory)
    await assertInventoryEquals(paths.stage, journal.stagedInventory)
    await hooks.beforePromotionRename?.()
    await assertVacant(paths.source)
    await rename(paths.stage, paths.source)
    await hooks.afterPromotion?.()
  } else if (!(state.source && !state.stage && state.quarantine)) {
    throw new Error('unexpected-transition-state')
  } else {
    await assertSameDevice(
      [dirname(paths.source), paths.source, paths.quarantine],
      hooks.directoryDevice,
    )
  }
  await assertInventoryEquals(paths.source, journal.stagedInventory)
  await assertInventoryEquals(paths.quarantine, journal.sourceInventory)
  await unlink(paths.journal)
}

export async function runCandidateYearCorrection(
  paths: CandidateYearCorrectionPaths,
  expected: Expectations,
  hooks: Hooks = {},
): Promise<Readonly<{ sourceFiles: number; quarantinedFiles: number }>> {
  await assertDirectory(paths.reviewRoot)
  await assertDirectory(dirname(paths.source))
  await assertDirectory(dirname(paths.quarantine))
  if (await exists(paths.journalStage)) throw new Error('journal-staging')
  if (await exists(paths.finalized)) throw new Error('finalized')
  if (await exists(paths.finalizeStage)) throw new Error('finalize-staging')
  const target = await readPinnedDocket(paths.docket, expected)
  if (await exists(paths.journal)) {
    const journal = await readJournal(paths.journal)
    assertJournalAuthority(journal, target, expected)
    await resumeTransition(paths, journal, hooks)
    return {
      sourceFiles: journal.stagedInventory.length,
      quarantinedFiles: journal.sourceInventory.length,
    }
  }
  if (await exists(paths.stage)) throw new Error('correction-staging')
  if (await exists(paths.quarantine)) throw new Error('correction-quarantine')

  await assertDirectory(paths.source)
  const sourceInventory = await inventory(paths.source)
  assertSourceInventory(sourceInventory, target.manifest, expected)

  const copyEntry =
    hooks.copyEntry ??
    ((source: string, destination: string) =>
      cp(source, destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
        preserveTimestamps: true,
      }))
  await copySourceToOwnedStage(paths.source, paths.stage, copyEntry)
  try {
    for (const path of [
      ...targetPaths(target.manifest),
      'active-collision-audit.v1.json',
    ])
      await unlink(join(paths.stage, path))
    const stagedInventory = await inventory(paths.stage)
    assertStagedInventory(sourceInventory, stagedInventory, target.manifest)
    await assertInventoryEquals(paths.source, sourceInventory)
    await assertSameDevice(
      [paths.source, paths.stage, dirname(paths.quarantine)],
      hooks.directoryDevice,
    )
    const core = journalCoreSchema.parse({
      schema: 'zedarchive.anime-v2-year-review-correction-journal',
      version: 1,
      docketFileSha256: expected.docketFileSha256,
      docketAuditSha256: expected.docketAuditSha256,
      targetManifest: target.manifest,
      targetQid: target.qid,
      sourceInventory,
      sourceInventorySha256: inventorySha256(sourceInventory),
      stagedInventory,
      stagedInventorySha256: inventorySha256(stagedInventory),
      targetTupleSha256: tupleSha256(sourceInventory, target.manifest),
    })
    const journal = parseJournal({
      ...core,
      journalSha256: sha256(JSON.stringify(core)),
    })
    await publishFileCreateNew(
      paths.journalStage,
      paths.journal,
      `${JSON.stringify(journal, null, 2)}\n`,
      hooks.afterJournalLink,
    )
    await hooks.afterJournal?.()
    await resumeTransition(paths, journal, hooks)
    return {
      sourceFiles: stagedInventory.length,
      quarantinedFiles: sourceInventory.length,
    }
  } catch (error) {
    if (!(await exists(paths.journal)))
      await rm(paths.stage, { recursive: true, force: true })
    throw error
  }
}

export function parseCandidateYearCorrectionArguments(args: readonly string[]) {
  if (
    args.length !== 2 ||
    args[0] !== 'apply' ||
    args[1] !== '--confirm-decision-086'
  )
    throw new Error(
      'Usage: correct-anime-v2-candidate-year-review apply --confirm-decision-086',
    )
  return { mode: 'apply' as const }
}

async function runLive(args: readonly string[]): Promise<void> {
  parseCandidateYearCorrectionArguments(args)
  const result = await runCandidateYearCorrection(livePaths, liveExpectations)
  console.log(
    JSON.stringify({
      schema: 'zedarchive.anime-v2-year-review-correction-terminal',
      version: 1,
      outcome: 'completed',
      activeFiles: result.sourceFiles,
      quarantinedFiles: result.quarantinedFiles,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runLive(process.argv.slice(2)).catch(() => {
    console.error(
      JSON.stringify({
        schema: 'zedarchive.anime-v2-year-review-correction-terminal',
        version: 1,
        outcome: 'stopped',
      }),
    )
    process.exitCode = 1
  })
