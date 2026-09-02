'use client';

import { useState, useEffect, useRef } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="reading-goal-modal-title"
      title={`${year} Reading Challenge`}
      icon={<BookOpen size={18} />}
      initialFocusRef={inputRef}
      contentClassName="max-w-[30rem] rounded-small"
    >
      <form onSubmit={handleSave}>
        <div className="p-[var(--za-space-6)]">
          <p className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
            Set an annual book and manga target to track your pace throughout {year}.
          </p>

          {error && (
            <div
              role="alert"
              className="za-notice za-notice--error mt-4 text-[length:var(--za-text-fine)]"
            >
              {error}
            </div>
          )}

          {/* Target input */}
          <div className="mt-[var(--za-space-5)] rounded-small border border-required bg-surface-sunken p-4">
            <label
              htmlFor="goal-target-input"
              className="mb-2 block font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-accent"
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
                className="za-field w-32 text-center font-[var(--za-font-display)] text-lg font-bold"
              />
              <span className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink-muted">
                works in {year}
              </span>
            </div>
          </div>

          {/* Preset chips */}
          <div className="mt-3">
            <span className="font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.08em] text-ink-muted">
              Quick Presets
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PRESET_TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetInput(String(t))}
                  className={`cursor-pointer rounded-small border px-2.5 py-1 font-[var(--za-font-display)] text-[0.68rem] font-bold uppercase tracking-[0.04em] transition-[all] ${
                    targetInput === String(t)
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-decorative bg-surface text-ink-muted hover:border-required hover:text-ink'
                  }`}
                >
                  {t} books
                </button>
              ))}
            </div>
          </div>

          {/* Privacy toggle */}
          <div className="mt-5 flex items-center gap-2.5 rounded-small border border-decorative bg-surface-subtle p-3">
            <input
              type="checkbox"
              id="goal-public-toggle"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 accent-[var(--za-color-accent)]"
            />
            <label
              htmlFor="goal-public-toggle"
              className="cursor-pointer font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink"
            >
              Showcase this reading challenge on my public profile
            </label>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between border-t border-decorative bg-surface-sunken px-[var(--za-space-6)] py-[var(--za-space-4)]">
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
    </Modal>
  );
}
