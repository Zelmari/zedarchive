'use client';

import { X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { cn } from '@/lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  placement?: 'center' | 'top';
  labelledBy?: string;
  ariaLabel?: string;
  describedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  title?: string;
  icon?: ReactNode;
  header?: ReactNode;
  /** Extra classes MERGED onto the default panel (widths etc.); conflicts resolve in favor of these. */
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  closeLabel?: string;
  layer?: 'modal' | 'nested';
  children: ReactNode;
}

const DEFAULT_PANEL =
  'za-modal-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-small border-2 border-required bg-surface shadow-layered';

/**
 * Shared modal frame: focus-trapped dialog with backdrop, standard header,
 * and close button. Styled with Tailwind utilities mapped to design tokens.
 */
export default function Modal({
  isOpen,
  onClose,
  placement = 'center',
  labelledBy,
  ariaLabel,
  describedBy,
  initialFocusRef,
  title,
  icon = null,
  header = null,
  contentClassName,
  contentStyle,
  closeLabel = 'Close modal',
  layer = 'modal',
  children,
}: ModalProps) {
  const modalRef = useFocusTrap(isOpen, onClose, { initialFocusRef });
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  if (process.env.NODE_ENV !== 'production' && !labelledBy && !ariaLabel && !title) {
    console.warn('Modal is missing an accessible name (labelledBy, ariaLabel, or title)');
  }

  const showHeader = Boolean(title || header);

  return (
    <div
      className={cn(
        'za-modal-backdrop animate-fade-in fixed inset-0 flex justify-center bg-backdrop p-[var(--za-space-4)]',
        layer === 'nested' ? 'z-[var(--za-layer-nested-modal)]' : 'z-[var(--za-layer-modal)]',
        placement === 'top' ? 'items-start pt-[12vh]' : 'items-center',
      )}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={cn(DEFAULT_PANEL, contentClassName)}
        style={contentStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
      >
        {showHeader && (
          <div className="flex items-start justify-between gap-3 border-b border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
            {header ?? (
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {icon}
                <h2
                  id={labelledBy}
                  className="min-w-0 break-words text-[length:var(--za-text-heading-md)] font-[var(--za-font-display)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
                >
                  {title}
                </h2>
              </div>
            )}
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className="za-modal-close shrink-0"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        {!showHeader && (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="za-modal-close absolute right-3 top-3 z-10"
          >
            <X size={18} strokeWidth={2} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
