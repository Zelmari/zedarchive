'use client';

import { Palette } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import ThemeStudio from '@/components/theme/ThemeStudio';
import type { CustomThemePalette, ThemeId } from '@/types/user';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: ThemeId;
  customTheme?: CustomThemePalette | null;
  onThemeChange?: (themeId: ThemeId, customPalette?: CustomThemePalette | null) => void;
}

export default function ThemeModal({
  isOpen,
  onClose,
  currentTheme = 'parchment',
  customTheme = null,
  onThemeChange,
}: ThemeModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="theme-modal-title"
      title="Theme & Aesthetic"
      icon={<Palette size={18} />}
      contentStyle={{ maxWidth: '34rem' }}
    >
      <ThemeStudio
        initialTheme={currentTheme}
        customTheme={customTheme}
        onThemeChange={onThemeChange}
      />
      <div className="flex justify-end border-t border-decorative px-6 py-3">
        <button type="button" className="za-button za-button--secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
