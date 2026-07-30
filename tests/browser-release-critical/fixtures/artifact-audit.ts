import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateReleaseCriticalDiagnostic } from './diagnostic-manifest'

const maximumManifestBytes = 32 * 1024
const allowedRelativePaths = new Set([
  'diagnostics/public-catalogue-core.json',
  'diagnostics/account-and-add-core.json',
  'diagnostics/archive-tracking-lifecycle.json',
  'diagnostics/archive-backup-lifecycle.json',
  'diagnostics/account-recovery-deletion-lifecycle.json',
])
const expectedTitleByRelativePath = {
  'diagnostics/public-catalogue-core.json': 'public catalogue core',
  'diagnostics/account-and-add-core.json': 'account and add core',
  'diagnostics/archive-tracking-lifecycle.json': 'archive tracking lifecycle',
  'diagnostics/archive-backup-lifecycle.json': 'archive backup lifecycle',
  'diagnostics/account-recovery-deletion-lifecycle.json':
    'account recovery and deletion lifecycle',
} as const

const providerResetCredentialPathPattern =
  /\/api\/auth\/reset-password\/[^/?#\s<>"']+/iu

const prohibitedContentPatterns = [
  /#token=/iu,
  /\/verify-email\?/iu,
  /\bm41-[a-f0-9]{32}@example\.test\b/iu,
  /\bM41[a-f0-9]{14}\b/u,
  /\bM41-[a-f0-9-]{36}-[a-f0-9-]{36}\b/iu,
  /\bm42-[a-z0-9-]+@example\.test\b/iu,
  /\bM42(?:Backup)?[A-Z][a-f0-9]{12,}\b/u,
  /\bM42-[a-f0-9-]{36}-[a-f0-9-]{36}\b/iu,
  /\/(?:reset-password|account\/deletion)\?(?:token|code)=/iu,
  providerResetCredentialPathPattern,
  /\b\d{8}\b/u,
  /\b(?:body|cookie|credential|error|header|password|stack)\b/iu,
] as const

function fixedAuditError(): TypeError {
  return new TypeError('M41 artifact audit rejected output')
}

function normalizedRelativePath(root: string, candidate: string) {
  return path.relative(root, candidate).split(path.sep).join('/')
}

export function containsProhibitedReleaseCriticalContent(content: string) {
  return prohibitedContentPatterns.some((pattern) => pattern.test(content))
}

export function containsProviderResetCredentialPath(content: string) {
  return providerResetCredentialPathPattern.test(content)
}

export async function auditReleaseCriticalArtifacts(
  outputRoot = path.resolve(process.cwd(), 'test-results-release-critical'),
) {
  const root = path.resolve(outputRoot)
  let manifestCount = 0

  async function inspectDirectory(directory: string): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      throw fixedAuditError()
    }

    for (const entry of entries) {
      const candidate = path.join(directory, entry.name)
      const relative = normalizedRelativePath(root, candidate)

      if (entry.isSymbolicLink()) {
        throw fixedAuditError()
      }

      if (entry.isDirectory()) {
        if (relative !== 'diagnostics') {
          throw fixedAuditError()
        }
        await inspectDirectory(candidate)
        continue
      }

      if (!entry.isFile() || !allowedRelativePaths.has(relative)) {
        throw fixedAuditError()
      }

      const content = await readFile(candidate, 'utf8')
      if (
        Buffer.byteLength(content) > maximumManifestBytes ||
        containsProhibitedReleaseCriticalContent(content)
      ) {
        throw fixedAuditError()
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw fixedAuditError()
      }

      try {
        const manifest = validateReleaseCriticalDiagnostic(parsed)
        if (
          manifest.testTitle !==
          expectedTitleByRelativePath[
            relative as keyof typeof expectedTitleByRelativePath
          ]
        ) {
          throw fixedAuditError()
        }
      } catch {
        throw fixedAuditError()
      }
      manifestCount += 1
    }
  }

  await inspectDirectory(root)
  if (manifestCount < 1 || manifestCount > allowedRelativePaths.size) {
    throw fixedAuditError()
  }

  return { manifestCount } as const
}

async function runCli() {
  if (process.argv.length !== 2) {
    throw fixedAuditError()
  }
  await auditReleaseCriticalArtifacts()
  process.stdout.write('M41 artifact audit passed.\n')
}

const invokedPath = process.argv[1]
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  void runCli().catch(() => {
    process.stderr.write('M41 artifact audit failed.\n')
    process.exitCode = 1
  })
}
