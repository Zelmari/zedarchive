import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const moduleExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const sourceExtensions = new Set([
  ...moduleExtensions,
  '.css',
  '.html',
  '.json',
  '.less',
  '.mdx',
  '.sass',
  '.scss',
])
const nextImageImportPattern =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)['"]next\/image['"]/u
const nextImageEndpointName = '/_next/image'

const allowedNextImageEndpointReferences = new Set([
  'next.config.ts',
  'src/config/next-config.test.ts',
  'src/config/security-headers.test.ts',
  'src/config/security-headers.ts',
  'src/proxy.test.ts',
  'src/proxy.ts',
  'src/test/next-sharp-containment-contract.test.ts',
  'tests/browser-release-critical/fixtures/response-policy.test.ts',
  'tests/browser-release-critical/fixtures/response-policy.ts',
])

type PackageJson = Readonly<{
  dependencies?: Readonly<Record<string, string>>
  devDependencies?: Readonly<Record<string, string>>
  optionalDependencies?: Readonly<Record<string, string>>
  peerDependencies?: Readonly<Record<string, string>>
  overrides?: Readonly<Record<string, unknown>>
}>

type StableNextMetadata = Readonly<{
  version: string
  optionalDependencies: Readonly<{ sharp: string }>
}>

type Semver = Readonly<{
  major: number
  minor: number
  patch: number
}>

function parseStableSemver(version: string): Semver {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version)
  if (!match) {
    throw new Error('Stable Next metadata contains an unrecognized version')
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function parseCaretRange(range: string): Semver {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/u.exec(range)
  if (!match) {
    throw new Error('Stable Next metadata contains an unrecognized Sharp range')
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function compareSemver(left: Semver, right: Semver): number {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  )
}

function caretRangeAccepts(range: string, candidate: Semver): boolean {
  const lowerBound = parseCaretRange(range)
  const upperBound =
    lowerBound.major > 0
      ? { major: lowerBound.major + 1, minor: 0, patch: 0 }
      : lowerBound.minor > 0
        ? { major: 0, minor: lowerBound.minor + 1, patch: 0 }
        : { major: 0, minor: 0, patch: lowerBound.patch + 1 }

  return (
    compareSemver(candidate, lowerBound) >= 0 &&
    compareSemver(candidate, upperBound) < 0
  )
}

function selectContainmentDisposition(
  metadata: StableNextMetadata,
): 'retain-containment' | 'remove-containment' {
  parseStableSemver(metadata.version)
  const sharpRange = metadata.optionalDependencies.sharp
  const patchedSharp = { major: 0, minor: 35, patch: 3 }

  if (caretRangeAccepts(sharpRange, patchedSharp)) {
    return 'remove-containment'
  }

  if (metadata.version === '16.2.12' && sharpRange === '^0.34.5') {
    return 'retain-containment'
  }

  throw new Error('Stable Next metadata does not match an approved M44 path')
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(path)

      const extension = entry.name.slice(entry.name.lastIndexOf('.'))
      return sourceExtensions.has(extension) ? [path] : []
    }),
  )

  return files.flat()
}

describe('Next and Sharp containment contract', () => {
  it('keeps the exact temporary dependency containment and no direct Sharp dependency', async () => {
    const packageJson = JSON.parse(
      await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as PackageJson

    expect(packageJson.dependencies?.next).toBe('16.2.12')
    expect(packageJson.devDependencies?.['eslint-config-next']).toBe('16.2.12')
    expect({
      dependency: packageJson.dependencies?.sharp,
      development: packageJson.devDependencies?.sharp,
      optional: packageJson.optionalDependencies?.sharp,
      peer: packageJson.peerDependencies?.sharp,
    }).toEqual({
      dependency: undefined,
      development: undefined,
      optional: undefined,
      peer: undefined,
    })
    expect(packageJson.overrides).toEqual({
      postcss: '$postcss',
      'next@16.2.12': {
        sharp: '0.35.3',
      },
    })
  })

  it('keeps the built-in image optimizer globally disabled without a loader', () => {
    expect(nextConfig.images).toEqual({
      unoptimized: true,
    })
  })

  it('finds no image component import or optimizer consumer outside the exact M44 policy allowlist', async () => {
    const sourceFiles = (
      await Promise.all(
        ['src', 'tests'].map((directory) =>
          collectSourceFiles(join(repositoryRoot, directory)),
        ),
      )
    )
      .flat()
      .concat(join(repositoryRoot, 'next.config.ts'))

    const unexpectedReferences: string[] = []
    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8')
      const sourceName = relative(repositoryRoot, sourceFile).replaceAll(
        '\\',
        '/',
      )

      if (
        moduleExtensions.has(extname(sourceFile)) &&
        nextImageImportPattern.test(source)
      ) {
        if (sourceName !== 'src/test/next-sharp-containment-contract.test.ts') {
          unexpectedReferences.push(sourceName)
        }
      }

      if (
        source.includes(nextImageEndpointName) &&
        !allowedNextImageEndpointReferences.has(sourceName)
      ) {
        unexpectedReferences.push(sourceName)
      }
    }

    expect([...new Set(unexpectedReferences)].sort()).toEqual([])
  })

  it('retains containment only for the exact approved stable metadata fixture', () => {
    expect(
      selectContainmentDisposition({
        version: '16.2.12',
        optionalDependencies: { sharp: '^0.34.5' },
      }),
    ).toBe('retain-containment')
  })

  it('requires containment removal once stable Next accepts patched Sharp', () => {
    expect(
      selectContainmentDisposition({
        version: '16.2.13',
        optionalDependencies: { sharp: '^0.35.0' },
      }),
    ).toBe('remove-containment')
  })

  it.each([
    {
      version: '16.3.0-canary.1',
      optionalDependencies: { sharp: '^0.35.0' },
    },
    {
      version: '16.2.13',
      optionalDependencies: { sharp: '>=0.35.0' },
    },
    {
      version: '16.2.13',
      optionalDependencies: { sharp: '^0.34.5' },
    },
  ])('fails closed for unrecognized stable metadata: $version', (metadata) => {
    expect(() => selectContainmentDisposition(metadata)).toThrow()
  })
})
