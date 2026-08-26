'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy?: string;
  title?: string;
  icon?: ReactNode;
  header?: ReactNode;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Shared modal frame: focus-trapped dialog with backdrop, standard header,
 * and close button. Styled with Tailwind utilities mapped to design tokens.
 */
export default function Modal({
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
}: ModalProps) {
  const modalRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const showHeader = Boolean(title || header);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[var(--za-layer-modal)] flex items-center justify-center bg-backdrop p-[var(--za-space-4)]"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={
          contentClassName ||
          'max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-layered border border-required bg-surface shadow-layered'
        }
        style={contentStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {showHeader && (
          <div className="flex items-center justify-between border-b border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
            {header ?? (
              <div className="flex items-center gap-2">
                {icon}
                <h2
                  id={labelledBy}
                  className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
                >
                  {title}
                </h2>
              </div>
            )}
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className="flex cursor-pointer items-center justify-center rounded-small p-[var(--za-space-1)] text-ink-muted hover:text-ink"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
