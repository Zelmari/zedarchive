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
      contentClassName="max-w-[32rem] overflow-hidden"
    >
      <div className="p-[var(--za-space-6)]">
        <div className="flex items-start gap-[var(--za-space-4)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-required bg-surface-subtle text-ink">
            <BookmarkX size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="drop-reason-modal-title"
              className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
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
          presetClassName="rounded-control border-decorative bg-surface px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] text-ink-muted"
          inputClassName="w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-body)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Modal Actions */}
      <div className="flex items-center justify-between border-t border-decorative bg-surface-subtle px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <button
          type="button"
          className="za-button za-button--secondary text-[length:var(--za-text-fine)]"
          onClick={handleSkip}
        >
          Drop without reason
        </button>
        <div className="flex gap-[var(--za-space-2)]">
          <button
            type="button"
            className="za-button za-button--secondary text-[length:var(--za-text-fine)]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="za-button za-button--primary text-[length:var(--za-text-fine)]"
            onClick={handleSave}
          >
            Confirm Drop
          </button>
        </div>
      </div>
    </Modal>
  );
}
