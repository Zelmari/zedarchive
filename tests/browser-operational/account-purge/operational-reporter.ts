import { lstat, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

const outputRoot = path.resolve(
  process.cwd(),
  'test-results-account-purge-operational',
)
const expectedTitle = 'account purge operational'

export function isInsideOperationalOutputRoot(
  outputRoot: string,
  candidate: string,
) {
  const relative = path.relative(
    path.resolve(outputRoot),
    path.resolve(candidate),
  )
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function scrubOutput(directory = outputRoot): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    const stat = await lstat(candidate)
    if (stat.isDirectory()) await scrubOutput(candidate)
    await rm(candidate, { force: true, recursive: stat.isDirectory() })
  }
}

async function removeOwnedAttachment(candidate: string): Promise<void> {
  if (!isInsideOperationalOutputRoot(outputRoot, candidate)) {
    throw new TypeError('M42 account-purge reporter rejected attachment')
  }
  try {
    const stat = await lstat(candidate)
    await rm(candidate, { force: true, recursive: stat.isDirectory() })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function safeStatus(status: TestResult['status']) {
  return ['passed', 'failed', 'skipped', 'timedOut', 'interrupted'].includes(
    status,
  )
    ? status
    : 'failed'
}

export default class AccountPurgeOperationalReporter implements Reporter {
  #results: Array<
    Readonly<{ durationMs: number; status: string; title: string }>
  > = []
  #noncompliantAttachment = false

  async onBegin() {
    await scrubOutput()
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    for (const attachment of result.attachments) {
      if (attachment.path === undefined) continue
      try {
        await removeOwnedAttachment(attachment.path)
      } catch {
        this.#noncompliantAttachment = true
      }
    }
    this.#results.push({
      durationMs: Math.max(0, Math.floor(result.duration)),
      status: safeStatus(result.status),
      title: test.title === expectedTitle ? expectedTitle : 'unexpected test',
    })
  }

  async onEnd() {
    if (this.#noncompliantAttachment) {
      await scrubOutput()
      throw new TypeError('M42 account-purge reporter rejected attachment')
    }
    for (const result of this.#results) {
      process.stdout.write(
        `${JSON.stringify({
          checkpoints:
            result.status === 'passed'
              ? {
                  duePurged: true,
                  idempotent: true,
                  notDuePreserved: true,
                  unauthorizedRejected: true,
                }
              : {},
          durationMs: result.durationMs,
          status: result.status,
          title: result.title,
        })}\n`,
      )
    }
  }

  async onExit() {
    await scrubOutput()
  }
}
