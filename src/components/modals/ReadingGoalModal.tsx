'use client';

import { useState, useEffect, useRef } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import type { ReadingGoalConfig } from '@/types/user';

interface ReadingGoalModalProps {
  isOpen: boolean;
  year: number;
  currentGoal?: ReadingGoalConfig | null;
  onSave: (year: number, annualTarget: number, isPublic: boolean) => Promise<void>;
  onDelete?: (year: number) => Promise<void>;
  onClose: () => void;
}

const PRESET_TARGETS = [12, 24, 36, 52, 100];

export default function ReadingGoalModal({
  isOpen,
  year,
  currentGoal,
  onSave,
  onDelete,
  onClose,
}: ReadingGoalModalProps) {
  const [targetInput, setTargetInput] = useState<string>(
    currentGoal?.annualTarget ? String(currentGoal.annualTarget) : '24',
  );
  const [isPublic, setIsPublic] = useState<boolean>(currentGoal?.isPublic ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useFocusTrap(isOpen, onClose, { initialFocusRef: inputRef });

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      setTargetInput(currentGoal?.annualTarget ? String(currentGoal.annualTarget) : '24');
      setIsPublic(currentGoal?.isPublic ?? false);
      setError('');
    }
  }, [isOpen, currentGoal]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(targetInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 10000) {
      setError('Please enter a target between 1 and 10,000 books.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await onSave(year, parsed, isPublic);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reading goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsSaving(true);
    setError('');
    try {
      await onDelete(year);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove goal.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[var(--za-layer-modal)] flex items-center justify-center bg-backdrop p-[var(--za-space-4)]"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-[30rem] overflow-hidden rounded-layered border border-required bg-surface shadow-layered"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-goal-modal-title"
      >
        <form onSubmit={handleSave}>
          <div className="p-[var(--za-space-6)]">
            <div className="flex items-start gap-[var(--za-space-4)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-required bg-surface-subtle text-ink">
                <BookOpen size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="reading-goal-modal-title"
                  className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink"
                >
                  {year} Reading Challenge
                </h2>
                <p className="mt-[var(--za-space-1)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                  Set your annual book reading target to track your progress and pacing throughout{' '}
                  {year}.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-control bg-danger/10 p-2.5 text-xs text-danger">
                {error}
              </div>
            )}

            {/* Target input */}
            <div className="mt-[var(--za-space-4)]">
              <label
                htmlFor="goal-target-input"
                className="mb-1 block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
              >
                Annual Target (Books & Manga)
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id="goal-target-input"
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="za-field w-32 font-bold text-center text-base"
                />
                <span className="text-xs text-ink-muted">books in {year}</span>
              </div>
            </div>

            {/* Preset chips */}
            <div className="mt-3">
              <span className="text-[11px] text-ink-muted">Quick Presets:</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PRESET_TARGETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargetInput(String(t))}
                    className={`cursor-pointer rounded-small border px-2 py-0.5 text-xs transition-[all] ${
                      targetInput === String(t)
                        ? 'border-accent bg-accent/15 font-[var(--za-weight-emphasis)] text-accent'
                        : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
                    }`}
                  >
                    {t} books
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy toggle */}
            <div className="mt-5 flex items-center gap-2.5 rounded-control border border-decorative bg-surface-subtle p-3">
              <input
                type="checkbox"
                id="goal-public-toggle"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-decorative"
              />
              <label htmlFor="goal-public-toggle" className="cursor-pointer text-xs text-ink">
                Showcase this reading challenge on my public profile
              </label>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between border-t border-decorative bg-surface-subtle px-[var(--za-space-6)] py-[var(--za-space-4)]">
            {currentGoal ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                className="za-button za-button--secondary inline-flex items-center gap-1 text-xs text-danger/80 hover:text-danger"
              >
                <Trash2 size={13} />
                <span>Remove Goal</span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-[var(--za-space-2)]">
              <button
                type="button"
                className="za-button za-button--secondary text-xs"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="za-button za-button--primary text-xs"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save Challenge'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
