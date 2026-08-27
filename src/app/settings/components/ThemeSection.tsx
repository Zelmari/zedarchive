'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ThemeId } from '@/types/user';
import { THEMES } from '@/lib/constants';
import { updateUserTheme } from '@/server/profile';

interface ThemeSectionProps {
  initialTheme?: ThemeId;
}

export default function ThemeSection({ initialTheme = 'parchment' }: ThemeSectionProps) {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(initialTheme);

  const handleThemeChange = async (themeId: ThemeId) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    try {
      localStorage.setItem('za-theme', themeId);
      await updateUserTheme(themeId);
    } catch (err) {
      console.warn('Failed to save theme preference:', err);
    }
  };

  return (
    <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
      <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
        <Sparkles size={18} className="text-ink-muted" />
        <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
          Interface Theme
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleThemeChange(t.id)}
            style={{ backgroundColor: t.bg, color: t.text }}
            className={`flex flex-col items-center justify-center rounded-control border p-3 text-center transition-all ${
              currentTheme === t.id
                ? 'border-2 border-accent shadow-sm'
                : 'border-decorative hover:border-required'
            }`}
          >
            <span className="text-xs font-[var(--za-weight-emphasis)]">{t.label}</span>
            {currentTheme === t.id && <span className="mt-1 text-[10px] text-accent">Active</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
