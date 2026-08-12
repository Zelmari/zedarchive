import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const globalsPath = fileURLToPath(new URL('./globals.css', import.meta.url))
const iconPath = fileURLToPath(
  new URL('../../public/zedarchivelogo.png', import.meta.url),
)
const sourceLogoPath = fileURLToPath(
  new URL('../../zedarchivelogo.png', import.meta.url),
)

function pngDimensions(bytes: Buffer) {
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error('Expected a PNG signature.')
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

const requiredColors = {
  canvas: '#f7f5f0',
  surface: '#ffffff',
  'surface-subtle': '#f0ede6',
  text: '#242321',
  'text-muted': '#5b5c61',
  'border-required': '#85837c',
  'border-decorative': '#d6d1c7',
  accent: '#242321',
  'accent-hover': '#3a3936',
  'accent-active': '#171716',
  'accent-soft': '#eeece7',
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
  information: '#4b4a46',
  'information-surface': '#f0ede6',
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
    expect(ratio('accent', 'surface-subtle')).toBeGreaterThanOrEqual(4.5)
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

  it('keeps destructive launchers distinct from irreversible confirmation', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /\.za-button--destructive\s*\{[\s\S]*?background: var\(--za-color-destructive\);[\s\S]*?color: var\(--za-color-on-destructive\);/,
    )
    expect(css).toMatch(
      /\.za-button--destructive-outline\s*\{[\s\S]*?border-color: var\(--za-color-destructive\);[\s\S]*?background: var\(--za-color-surface\);[\s\S]*?color: var\(--za-color-destructive\);/,
    )
  })

  it('keeps selected actions distinct without relying on colour alone', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /\.za-button--selected\s*\{[\s\S]*?border-color: var\(--za-color-accent\);[\s\S]*?background: var\(--za-color-accent-soft\);[\s\S]*?color: var\(--za-color-accent\);/,
    )
  })

  it('keeps current-page links exact, persistent, and visible without colour alone', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /\.za-current-page\s*\{[\s\S]*?background: var\(--za-color-accent-soft\);[\s\S]*?box-shadow: inset 0 -2px 0 var\(--za-color-accent\);[\s\S]*?font-weight: var\(--za-weight-heading\);[\s\S]*?text-decoration-thickness: 2px;/,
    )
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{[\s\S]*?\.za-current-page\s*\{[\s\S]*?background: Canvas;[\s\S]*?box-shadow: inset 0 -2px 0 Highlight;[\s\S]*?color: LinkText;/,
    )
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{[\s\S]*?\.za-wordmark\.za-current-page\s*\{\s*text-decoration-line: underline;\s*text-decoration-style: double;\s*text-underline-offset: 0\.15em;/,
    )
    expect(css).not.toContain('forced-color-adjust: none')
  })

  it('keeps a current secondary button selected after ordinary button variants', async () => {
    const css = await readFile(globalsPath, 'utf8')
    const secondaryStart = css.indexOf('.za-button--secondary {')
    const buttonStart = css.indexOf('.za-button {')
    const currentButtonStart = css.indexOf('.za-button.za-current-page {')

    expect(currentButtonStart).toBeGreaterThan(buttonStart)
    expect(currentButtonStart).toBeGreaterThan(secondaryStart)
    expect(css.slice(currentButtonStart)).toMatch(
      /\.za-button\.za-current-page\s*\{\s*border-color: var\(--za-color-accent\);\s*background: var\(--za-color-accent-soft\);\s*color: var\(--za-color-accent\);\s*font-weight: var\(--za-weight-heading\);/,
    )
    expect(css.slice(currentButtonStart)).toMatch(
      /\.za-button\.za-current-page:hover\s*\{\s*border-color: var\(--za-color-accent-hover\);\s*background: var\(--za-color-surface-subtle\);\s*color: var\(--za-color-accent-hover\);/,
    )
    expect(css.slice(currentButtonStart)).toMatch(
      /\.za-button\.za-current-page:active\s*\{\s*border-color: var\(--za-color-accent-active\);\s*color: var\(--za-color-accent-active\);/,
    )
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{[\s\S]*?\.za-button\.za-current-page\s*\{\s*border-color: Highlight;/,
    )
  })

  it('strengthens muted text and decorative boundaries only in increased-contrast mode', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{\s*--za-color-text-muted: var\(--za-color-text\);\s*--za-color-border-decorative: var\(--za-color-border-required\);/,
    )
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
      ['--shadow-raised', '--za-shadow-raised'],
    ]) {
      expect(css).toContain(`${themeName}: var(${sourceName});`)
    }

    expect(css).not.toMatch(/--color-(?:gray|red|green|amber)-/)
  })

  it('keeps modal and raised-paper elevation as distinct static recipes', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toContain(
      '--za-shadow-layered: 0 18px 48px rgb(36 35 33 / 18%);',
    )
    expect(css).toMatch(
      /--za-shadow-raised:\s*0 1px 2px rgb\(36 35 33 \/ 8%\),\s*0 6px 16px rgb\(36 35 33 \/ 6%\);/,
    )
    expect(css).toMatch(
      /\.za-card--raised\s*\{\s*box-shadow: var\(--za-shadow-raised\);\s*\}/,
    )
    expect(css).not.toMatch(/\.za-card--raised[^}]*:(?:hover|active)/)
    expect(css).toMatch(
      /\.za-dialog\s*\{[\s\S]*?max-block-size: calc\(100dvh[\s\S]*?background: var\(--za-color-surface\);[\s\S]*?box-shadow: var\(--za-shadow-layered\);/,
    )
    expect(css).toMatch(
      /\.za-dialog::backdrop\s*\{\s*background: var\(--za-backdrop-modal\);\s*\}/,
    )
  })

  it('keeps the catalogue action zone visually divided without creating another card', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /\.za-catalogue-card__action\s*\{[\s\S]*?inline-size: 100%;[\s\S]*?margin-block-start: auto;[\s\S]*?border-block-start: var\(--za-border-width\) solid\s*var\(--za-color-border-decorative\);[\s\S]*?padding-block-start: var\(--za-space-3\);/,
    )
  })

  it('keeps archive objects naturally sized with distinct tracking zones', async () => {
    const css = await readFile(globalsPath, 'utf8')

    expect(css).toMatch(
      /\.za-archive-card\s*\{[\s\S]*?block-size: 100%;[\s\S]*?flex-direction: column;[\s\S]*?gap: var\(--za-space-4\);/,
    )
    expect(css).toMatch(
      /\.za-archive-card__summary\s*\{[\s\S]*?flex-wrap: wrap;[\s\S]*?align-items: flex-start;/,
    )
    expect(css).toMatch(
      /\.za-archive-card__details\s*\{[\s\S]*?min-inline-size: 0;[\s\S]*?overflow-wrap: anywhere;/,
    )
    expect(css).toMatch(
      /\.za-archive-card > \.za-archive-card__tracking\s*\{[\s\S]*?margin-block-start: auto;[\s\S]*?border-block-start: var\(--za-border-width\) solid\s*var\(--za-color-border-decorative\);/,
    )
    expect(css).toMatch(
      /\.za-card--restricted\s*\{[\s\S]*?background: var\(--za-color-surface-subtle\);[\s\S]*?box-shadow: none;/,
    )
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
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?transition-duration: var\(--za-motion-reduced\);[\s\S]*?animation-duration: var\(--za-motion-reduced\);/,
    )
    expect(css).toMatch(
      /\.za-site-header\s*\{[\s\S]*?background: var\(--za-color-surface\);/,
    )
  })

  it('contains only a local, static owned favicon', async () => {
    const icon = await readFile(iconPath)
    const sourceLogo = await readFile(sourceLogoPath)

    expect(createHash('sha256').update(sourceLogo).digest('hex')).toBe(
      '234c9a96684ebae4e0d21982709675bb86fde47f770f71ddc02c5cc753aff48b',
    )
    expect(pngDimensions(sourceLogo)).toEqual({ width: 1536, height: 1024 })
    expect(pngDimensions(icon)).toEqual({ width: 288, height: 192 })
    expect(icon.length).toBe(30108)
    expect(createHash('sha256').update(icon).digest('hex')).toBe(
      'eded25d84d02f5ebe9b9ea806e8cd8a6d20e9a3d026112c7806ba3de75db4d7a',
    )
  })
})
