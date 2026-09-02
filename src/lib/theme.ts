import type { CustomThemePalette } from '@/types/user';

/**
 * Injects CSS custom properties dynamically for custom user palettes.
 */
export function applyCustomThemeTokens(palette: CustomThemePalette | null | undefined) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (!palette) {
    // Clear any inline custom variables
    root.style.removeProperty('--za-color-canvas');
    root.style.removeProperty('--za-color-surface');
    root.style.removeProperty('--za-color-surface-subtle');
    root.style.removeProperty('--za-color-text');
    root.style.removeProperty('--za-color-text-muted');
    root.style.removeProperty('--za-color-border-required');
    root.style.removeProperty('--za-color-border-decorative');
    root.style.removeProperty('--za-color-accent');
    root.style.removeProperty('--za-color-accent-hover');
    root.style.removeProperty('--za-color-on-accent');
    return;
  }

  root.setAttribute('data-theme', 'custom');
  root.style.setProperty('--za-color-canvas', palette.canvas);
  root.style.setProperty('--za-color-surface', palette.surface);
  root.style.setProperty('--za-color-surface-subtle', palette.surfaceSubtle);
  root.style.setProperty('--za-color-text', palette.text);
  root.style.setProperty('--za-color-text-muted', palette.textMuted);
  root.style.setProperty('--za-color-border-required', palette.borderRequired);
  root.style.setProperty('--za-color-border-decorative', palette.borderDecorative);
  root.style.setProperty('--za-color-accent', palette.accent);
  root.style.setProperty('--za-color-accent-hover', palette.accent);
  root.style.setProperty('--za-color-on-accent', palette.onAccent);
}
