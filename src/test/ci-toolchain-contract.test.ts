import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/ci.yml'),
  'utf8',
)

function occurrences(pattern: RegExp): number {
  return workflow.match(pattern)?.length ?? 0
}

describe('CI toolchain contract', () => {
  it('keeps setup-node from invoking its bundled npm before Corepack selects the pin', () => {
    expect(occurrences(/uses: actions\/setup-node@/gu)).toBe(4)
    expect(occurrences(/package-manager-cache: false/gu)).toBe(4)
    expect(workflow).not.toMatch(/^\s+cache:\s*npm\s*$/mu)
    expect(workflow).not.toMatch(/^\s+cache-dependency-path:/mu)
  })

  it('asserts and installs with the integrity-pinned npm in every job', () => {
    expect(
      occurrences(/corepack npm --version \| grep -Fx '11\.18\.0'/gu),
    ).toBe(4)
    expect(occurrences(/run: corepack npm ci/gu)).toBe(4)
  })
})
