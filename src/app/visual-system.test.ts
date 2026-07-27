import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const globalsPath = fileURLToPath(new URL('./globals.css', import.meta.url))
const iconPath = fileURLToPath(new URL('./icon.svg', import.meta.url))

const requiredColors = {
  canvas: '#f7f5f0',
  surface: '#ffffff',
  'surface-subtle': '#f0ede6',
  text: '#242321',
  'text-muted': '#5b5c61',
  'border-required': '#85837c',
  'border-decorative': '#d6d1c7',
  accent: '#3346a8',
  'accent-hover': '#29398b',
  'accent-active': '#202e70',
  'accent-soft': '#e8ebfa',
  'on-accent': '#ffffff',
  destructive: '#b4232e',
  'destructive-hover': '#8f1d26',
  'destructive-active': '#76151c',
  'on-destructive': '#ffffff',
  'error-surface': '#fbecee',
  success: '#26734d',
  'success-surface': '#e9f4ee',
  warning: '#765a00',
  'warning-surface': '#f8f0d8',
  information: '#365a82',
  'information-surface': '#eaf1f8',
  'disabled-text': '#64656a',
  'disabled-surface': '#ece9e2',
  'title-tile': '#ded9cf',
  'title-tile-text': '#30353b',
} as const

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((part) => Number.parseInt(part, 16) / 255)

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an opaque six-digit hex colour, received ${hex}`)
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )

  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a)

  return (lighter + 0.05) / (darker + 0.05)
}

function extractRootTokenBlock(css: string) {
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]

  if (!root) {
    throw new Error('Expected canonical :root token source.')
  }

  return root
}

function extractRootColorTokens(css: string) {
  const root = extractRootTokenBlock(css)

  return Object.fromEntries(
    [...root.matchAll(/--za-color-([\w-]+):\s*(#[\da-f]{6});/gi)].map(
      ([, name, value]) => [name, value.toLowerCase()],
    ),
  )
}

describe('visual system contract', () => {
  it('defines the complete opaque semantic colour inventory exactly once', async () => {
    const css = await readFile(globalsPath, 'utf8')
    const root = extractRootTokenBlock(css)

    const declarations = [
      ...root.matchAll(/--za-color-([\w-]+):\s*(#[\da-f]{6});/gi),
    ]

    expect(declarations).toHaveLength(Object.keys(requiredColors).length)
    for (const role of Object.keys(requiredColors)) {
      expect(
        declarations.filter(([, declaredRole]) => declaredRole === role),
      ).toHaveLength(1)
    }

    const colors = extractRootColorTokens(css)

    expect(colors).toEqual(requiredColors)
  })

  it('keeps all required colour pairings accessible', async () => {
    const colors = extractRootColorTokens(await readFile(globalsPath, 'utf8'))
    const ratio = (
      foreground: keyof typeof colors,
      background: keyof typeof colors,
    ) => contrast(colors[foreground], colors[background])

    for (const background of ['canvas', 'surface'] as const) {
      expect(ratio('text', background)).toBeGreaterThanOrEqual(4.5)
      expect(ratio('text-muted', background)).toBeGreaterThanOrEqual(4.5)
      expect(ratio('accent', background)).toBeGreaterThanOrEqual(4.5)
      expect(ratio('border-required', background)).toBeGreaterThanOrEqual(3)
    }

    expect(ratio('accent', 'accent-soft')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-accent', 'accent')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-accent', 'accent-hover')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-accent', 'accent-active')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-destructive', 'destructive')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-destructive', 'destructive-hover')).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(
      ratio('on-destructive', 'destructive-active'),
    ).toBeGreaterThanOrEqual(4.5)

    for (const [foreground, background] of [
      ['destructive', 'error-surface'],
      ['success', 'success-surface'],
      ['warning', 'warning-surface'],
      ['information', 'information-surface'],
      ['disabled-text', 'disabled-surface'],
      ['title-tile-text', 'title-tile'],
      ['destructive', 'surface'],
      ['accent', 'surface'],
    ] as const) {
      expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5)
    }

    expect(ratio('border-required', 'disabled-surface')).toBeGreaterThanOrEqual(
      3,
    )
  })

  it('keeps default, hover, and active interactive fills distinct', async () => {
    const colors = extractRootColorTokens(await readFile(globalsPath, 'utf8'))

    expect(
      new Set([colors.accent, colors['accent-hover'], colors['accent-active']]),
    ).toHaveLength(3)
    expect(
      new Set([
        colors.destructive,
        colors['destructive-hover'],
        colors['destructive-active'],
      ]),
    ).toHaveLength(3)
  })

  it('maps semantic Tailwind utilities to the canonical source roles', async () => {
    const css = await readFile(globalsPath, 'utf8')

    for (const [themeName, sourceName] of [
      ['--color-canvas', '--za-color-canvas'],
      ['--color-surface', '--za-color-surface'],
      ['--color-ink', '--za-color-text'],
      ['--color-control', '--za-color-border-required'],
      ['--color-accent', '--za-color-accent'],
      ['--color-destructive', '--za-color-destructive'],
      ['--font-sans', '--za-font-sans'],
      ['--radius-control', '--za-radius-control'],
      ['--shadow-layered', '--za-shadow-layered'],
    ]) {
      expect(css).toContain(`${themeName}: var(${sourceName});`)
    }

    expect(css).not.toMatch(/--color-(?:gray|red|green|amber)-/)
  })

  it('keeps the wordmark ink-coloured while retaining link interaction states', async () => {
    const css = await readFile(globalsPath, 'utf8')
    const linkStart = css.indexOf('.za-link {')
    const wordmarkLinkStart = css.indexOf('.za-wordmark.za-link {')
    const hoverStart = css.indexOf('.za-link:hover {')

    expect(wordmarkLinkStart).toBeGreaterThan(linkStart)
    expect(hoverStart).toBeGreaterThan(wordmarkLinkStart)
    expect(css.slice(wordmarkLinkStart, hoverStart)).toContain(
      'color: var(--za-color-text);',
    )
    expect(css.slice(hoverStart)).toContain(
      'color: var(--za-color-accent-hover);',
    )
    expect(css.slice(css.indexOf('.za-link:active {'))).toContain(
      'color: var(--za-color-accent-active);',
    )
  })

  it('sets the one-light-theme, typography, rhythm, focus, and motion foundation', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toContain('color-scheme: light;')
    expect(css).not.toContain('color-scheme: dark')
    expect(css).toMatch(/--za-font-sans:\s*ui-sans-serif, system-ui/)
    expect(css).not.toMatch(/@font-face|https?:\/\/|@import\s+url/i)
    expect(css).toContain('--za-space-unit: 0.25rem;')
    expect(css).toContain('--za-space-2: 0.5rem;')
    expect(css).toContain('--za-space-4: 1rem;')
    expect(css).toContain('--za-space-6: 1.5rem;')
    expect(css).toContain('--za-space-8: 2rem;')
    expect(css).toContain('--za-space-12: 3rem;')
    expect(css).toContain('--za-radius-small: 0.25rem;')
    expect(css).toContain('--za-radius-control: 0.5rem;')
    expect(css).toContain('--za-radius-layered: 0.75rem;')
    expect(css).toContain('--za-border-width: 1px;')
    expect(css).toContain('--za-focus-width: 3px;')
    expect(css).toContain('--za-focus-offset: 3px;')
    expect(css).toContain('--za-motion-fast: 150ms;')
    expect(css).toContain('--za-motion-reduced: 0.01ms;')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).toContain('outline-color: Highlight;')
  })

  it('contains only a local, static owned favicon', async () => {
    const icon = await readFile(iconPath, 'utf8')

    expect(icon).toMatch(/^<svg\b/)
    expect(icon).toContain('viewBox="0 0 64 64"')
    expect(icon).toContain('aria-label="zedarchive"')
    expect(icon).not.toMatch(
      /<script\b|\bon\w+\s*=|<image\b|<use\b|<foreignObject\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)|data:|@font-face|<style\b/i,
    )
  })
})
