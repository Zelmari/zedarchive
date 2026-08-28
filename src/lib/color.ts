/**
 * Parse hex color to RGB tuple [r, g, b] (0-255).
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const sanitized = hex.replace(/^#/, '').trim();
  if (sanitized.length === 3) {
    const r = parseInt((sanitized[0] ?? '') + (sanitized[0] ?? ''), 16);
    const g = parseInt((sanitized[1] ?? '') + (sanitized[1] ?? ''), 16);
    const b = parseInt((sanitized[2] ?? '') + (sanitized[2] ?? ''), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
  }
  if (sanitized.length === 6) {
    const r = parseInt(sanitized.slice(0, 2), 16);
    const g = parseInt(sanitized.slice(2, 4), 16);
    const b = parseInt(sanitized.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
  }
  return null;
}

/**
 * Relative luminance calculation according to WCAG 2.1 specs.
 */
export function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/**
 * Contrast ratio calculation between foreground and background hex colors.
 */
export function getContrastRatio(fgHex: string, bgHex: string): number {
  const fgRgb = hexToRgb(fgHex);
  const bgRgb = hexToRgb(bgHex);
  if (!fgRgb || !bgRgb) return 1;

  const l1 = getRelativeLuminance(fgRgb);
  const l2 = getRelativeLuminance(bgRgb);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG Rating Level: AAA (>=7), AA (>=4.5), AA Large (>=3), Fail (<3)
 */
export function getWcagLevel(ratio: number): {
  level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  pass: boolean;
} {
  if (ratio >= 7) return { level: 'AAA', pass: true };
  if (ratio >= 4.5) return { level: 'AA', pass: true };
  if (ratio >= 3) return { level: 'AA Large', pass: false };
  return { level: 'Fail', pass: false };
}
