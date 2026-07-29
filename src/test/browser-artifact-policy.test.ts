import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const browserTestDirectory = resolve(repositoryRoot, 'tests/browser')
const publicScreenshotSpec = 'public-sign-in.smoke.spec.ts'

function readRepositoryFile(path: string) {
  return readFileSync(resolve(repositoryRoot, path), 'utf8')
}

function screenshotModes(source: string) {
  return Array.from(
    source.matchAll(/\bscreenshot\s*:\s*['"]([^'"]+)['"]/g),
    (match) => match[1],
  )
}

function browserSpecPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)

    if (entry.isDirectory()) return browserSpecPaths(entryPath)
    return entry.name.endsWith('.spec.ts') ? [entryPath] : []
  })
}

describe('extended browser artifact policy', () => {
  it('disables screenshots by default in the extended Playwright config', () => {
    expect(screenshotModes(readRepositoryFile('playwright.config.ts'))).toEqual(
      ['off'],
    )
  })

  it('allows failure screenshots only in the audited public sign-in smoke spec', () => {
    const browserSpecs = browserSpecPaths(browserTestDirectory).sort()

    const screenshotOptIns = browserSpecs.flatMap((filePath) =>
      screenshotModes(readFileSync(filePath, 'utf8'))
        .filter((mode) => mode !== 'off')
        .map((mode) => ({
          fileName: relative(browserTestDirectory, filePath)
            .split(sep)
            .join('/'),
          mode,
        })),
    )

    expect(screenshotOptIns).toEqual([
      {
        fileName: publicScreenshotSpec,
        mode: 'only-on-failure',
      },
    ])
  })

  it('keeps the screenshot-enabled smoke spec unauthenticated and identity-free', () => {
    const publicSmokeSource = readFileSync(
      resolve(browserTestDirectory, publicScreenshotSpec),
      'utf8',
    )
    const sourceWithoutConsoleTypeChecks = publicSmokeSource.replaceAll(
      'message.type()',
      '',
    )

    expect(sourceWithoutConsoleTypeChecks).not.toMatch(
      /\.(?:fill|type|pressSequentially)\(|storageState|\/api\/auth|signIn\(|\.request\./,
    )
  })
})
