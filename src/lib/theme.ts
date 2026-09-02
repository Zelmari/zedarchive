import type { CustomThemePalette, ThemeId } from '@/types/user';

const CUSTOM_THEME_TOKENS = [
  '--za-color-canvas',
  '--za-color-surface',
  '--za-color-surface-subtle',
  '--za-color-text',
  '--za-color-text-muted',
  '--za-color-border-required',
  '--za-color-border-decorative',
  '--za-color-accent',
  '--za-color-accent-hover',
  '--za-color-accent-active',
  '--za-color-on-accent',
  '--za-color-surface-sunken',
  '--za-color-text-faint',
  '--za-color-gold',
  '--za-color-gold-hover',
  '--za-color-gold-dark',
] as const;

/**
 * Injects CSS custom properties dynamically for custom user palettes.
 */
export function applyCustomThemeTokens(palette: CustomThemePalette | null | undefined) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  for (const token of CUSTOM_THEME_TOKENS) {
    root.style.removeProperty(token);
  }

  if (!palette) return;

  root.style.setProperty('--za-color-canvas', palette.canvas);
  root.style.setProperty('--za-color-surface', palette.surface);
  root.style.setProperty('--za-color-surface-subtle', palette.surfaceSubtle);
  root.style.setProperty('--za-color-text', palette.text);
  root.style.setProperty('--za-color-text-muted', palette.textMuted);
  root.style.setProperty('--za-color-border-required', palette.borderRequired);
  root.style.setProperty('--za-color-border-decorative', palette.borderDecorative);
  root.style.setProperty('--za-color-accent', palette.accent);
  root.style.setProperty('--za-color-accent-hover', palette.accent);
  root.style.setProperty('--za-color-accent-active', palette.accent);
  root.style.setProperty('--za-color-on-accent', palette.onAccent);
  root.style.setProperty(
    '--za-color-surface-sunken',
    'color-mix(in srgb, var(--za-color-surface-subtle) 80%, var(--za-color-text) 8%)',
  );
  root.style.setProperty(
    '--za-color-text-faint',
    'color-mix(in srgb, var(--za-color-text-muted) 65%, var(--za-color-canvas))',
  );
  root.style.setProperty('--za-color-gold', 'var(--za-color-accent)');
  root.style.setProperty('--za-color-gold-hover', 'var(--za-color-accent-hover)');
  root.style.setProperty('--za-color-gold-dark', 'var(--za-color-accent)');
}

/**
 * Applies a complete theme selection and keeps the client-side preference in sync.
 */
export function applyTheme(themeId: ThemeId, customPalette: CustomThemePalette | null = null) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  applyCustomThemeTokens(null);
  if (themeId === 'custom' && customPalette) {
    applyCustomThemeTokens(customPalette);
  }
  root.setAttribute('data-theme', themeId);

  try {
    localStorage.setItem('za-theme', themeId);
  } catch {
    // Storage unavailable (private mode etc.) — the attribute is still set above.
  }
}
