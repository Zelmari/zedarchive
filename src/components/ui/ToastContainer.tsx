'use client';

import { useEffect } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';

export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <Check size={16} strokeWidth={2.2} />;
      case 'error':
        return <X size={16} strokeWidth={2.2} />;
      case 'warning':
        return <AlertTriangle size={16} strokeWidth={2} />;
      default:
        return <Info size={16} strokeWidth={2} />;
    }
  };

  const toneClass = clsx(
    toast.type === 'error' && 'text-danger',
    toast.type === 'success' && 'text-success',
    toast.type === 'warning' && 'text-warning',
    (!toast.type || toast.type === 'info') && 'text-gold-dark',
  );

  const surfaceClass = clsx(
    toast.type === 'error' && 'border-danger bg-danger-surface',
    toast.type === 'success' && 'border-success bg-success-surface',
    toast.type === 'warning' && 'border-warning bg-warning-surface',
    (!toast.type || toast.type === 'info') && 'border-gold bg-surface-subtle',
  );

  return (
    <div
      className={clsx(
        'za-toast animate-slide-in-toast pointer-events-auto flex items-center gap-[var(--za-space-3)] rounded-small border border-required bg-surface px-[var(--za-space-4)] py-[var(--za-space-3)] text-ink shadow-layered',
        surfaceClass,
      )}
      role="status"
      aria-live="polite"
    >
      <span className={clsx('flex shrink-0 items-center justify-center', toneClass)}>
        {getIcon()}
      </span>
      <span className="flex-1 text-[length:var(--za-text-supporting)] leading-[var(--za-leading-compact)] text-ink">
        {toast.message}
      </span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="za-icon-hit cursor-pointer rounded-small p-0 text-ink-muted hover:text-ink"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts?: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts = [], onDismiss }: ToastContainerProps) {
  // The live region must exist in the DOM before the first toast appears,
  // otherwise screen readers can miss the announcement.
  return (
    <div
      className="pointer-events-none fixed bottom-[var(--za-space-6)] right-[var(--za-space-6)] z-[var(--za-layer-modal)] flex w-[calc(100%-3rem)] max-w-[360px] flex-col gap-[var(--za-space-2)]"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
