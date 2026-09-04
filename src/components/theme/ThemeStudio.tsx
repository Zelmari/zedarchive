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

const CONTRAST_PAIRS = [
  { id: 'text-canvas', label: 'Text / Canvas', foreground: 'text', background: 'canvas' },
  { id: 'text-surface', label: 'Text / Surface', foreground: 'text', background: 'surface' },
  {
    id: 'accent-on-accent',
    label: 'Accent / onAccent',
    foreground: 'accent',
    background: 'onAccent',
  },
] as const;

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

  const contrastChecks = CONTRAST_PAIRS.map((pair) => {
    const ratio = getContrastRatio(customPalette[pair.foreground], customPalette[pair.background]);
    return { ...pair, ratio, wcag: getWcagLevel(ratio) };
  });

  return (
    <div className={cn('bg-surface px-[var(--za-space-6)] py-[var(--za-space-4)]', className)}>
      <div className="mb-5 flex gap-2 border-b border-decorative pb-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'presets'}
          onClick={() => {
            setTab('presets');
            if (selectedTheme !== 'custom') {
              applyTheme(selectedTheme, null);
            }
          }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-small border-b-2 px-3 py-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.07em] transition-colors',
            tab === 'presets'
              ? 'border-accent text-ink'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          <Palette size={14} aria-hidden="true" /> Curated Presets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'builder'}
          onClick={() => {
            setTab('builder');
            previewCustomPalette(customPalette);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-small border-b-2 px-3 py-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.07em] transition-colors',
            tab === 'builder'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          <Sliders size={14} aria-hidden="true" /> Custom Studio
        </button>
      </div>

      {tab === 'presets' ? (
        <div>
          <div className="mb-[var(--za-space-4)]">
            <div className="font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-accent">
              Curated Palettes
            </div>
            <p className="mt-1 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              Choose a visual style. Your theme is saved to your account and syncs across all your
              devices.
            </p>
          </div>

          <div className="flex flex-col gap-[var(--za-space-3)]">
            {THEMES.map((theme) => {
              const isActive = selectedTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-label={theme.name}
                  aria-pressed={isActive}
                  onClick={() => void handleSelectPreset(theme.id)}
                  className={cn(
                    'za-bookplate flex w-full cursor-pointer items-center justify-between rounded-small border-2 px-[var(--za-space-4)] py-[var(--za-space-3)] text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-accent',
                    isActive ? 'border-accent shadow-gold' : 'border-decorative',
                  )}
                >
                  <div className="flex items-center gap-[var(--za-space-3)]">
                    <div
                      className="flex h-[2.6rem] w-[2.6rem] shrink-0 items-center justify-center rounded-small text-[0.8rem] font-bold shadow-raised"
                      style={{
                        backgroundColor: theme.bg,
                        border: `1.5px solid ${theme.border}`,
                        color: theme.fg,
                      }}
                    >
                      Aa
                    </div>
                    <div className="min-w-0">
                      <div className="font-[var(--za-font-display)] text-[length:var(--za-text-supporting)] font-bold uppercase tracking-[0.04em] text-ink">
                        {theme.name}
                      </div>
                      <div className="mt-[0.1rem] font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink-muted">
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
          <div className="mb-5">
            <div className="font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-accent">
              Palette Workshop
            </div>
            <p className="mt-1 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              Tune the archive surfaces and ribbon accent while keeping the saved palette schema
              compact.
            </p>
            <label className="mt-4 mb-1.5 block font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.1em] text-ink-muted">
              Starter Presets
            </label>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleLoadStarterPreset(preset)}
                  className="flex min-h-[var(--za-control-min-block-size)] cursor-pointer items-center gap-1.5 rounded-small border border-decorative bg-surface px-2.5 py-1 font-[var(--za-font-display)] text-[0.68rem] font-bold uppercase tracking-[0.04em] text-ink hover:border-accent"
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

          <div className="mb-5 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            {PALETTE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1 block font-[var(--za-font-mono)] text-[0.62rem] uppercase tracking-[0.06em] text-ink-muted">
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette[key]}
                    onChange={(event) => handlePaletteFieldChange(key, event.target.value)}
                    aria-label={`${label} color`}
                    className="h-[var(--za-control-min-block-size)] w-[var(--za-control-min-block-size)] cursor-pointer rounded-small border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette[key]}
                    onChange={(event) => handlePaletteFieldChange(key, event.target.value)}
                    aria-label={`${label} hex value`}
                    className="za-field w-full min-w-0 py-1 font-[var(--za-font-mono)] text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5 rounded-small border border-required bg-surface-sunken p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.07em] text-ink">
                WCAG 2.1 Contrast Engine
              </span>
              <span className="font-[var(--za-font-mono)] text-[0.62rem] uppercase tracking-[0.08em] text-ink-muted">
                Relative luminance
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {contrastChecks.map((check) => (
                <div
                  key={check.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-small border border-decorative bg-surface px-3 py-2"
                >
                  <div>
                    <div className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink">
                      {check.label}
                    </div>
                    <div className="font-[var(--za-font-mono)] text-[0.6rem] text-ink-faint">
                      {customPalette[check.foreground]} on {customPalette[check.background]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-[var(--za-font-display)] text-sm font-bold text-ink">
                      {check.ratio.toFixed(2)} : 1
                    </div>
                    <div
                      className={cn(
                        'font-[var(--za-font-mono)] text-[0.6rem] uppercase tracking-[0.06em]',
                        check.wcag.pass ? 'text-success' : 'text-danger',
                      )}
                    >
                      {check.wcag.pass ? '✓' : '⚠'} {check.wcag.level}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 font-[var(--za-font-serif-body)] text-[0.7rem] leading-[1.4] text-ink-muted">
              These checks cover text/canvas, text/surface, and accent/onAccent. Gold remains a
              decorative stamp and is not a save requirement.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleSaveCustomTheme()}
              disabled={isSaving}
              className="za-button za-button--primary text-xs"
            >
              <Sparkles size={13} aria-hidden="true" />
              {isSaving ? 'Saving Palette…' : 'Save & Apply Palette'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
