'use client';

import { useState, useEffect, useRef } from 'react';
import { BookmarkX } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { PRESET_DROP_REASONS, MAX_DROP_REASON_LENGTH } from '@/lib/constants';

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
  const modalRef = useFocusTrap(isOpen, onCancel, { initialFocusRef: inputRef });

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      setReason(initialReason || '');
    }
  }, [isOpen, initialReason]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: string) => {
    setReason(preset);
    inputRef.current?.focus();
  };

  const handleSave = () => {
    const trimmed = reason.trim().slice(0, MAX_DROP_REASON_LENGTH);
    onConfirm(trimmed.length > 0 ? trimmed : null);
  };

  const handleSkip = () => {
    onConfirm(null);
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[var(--za-layer-modal)] flex items-center justify-center bg-backdrop p-[var(--za-space-4)]"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        className="w-full max-w-[32rem] overflow-hidden rounded-layered border border-required bg-surface shadow-layered"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-reason-modal-title"
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
                Document why you stopped tracking this entry. You can pick a quick reason or type
                your own.
              </p>
            </div>
          </div>

          {/* Quick Preset Chips */}
          <div className="mt-[var(--za-space-4)]">
            <label className="mb-1.5 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted">
              Quick Reasons
            </label>
            <div className="flex flex-wrap gap-[var(--za-space-1)]">
              {PRESET_DROP_REASONS.map((preset) => {
                const isSelected = reason === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`cursor-pointer rounded-control border px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] transition-[all] duration-[var(--za-motion-fast)] ${
                      isSelected
                        ? 'border-required bg-surface-subtle font-[var(--za-weight-emphasis)] text-ink'
                        : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free-form Reason Input */}
          <div className="mt-[var(--za-space-4)]">
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="drop-reason-input"
                className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
              >
                Detailed Reason (Optional)
              </label>
              <span className="text-[length:var(--za-text-fine)] text-ink-muted">
                {reason.length}/{MAX_DROP_REASON_LENGTH}
              </span>
            </div>
            <input
              ref={inputRef}
              id="drop-reason-input"
              type="text"
              maxLength={MAX_DROP_REASON_LENGTH}
              placeholder="e.g. Lost interest after season 2..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-[var(--za-space-2)] text-[length:var(--za-text-body)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
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
      </div>
    </div>
  );
}
