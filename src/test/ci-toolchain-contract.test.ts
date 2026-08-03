import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/ci.yml'),
  'utf8',
)
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { scripts: Record<string, string> }

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

  it('validates every materialized catalogue release after lifecycle policy and before quality checks', () => {
    const lifecyclePolicy = workflow.indexOf(
      'run: corepack npm run verify:install-script-policy',
    )
    const releaseCheck = workflow.indexOf(
      'run: corepack npm run catalogue:release:check',
    )
    const formatting = workflow.indexOf('run: corepack npm run format:check')

    expect(
      occurrences(/run: corepack npm run catalogue:release:check$/gmu),
    ).toBe(1)
    expect(lifecyclePolicy).toBeGreaterThanOrEqual(0)
    expect(releaseCheck).toBeGreaterThan(lifecyclePolicy)
    expect(formatting).toBeGreaterThan(releaseCheck)
    expect(workflow).not.toMatch(
      /catalogue:release:check\s+--release\s+anime-v[0-9]+/gu,
    )
  })

  it('checks predecessor review inputs without granting CI live acquisition authority', () => {
    const releaseCheck = workflow.indexOf(
      'run: corepack npm run catalogue:release:check',
    )
    const predecessorCheck = workflow.indexOf(
      'run: corepack npm run catalogue:review:predecessors:check',
    )
    const formatting = workflow.indexOf('run: corepack npm run format:check')

    expect(
      occurrences(
        /run: corepack npm run catalogue:review:predecessors:check$/gmu,
      ),
    ).toBe(1)
    expect(predecessorCheck).toBeGreaterThan(releaseCheck)
    expect(formatting).toBeGreaterThan(predecessorCheck)
    expect(workflow).not.toContain('catalogue:review:predecessors prepare')
    expect(workflow).not.toContain('--confirm-wikimedia-live')
    expect(packageJson.scripts['catalogue:review:predecessors']).toBe(
      'tsx scripts/review-anime-v2-predecessors.ts',
    )
    expect(packageJson.scripts['catalogue:review:predecessors:check']).toBe(
      'tsx scripts/review-anime-v2-predecessors.ts check',
    )
  })
})
