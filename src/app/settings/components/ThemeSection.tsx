'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import ThemeStudio from '@/components/theme/ThemeStudio';
import { applyCustomThemeTokens, applyTheme } from '@/lib/theme';
import type { CustomThemePalette, ThemeId } from '@/types/user';

interface ThemeSectionProps {
  initialTheme?: ThemeId;
  customTheme?: CustomThemePalette | null;
}

export default function ThemeSection({
  initialTheme = 'parchment',
  customTheme = null,
}: ThemeSectionProps) {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(initialTheme);
  const [currentCustomTheme, setCurrentCustomTheme] = useState<CustomThemePalette | null>(
    customTheme,
  );

  useEffect(() => {
    applyTheme(currentTheme, currentTheme === 'custom' ? currentCustomTheme : null);
  }, [currentTheme, currentCustomTheme]);

  const handleThemeChange = (themeId: ThemeId, nextCustomTheme?: CustomThemePalette | null) => {
    if (themeId !== 'custom') {
      applyCustomThemeTokens(null);
    }
    setCurrentTheme(themeId);
    if (nextCustomTheme) {
      setCurrentCustomTheme(nextCustomTheme);
    }
  };

  return (
    <section className="za-bookplate relative p-6 sm:p-8">
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <div className="mb-5 flex items-center gap-2 border-b border-decorative pb-3">
        <Sparkles size={18} className="text-accent" />
        <h2 className="font-[var(--za-font-display)] text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.06em] text-ink">
          Interface Theme
        </h2>
      </div>
      <ThemeStudio
        initialTheme={currentTheme}
        customTheme={currentCustomTheme}
        onThemeChange={handleThemeChange}
        className="px-0 py-0"
      />
    </section>
  );
}
