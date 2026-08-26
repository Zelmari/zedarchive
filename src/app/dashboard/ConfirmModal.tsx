'use client';

import { useRef } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

export type ConfirmVariant = 'primary' | 'destructive' | 'danger' | 'secondary';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useFocusTrap(isOpen, onCancel, { initialFocusRef: confirmBtnRef });

  if (!isOpen) return null;

  const isDanger = variant === 'destructive' || variant === 'danger';

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[var(--za-layer-modal)] flex items-center justify-center bg-backdrop p-[var(--za-space-4)]"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="w-full max-w-[28rem] overflow-hidden rounded-layered border border-required bg-surface shadow-layered"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <div className="flex gap-[var(--za-space-4)] p-[var(--za-space-6)]">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-control border ${
              isDanger
                ? 'border-danger bg-danger-surface text-danger'
                : 'border-required bg-surface-subtle text-ink'
            }`}
          >
            {isDanger ? (
              <AlertTriangle size={20} strokeWidth={2} />
            ) : (
              <Info size={20} strokeWidth={2} />
            )}
          </div>
          <div>
            <h2
              id="confirm-modal-title"
              className="mb-[var(--za-space-1)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
            >
              {title}
            </h2>
            <p
              id="confirm-modal-message"
              className="text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-[var(--za-space-3)] border-t border-decorative bg-surface-subtle px-[var(--za-space-6)] py-[var(--za-space-4)]">
          <button type="button" className="za-button za-button--secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`za-button ${isDanger ? 'za-button--destructive' : 'za-button--primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
