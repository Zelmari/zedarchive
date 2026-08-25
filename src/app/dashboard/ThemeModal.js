'use client';

import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import ModalShell from './ModalShell';
import { updateUserTheme } from '@/server/profile';
import styles from './dashboard.module.css';

const THEMES = [
  {
    id: 'parchment',
    name: 'Parchment (Default)',
    description: 'Warm linen paper, charcoal ink, subtle slate borders.',
    bg: '#f7f5f0',
    fg: '#242321',
    border: '#85837c',
  },
  {
    id: 'midnight',
    name: 'Midnight Slate',
    description: 'Deep obsidian and graphite dark slate with crisp white text.',
    bg: '#121316',
    fg: '#ededed',
    border: '#4b5563',
  },
  {
    id: 'sepia',
    name: 'Vintage Sepia',
    description: 'Warm amber tones, aged book paper, and terracotta accents.',
    bg: '#f4ebd9',
    fg: '#382b1d',
    border: '#9c8369',
  },
  {
    id: 'e-ink',
    name: 'E-Ink Monochrome',
    description: 'High-contrast pure black and white mimicking physical e-readers.',
    bg: '#ffffff',
    fg: '#000000',
    border: '#000000',
  },
  {
    id: 'cyber',
    name: 'Phosphor Cyber',
    description: 'Retro terminal dark mode with glowing green CRT phosphor text.',
    bg: '#090e09',
    fg: '#22c55e',
    border: '#22c55e',
  },
];

export default function ThemeModal({ isOpen, onClose, currentTheme = 'parchment', onThemeChange }) {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSelect = async (themeId) => {
    setSelectedTheme(themeId);
    if (onThemeChange) {
      onThemeChange(themeId);
    }
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="theme-modal-title"
      title="Theme & Aesthetic"
      icon={<Palette size={18} />}
      contentStyle={{ maxWidth: '32rem' }}
    >
      <div style={{ padding: 'var(--za-space-4) var(--za-space-6)' }}>
          <p style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-4)' }}>
            Choose a visual style. Your theme is saved to your account and syncs across all your devices.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-3)' }}>
            {THEMES.map((t) => {
              const isActive = selectedTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--za-space-3) var(--za-space-4)',
                    background: 'var(--za-color-surface)',
                    border: `2px solid ${isActive ? 'var(--za-color-accent)' : 'var(--za-color-border-decorative)'}`,
                    borderRadius: 'var(--za-radius-control)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all var(--za-motion-fast) var(--za-ease-standard)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--za-space-3)' }}>
                    {/* Theme Color Preview Swatch */}
                    <div
                      style={{
                        width: '2.2rem',
                        height: '2.2rem',
                        borderRadius: 'var(--za-radius-small)',
                        backgroundColor: t.bg,
                        border: `1.5px solid ${t.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: t.fg,
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        flexShrink: 0,
                      }}
                    >
                      Aa
                    </div>
                    <div>
                      <div style={{ fontWeight: 'var(--za-weight-heading)', fontSize: 'var(--za-text-base)', color: 'var(--za-color-text)' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginTop: '0.1rem' }}>
                        {t.description}
                      </div>
                    </div>
                  </div>
                  {isActive && <Check size={18} style={{ color: 'var(--za-color-text)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--za-space-5)' }}>
            <button type="button" className="za-button za-button--secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
    </ModalShell>
  );
}
