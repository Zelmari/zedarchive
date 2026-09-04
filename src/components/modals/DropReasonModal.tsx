'use client';

import { useState, useEffect, useRef } from 'react';
import { BookmarkX } from 'lucide-react';
import { MAX_DROP_REASON_LENGTH } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import { DropReasonPicker } from '@/components/ui/media-controls';

interface DropReasonModalProps {
  isOpen: boolean;
  itemTitle?: string;
  initialReason?: string | null;
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
}

export default function DropReasonModal({
  isOpen,
  itemTitle,
  initialReason = '',
  onConfirm,
  onCancel,
}: DropReasonModalProps) {
  const [reason, setReason] = useState(initialReason || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      setReason(initialReason || '');
    }
  }, [isOpen, initialReason]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = reason.trim().slice(0, MAX_DROP_REASON_LENGTH);
    onConfirm(trimmed.length > 0 ? trimmed : null);
  };

  const handleSkip = () => {
    onConfirm(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      labelledBy="drop-reason-modal-title"
      initialFocusRef={inputRef}
      contentClassName="max-w-[36rem] overflow-hidden"
    >
      <div className="za-bookplate relative rounded-none border-0 p-[var(--za-space-6)] shadow-none">
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <div className="flex items-start gap-[var(--za-space-4)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-small border border-danger/30 bg-danger-surface text-danger">
            <BookmarkX size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="drop-reason-modal-title"
              className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
            >
              Drop {itemTitle ? `"${itemTitle}"` : 'Media'}
            </h2>
            <p className="mt-[var(--za-space-1)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
              Document why you stopped tracking this entry. You can pick a quick reason or type your
              own.
            </p>
          </div>
        </div>

        <DropReasonPicker
          className="mt-[var(--za-space-4)]"
          inputId="drop-reason-input"
          inputRef={inputRef}
          label="Detailed Reason (Optional)"
          quickLabel="Quick Reasons"
          value={reason}
          onChange={(value) => {
            setReason(value);
            inputRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            }
          }}
          presetClassName="rounded-small border-decorative bg-surface px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] text-ink-muted"
          activePresetClassName="border-danger bg-danger-surface text-danger"
          inputClassName="za-field"
        />
      </div>

      {/* Modal Actions */}
      <div className="flex flex-col-reverse gap-[var(--za-space-3)] border-t border-decorative bg-surface-subtle px-[var(--za-space-4)] py-[var(--za-space-4)] sm:flex-row sm:items-center sm:justify-between sm:px-[var(--za-space-6)]">
        <button
          type="button"
          className="za-button za-button--secondary w-full text-[length:var(--za-text-fine)] sm:w-auto"
          onClick={handleSkip}
        >
          Drop without reason
        </button>
        <div className="flex w-full flex-wrap gap-[var(--za-space-2)] sm:w-auto sm:justify-end">
          <button
            type="button"
            className="za-button za-button--secondary min-w-0 flex-1 text-[length:var(--za-text-fine)] sm:flex-none"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="za-button za-button--primary min-w-0 flex-1 text-[length:var(--za-text-fine)] sm:flex-none"
            onClick={handleSave}
          >
            Confirm Drop
          </button>
        </div>
      </div>
    </Modal>
  );
}
