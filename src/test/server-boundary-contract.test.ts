import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const databaseClientPath = 'src/server/database/client.ts'
const publicEnvironmentNegativeFixture = 'src/config/email-environment.test.ts'
const publicEnvironmentPrefix = ['NEXT', 'PUBLIC'].join('_') + '_'
const excludedSourceDirectories = new Set([
  '.git',
  '.cursor',
  '.local',
  '.next',
  'coverage',
  'data',
  'dist',
  'docs',
  'drizzle',
  'node_modules',
  'playwright-report',
])

function sourcePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      if (
        excludedSourceDirectories.has(entry.name) ||
        entry.name.startsWith('test-results')
      ) {
        return []
      }
      return sourcePaths(path)
    }
    return /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : []
  })
}

describe('server boundary source contract', () => {
  it('keeps the database client marked server-only without importing it into this client-safe check', () => {
    const source = readFileSync(
      resolve(repositoryRoot, databaseClientPath),
      'utf8',
    )

    expect(source.startsWith("import 'server-only'\n")).toBe(true)
  })

  it('forbids browser-exposed environment names outside the explicit negative fixture', () => {
    const violations = sourcePaths(repositoryRoot)
      .map((path) => ({
        path: relative(repositoryRoot, path),
        source: readFileSync(path, 'utf8'),
      }))
      .filter(
        ({ path, source }) =>
          path !== publicEnvironmentNegativeFixture &&
          source.includes(publicEnvironmentPrefix),
      )
      .map(({ path }) => path)

    expect(violations).toEqual([])
  })
})
