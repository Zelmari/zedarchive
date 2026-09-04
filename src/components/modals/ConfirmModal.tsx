'use client';

import { useRef } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import Modal from '@/components/ui/Modal';

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

  if (!isOpen) return null;

  const isDanger = variant === 'destructive' || variant === 'danger';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      labelledBy="confirm-modal-title"
      describedBy="confirm-modal-message"
      initialFocusRef={confirmBtnRef}
      contentClassName="max-w-[28rem] overflow-hidden"
    >
      <div className="flex gap-[var(--za-space-4)] bg-surface p-[var(--za-space-6)]">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-small border ${
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
            className="mb-[var(--za-space-1)] font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
          >
            {title}
          </h2>
          <p
            id="confirm-modal-message"
            className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted"
          >
            {message}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-[var(--za-space-3)] border-t border-decorative bg-surface-sunken px-[var(--za-space-6)] py-[var(--za-space-4)]">
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
    </Modal>
  );
}
