'use client';

import { useState } from 'react';
import { Palette, Check, Sparkles, Sliders } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { updateUserTheme, saveCustomThemeAction } from '@/server/profile';
import { THEMES, CUSTOM_THEME_PRESETS } from '@/lib/constants';
import { applyCustomThemeTokens } from '@/lib/theme';
import { getContrastRatio, getWcagLevel } from '@/lib/color';
import type { CustomThemePalette } from '@/types/user';
import { cn } from '@/lib/cn';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: string;
  customTheme?: CustomThemePalette | null;
  onThemeChange?: (themeId: string) => void;
}

export default function ThemeModal({
  isOpen,
  onClose,
  currentTheme = 'parchment',
  customTheme = null,
  onThemeChange,
}: ThemeModalProps) {
  const [tab, setTab] = useState<'presets' | 'builder'>(
    currentTheme === 'custom' ? 'builder' : 'presets',
  );
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [isSaving, setIsSaving] = useState(false);

  // Custom Palette Studio state
  const [customPalette, setCustomPalette] = useState<CustomThemePalette>(
    customTheme || CUSTOM_THEME_PRESETS[0]!,
  );

  if (!isOpen) return null;

  const handleSelectPreset = async (themeId: string) => {
    setSelectedTheme(themeId);
    onThemeChange?.(themeId);
    applyCustomThemeTokens(null); // Clear custom overrides
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('za-theme', themeId);
    }

    try {
      setIsSaving(true);
      await updateUserTheme(themeId);
    } catch (err) {
      console.warn('Failed to sync theme with user account:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaletteFieldChange = (field: keyof CustomThemePalette, value: string) => {
    const updated = { ...customPalette, [field]: value };
    setCustomPalette(updated);
    applyCustomThemeTokens(updated);
  };

  const handleLoadStarterPreset = (preset: CustomThemePalette) => {
    setCustomPalette(preset);
    applyCustomThemeTokens(preset);
  };

  const handleSaveCustomTheme = async () => {
    setSelectedTheme('custom');
    onThemeChange?.('custom');
    applyCustomThemeTokens(customPalette);

    try {
      setIsSaving(true);
      await saveCustomThemeAction(customPalette);
    } catch (err) {
      console.warn('Failed to save custom theme:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Contrast calculations
  const textOnCanvasRatio = getContrastRatio(customPalette.text, customPalette.canvas);
  const textOnSurfaceRatio = getContrastRatio(customPalette.text, customPalette.surface);
  const minRatio = Math.min(textOnCanvasRatio, textOnSurfaceRatio);
  const wcag = getWcagLevel(minRatio);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="theme-modal-title"
      title="Theme & Aesthetic"
      icon={<Palette size={18} />}
      contentStyle={{ maxWidth: '34rem' }}
    >
      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {/* Tab switcher */}
        <div className="mb-4 flex gap-2 border-b border-decorative pb-2">
          <button
            type="button"
            onClick={() => {
              setTab('presets');
              if (selectedTheme !== 'custom') {
                applyCustomThemeTokens(null);
                document.documentElement.setAttribute('data-theme', selectedTheme);
              }
            }}
            className={`flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-[var(--za-weight-emphasis)] transition-colors ${
              tab === 'presets'
                ? 'border border-required bg-surface text-ink'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Palette size={14} /> Curated Presets
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('builder');
              applyCustomThemeTokens(customPalette);
            }}
            className={`flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-[var(--za-weight-emphasis)] transition-colors ${
              tab === 'builder'
                ? 'border border-accent bg-accent/15 text-accent'
                : 'text-ink-muted hover:text-ink'
            }`}
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
              {THEMES.map((t) => {
                const isActive = selectedTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectPreset(t.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-control bg-surface px-[var(--za-space-4)] py-[var(--za-space-3)] text-left border-2 transition-all hover:border-accent',
                      isActive ? 'border-accent' : 'border-decorative',
                    )}
                  >
                    <div className="flex items-center gap-[var(--za-space-3)]">
                      <div
                        className="flex h-[2.2rem] w-[2.2rem] shrink-0 items-center justify-center rounded-small text-[0.8rem] font-bold"
                        style={{
                          backgroundColor: t.bg,
                          border: `1.5px solid ${t.border}`,
                          color: t.fg,
                        }}
                      >
                        Aa
                      </div>
                      <div>
                        <div className="text-[length:var(--za-text-base)] font-[var(--za-weight-heading)] text-ink">
                          {t.name}
                        </div>
                        <div className="mt-[0.1rem] text-[length:var(--za-text-fine)] text-ink-muted">
                          {t.description}
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
            {/* Starter Presets */}
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

            {/* Custom Color Matrix */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Canvas / Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.canvas}
                    onChange={(e) => handlePaletteFieldChange('canvas', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.canvas}
                    onChange={(e) => handlePaletteFieldChange('canvas', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Card Surface</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.surface}
                    onChange={(e) => handlePaletteFieldChange('surface', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.surface}
                    onChange={(e) => handlePaletteFieldChange('surface', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Primary Text / Ink</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.text}
                    onChange={(e) => handlePaletteFieldChange('text', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.text}
                    onChange={(e) => handlePaletteFieldChange('text', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-ink-muted mb-1">
                  Secondary / Muted Text
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.textMuted}
                    onChange={(e) => handlePaletteFieldChange('textMuted', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.textMuted}
                    onChange={(e) => handlePaletteFieldChange('textMuted', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Interactive Accent</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.accent}
                    onChange={(e) => handlePaletteFieldChange('accent', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.accent}
                    onChange={(e) => handlePaletteFieldChange('accent', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-ink-muted mb-1">Borders & Controls</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customPalette.borderRequired}
                    onChange={(e) => handlePaletteFieldChange('borderRequired', e.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-decorative bg-transparent"
                  />
                  <input
                    type="text"
                    value={customPalette.borderRequired}
                    onChange={(e) => handlePaletteFieldChange('borderRequired', e.target.value)}
                    className="w-full rounded-small border border-decorative bg-surface px-2 py-1 font-mono text-xs text-ink"
                  />
                </div>
              </div>
            </div>

            {/* WCAG Contrast Validator */}
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

            {/* Save & Apply Button */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveCustomTheme}
                disabled={isSaving}
                className="za-button za-button--primary text-xs"
              >
                <Sparkles size={13} className="mr-1" />
                {isSaving ? 'Saving Palette…' : 'Save & Apply Palette'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-[var(--za-space-5)] flex justify-end border-t border-decorative pt-3">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
