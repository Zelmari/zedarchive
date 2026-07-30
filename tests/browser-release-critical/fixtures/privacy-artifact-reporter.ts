import { lstatSync, rmdirSync, unlinkSync } from 'node:fs'
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { releaseCriticalDiagnosticDirectory } from './release-critical-constants'

const outputRoot = path.resolve(process.cwd(), 'test-results-release-critical')
const allowlistedFiles = new Set(
  [
    'public-catalogue-core.json',
    'account-and-add-core.json',
    'archive-tracking-lifecycle.json',
    'archive-backup-lifecycle.json',
    'account-recovery-deletion-lifecycle.json',
  ].map((filename) =>
    path.resolve(process.cwd(), releaseCriticalDiagnosticDirectory, filename),
  ),
)

export function isAllowlistedReleaseCriticalArtifact(candidate: string) {
  return allowlistedFiles.has(path.resolve(candidate))
}

function isInsideOutputRoot(candidate: string) {
  const relative = path.relative(outputRoot, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function removeAttachment(candidate: string) {
  const resolved = path.resolve(candidate)
  if (
    !isInsideOutputRoot(resolved) ||
    isAllowlistedReleaseCriticalArtifact(resolved)
  ) {
    return
  }

  try {
    const stat = lstatSync(resolved)
    if (stat.isDirectory()) rmdirSync(resolved)
    else unlinkSync(resolved)
  } catch {
    // A missing attachment is already compliant with the deny-by-default rule.
  }
}

async function scrubDirectory(directory: string): Promise<boolean> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return false
  }

  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    const stat = await lstat(candidate)
    if (stat.isDirectory()) {
      const empty = await scrubDirectory(candidate)
      if (empty) await rmdir(candidate)
    } else if (!isAllowlistedReleaseCriticalArtifact(candidate)) {
      await unlink(candidate)
    }
  }

  return (await readdir(directory)).length === 0
}

export default class PrivacyArtifactReporter implements Reporter {
  onBegin() {
    for (const candidate of allowlistedFiles) {
      try {
        unlinkSync(candidate)
      } catch {
        // A missing prior manifest is the expected clean-run state.
      }
    }
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    for (const attachment of result.attachments) {
      if (attachment.path !== undefined) removeAttachment(attachment.path)
    }
  }

  async onExit() {
    await scrubDirectory(outputRoot)
  }
}
