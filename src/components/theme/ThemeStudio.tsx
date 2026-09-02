'use client';

import { useEffect, useState } from 'react';
import { Check, Palette, Sliders, Sparkles } from 'lucide-react';
import { saveCustomThemeAction, updateUserTheme } from '@/server/profile';
import { CUSTOM_THEME_PRESETS, THEMES } from '@/lib/constants';
import { applyCustomThemeTokens, applyTheme } from '@/lib/theme';
import { getContrastRatio, getWcagLevel } from '@/lib/color';
import type { CustomThemePalette, ThemeId } from '@/types/user';
import { cn } from '@/lib/cn';

type PaletteField = Exclude<keyof CustomThemePalette, 'name'>;

export const PALETTE_FIELDS: Array<{ key: PaletteField; label: string }> = [
  { key: 'canvas', label: 'Canvas / Background' },
  { key: 'surface', label: 'Card Surface' },
  { key: 'surfaceSubtle', label: 'Subtle Surface' },
  { key: 'text', label: 'Primary Text / Ink' },
  { key: 'textMuted', label: 'Secondary / Muted Text' },
  { key: 'borderRequired', label: 'Borders & Controls' },
  { key: 'borderDecorative', label: 'Decorative Borders' },
  { key: 'accent', label: 'Interactive Accent' },
  { key: 'onAccent', label: 'Text on Accent' },
];

interface ThemeStudioProps {
  initialTheme?: ThemeId;
  customTheme?: CustomThemePalette | null;
  onThemeChange?: (themeId: ThemeId, customPalette?: CustomThemePalette | null) => void;
  className?: string;
}

function previewCustomPalette(palette: CustomThemePalette) {
  applyCustomThemeTokens(palette);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', 'custom');
  }
}

export default function ThemeStudio({
  initialTheme = 'parchment',
  customTheme = null,
  onThemeChange,
  className,
}: ThemeStudioProps) {
  const [tab, setTab] = useState<'presets' | 'builder'>(
    initialTheme === 'custom' ? 'builder' : 'presets',
  );
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(initialTheme);
  const [customPalette, setCustomPalette] = useState<CustomThemePalette>(
    customTheme || CUSTOM_THEME_PRESETS[0]!,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!customTheme) return;
    // Sync a newly saved palette into the shared studio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomPalette(customTheme);
  }, [customTheme]);

  useEffect(() => {
    // Keep the studio selection aligned when its parent changes theme.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedTheme(initialTheme);
    if (initialTheme === 'custom') setTab('builder');
  }, [initialTheme]);

  const handleSelectPreset = async (themeId: ThemeId) => {
    setSelectedTheme(themeId);
    applyTheme(themeId, null);
    onThemeChange?.(themeId);

    try {
      setIsSaving(true);
      await updateUserTheme(themeId);
    } catch (err) {
      console.warn('Failed to sync theme with user account:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaletteFieldChange = (field: PaletteField, value: string) => {
    const updated = { ...customPalette, [field]: value };
    setCustomPalette(updated);
    previewCustomPalette(updated);
  };

  const handleLoadStarterPreset = (preset: CustomThemePalette) => {
    setCustomPalette(preset);
    previewCustomPalette(preset);
  };

  const handleSaveCustomTheme = async () => {
    setSelectedTheme('custom');
    applyTheme('custom', customPalette);
    onThemeChange?.('custom', customPalette);

    try {
      setIsSaving(true);
      await saveCustomThemeAction(customPalette);
    } catch (err) {
      console.warn('Failed to save custom theme:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const textOnCanvasRatio = getContrastRatio(customPalette.text, customPalette.canvas);
  const textOnSurfaceRatio = getContrastRatio(customPalette.text, customPalette.surface);
  const minRatio = Math.min(textOnCanvasRatio, textOnSurfaceRatio);
  const wcag = getWcagLevel(minRatio);

  return (
    <div className={cn('px-[var(--za-space-6)] py-[var(--za-space-4)]', className)}>
      <div className="mb-4 flex gap-2 border-b border-decorative pb-2">
        <button
          type="button"
          onClick={() => {
            setTab('presets');
            if (selectedTheme !== 'custom') {
              applyTheme(selectedTheme, null);
            }
          }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-[var(--za-weight-emphasis)] transition-colors',
            tab === 'presets'
              ? 'border border-required bg-surface text-ink'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          <Palette size={14} /> Curated Presets
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('builder');
            previewCustomPalette(customPalette);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-[var(--za-weight-emphasis)] transition-colors',
            tab === 'builder'
              ? 'border border-accent bg-accent/15 text-accent'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          <Sliders size={14} /> Custom Studio
        </button>
      </div>

      {tab === 'presets' ? (
        <div>
          <p className="mb-[var(--za-space-4)] text-[length:var(--za-text-fine)] text-ink-muted">
            Choose a visual style. Your theme is saved to your account and syncs across all your
            devices.
          </p>

          <div className="flex flex-col gap-[var(--za-space-3)]">
            {THEMES.map((theme) => {
              const isActive = selectedTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => void handleSelectPreset(theme.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-control border-2 bg-surface px-[var(--za-space-4)] py-[var(--za-space-3)] text-left transition-all hover:border-accent',
                    isActive ? 'border-accent' : 'border-decorative',
                  )}
                >
                  <div className="flex items-center gap-[var(--za-space-3)]">
                    <div
                      className="flex h-[2.2rem] w-[2.2rem] shrink-0 items-center justify-center rounded-small text-[0.8rem] font-bold"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1.5px solid ${theme.border}`,
                        color: theme.fg,
                      }}
                    >
                      Aa
                    </div>
                    <div>
                      <div className="text-[length:var(--za-text-base)] font-[var(--za-weight-heading)] text-ink">
                        {theme.name}
                      </div>
                      <div className="mt-[0.1rem] text-[length:var(--za-text-fine)] text-ink-muted">
                        {theme.description}
                      </div>
                    </div>
                  </div>
                  {isActive && <Check size={18} className="shrink-0 text-ink" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-[var(--za-weight-emphasis)] text-ink-muted">
              Starter Presets
            </label>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleLoadStarterPreset(preset)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-small border border-decorative bg-surface px-2.5 py-1 text-xs text-ink hover:border-accent"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-decorative"
                    style={{ backgroundColor: preset.accent }}
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
            {PALETTE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1 block text-[11px] text-ink-muted">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette[key]}
                    onChange={(event) => handlePaletteFieldChange(key, event.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette[key]}
                    onChange={(event) => handlePaletteFieldChange(key, event.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4 rounded-control border border-decorative bg-surface-subtle p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-[var(--za-weight-emphasis)] text-ink">
                Readability & Contrast Check
              </span>
              <span className={`font-bold ${wcag.pass ? 'text-success' : 'text-danger'}`}>
                {wcag.pass ? `✓ ${wcag.level}` : `⚠ ${wcag.level}`} ({minRatio.toFixed(1)}:1)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {wcag.pass
                ? 'Great contrast! Text and interactive elements meet WCAG accessibility standards.'
                : 'Low contrast detected. Consider increasing brightness difference between text and backgrounds.'}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleSaveCustomTheme()}
              disabled={isSaving}
              className="za-button za-button--primary text-xs"
            >
              <Sparkles size={13} className="mr-1" />
              {isSaving ? 'Saving Palette…' : 'Save & Apply Palette'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
