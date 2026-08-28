import { describe, it, expect } from 'vitest';
import { hexToRgb, getContrastRatio, getWcagLevel } from '@/lib/color';
import { CUSTOM_THEME_PRESETS } from '@/lib/constants';

describe('Color & Contrast Validator', () => {
  it('parses valid 3-digit and 6-digit hex colors', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('1e2320')).toEqual([30, 35, 32]);
    expect(hexToRgb('invalid')).toBeNull();
  });

  it('calculates accurate contrast ratios', () => {
    const blackWhite = getContrastRatio('#000000', '#ffffff');
    expect(blackWhite).toBeCloseTo(21, 0);

    const sameColor = getContrastRatio('#ffffff', '#ffffff');
    expect(sameColor).toBeCloseTo(1, 0);
  });

  it('correctly evaluates WCAG levels', () => {
    expect(getWcagLevel(21).level).toBe('AAA');
    expect(getWcagLevel(21).pass).toBe(true);

    expect(getWcagLevel(5.2).level).toBe('AA');
    expect(getWcagLevel(5.2).pass).toBe(true);

    expect(getWcagLevel(3.5).level).toBe('AA Large');
    expect(getWcagLevel(3.5).pass).toBe(false);

    expect(getWcagLevel(2.0).level).toBe('Fail');
    expect(getWcagLevel(2.0).pass).toBe(false);
  });

  it('ensures all starter presets have good WCAG contrast', () => {
    for (const preset of CUSTOM_THEME_PRESETS) {
      const ratio = getContrastRatio(preset.text, preset.canvas);
      const wcag = getWcagLevel(ratio);
      expect(wcag.pass).toBe(true);
    }
  });
});
