'use client';

import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { updateUserTheme } from '@/server/profile';

import { THEMES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: string;
  onThemeChange?: (themeId: string) => void;
}

export default function ThemeModal({
  isOpen,
  onClose,
  currentTheme = 'parchment',
  onThemeChange,
}: ThemeModalProps) {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSelect = async (themeId: string) => {
    setSelectedTheme(themeId);
    onThemeChange?.(themeId);
    // Update data-theme on document element immediately
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="theme-modal-title"
      title="Theme & Aesthetic"
      icon={<Palette size={18} />}
      contentStyle={{ maxWidth: '32rem' }}
    >
      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
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
                onClick={() => handleSelect(t.id)}
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

        <div className="mt-[var(--za-space-5)] flex justify-end">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
