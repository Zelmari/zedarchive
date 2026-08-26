'use client';

import { Keyboard } from 'lucide-react';
import Modal from '@/components/ui/Modal';

const SHORTCUTS = [
  { key: '1', description: 'Switch to Total View tab' },
  { key: '2', description: 'Switch to Shows & Anime tab' },
  { key: '3', description: 'Switch to Books & Manga tab' },
  { key: 'N', altKey: '⌘/Ctrl + K', description: 'Open Add Media dialog' },
  { key: '/', description: 'Focus archive search input' },
  { key: 'T', description: 'Open Theme & Aesthetic palette' },
  { key: 'S', description: 'Open Archive Statistics' },
  { key: 'B', description: 'Open Backup & Data Sovereignty' },
  { key: '↑ / ↓', description: 'Navigate search suggestions' },
  { key: 'Enter', description: 'Select search suggestion / submit' },
  { key: 'Tab', description: 'Cycle through controls on cards' },
  { key: 'Esc', description: 'Close modal or search dropdown' },
  { key: '?', description: 'Toggle this keyboard shortcut helper' },
] as const;

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const kbdClass =
    'rounded-small border border-required bg-surface-subtle px-2 py-[0.2rem] text-[length:var(--za-text-fine)] font-semibold text-ink [font-family:inherit]';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="shortcuts-modal-title"
      closeLabel="Close shortcuts dialog"
      contentClassName="w-full max-w-[32rem] overflow-hidden rounded-layered border border-required bg-surface shadow-layered"
      header={
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center text-ink">
            <Keyboard size={18} strokeWidth={1.75} />
          </span>
          <h2
            id="shortcuts-modal-title"
            className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
          >
            Keyboard Shortcuts
          </h2>
        </div>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <div className="flex flex-col gap-[var(--za-space-3)]">
          {SHORTCUTS.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-[var(--za-space-4)] border-b border-decorative pb-2"
            >
              <span className="text-[length:var(--za-text-supporting)] text-ink">
                {s.description}
              </span>
              <div className="flex shrink-0 items-center gap-[var(--za-space-1)]">
                {'altKey' in s && s.altKey && (
                  <>
                    <kbd className={kbdClass}>{s.altKey}</kbd>
                    <span className="text-[length:var(--za-text-fine)] text-ink-muted">or</span>
                  </>
                )}
                <kbd className={kbdClass}>{s.key}</kbd>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-[var(--za-space-3)] border-t border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <button
          type="button"
          className="za-button za-button--secondary"
          onClick={onClose}
          autoFocus
        >
          Got it (Esc)
        </button>
      </div>
    </Modal>
  );
}
