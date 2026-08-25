'use client';

import { X } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

/**
 * Shared modal frame: focus-trapped dialog with backdrop, standard header,
 * and close button. Content is provided via children.
 *
 * @param {boolean}   isOpen          When false nothing renders.
 * @param {Function}  onClose         Dismiss handler (backdrop click, Esc via
 *                                    focus trap, and the ✕ button).
 * @param {string}    labelledBy      id of the heading element for aria-labelledby.
 * @param {string}    [title]         Header text; omit when passing `header`.
 * @param {React.Node}[icon]          Optional icon rendered before the title.
 * @param {React.Node}[header]        Fully custom left side of the header.
 * @param {string}    [contentClassName] Overrides the default panel class.
 * @param {object}    [contentStyle]  Extra inline styles for the panel.
 * @param {string}    [closeLabel]    Accessible label for the ✕ button.
 */
export default function ModalShell({
  isOpen,
  onClose,
  labelledBy,
  title,
  icon = null,
  header = null,
  contentClassName,
  contentStyle,
  closeLabel = 'Close modal',
  children,
}) {
  const modalRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const showHeader = Boolean(title || header);

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={contentClassName || styles.modalContent}
        style={contentStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {showHeader && (
          <div className={styles.modalHeader}>
            {header ?? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {icon}
                <h2 id={labelledBy} className={styles.modalTitle}>
                  {title}
                </h2>
              </div>
            )}
            <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label={closeLabel}>
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
