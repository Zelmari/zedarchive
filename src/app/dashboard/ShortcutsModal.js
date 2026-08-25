'use client';

import { Keyboard } from 'lucide-react';
import ModalShell from './ModalShell';
import styles from './dashboard.module.css';

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
];

export default function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="shortcuts-modal-title"
      contentClassName={styles.shortcutsModalContent}
      closeLabel="Close shortcuts dialog"
      header={
        <div className={styles.shortcutsHeaderLeft}>
          <span className={styles.shortcutsIcon}>
            <Keyboard size={18} strokeWidth={1.75} />
          </span>
          <h2 id="shortcuts-modal-title" className={styles.modalTitle}>
            Keyboard Shortcuts
          </h2>
        </div>
      }
    >
        <div className={styles.shortcutsBody}>
          <div className={styles.shortcutsGrid}>
            {SHORTCUTS.map((s, idx) => (
              <div key={idx} className={styles.shortcutRow}>
                <span className={styles.shortcutDesc}>{s.description}</span>
                <div className={styles.shortcutKeys}>
                  {s.altKey && (
                    <>
                      <kbd className={styles.kbd}>{s.altKey}</kbd>
                      <span className={styles.shortcutOr}>or</span>
                    </>
                  )}
                  <kbd className={styles.kbd}>{s.key}</kbd>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className="za-button za-button--secondary"
            onClick={onClose}
            autoFocus
          >
            Got it (Esc)
          </button>
        </div>
    </ModalShell>
  );
}
