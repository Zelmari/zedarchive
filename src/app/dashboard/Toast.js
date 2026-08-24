'use client';

import { useEffect } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import styles from './dashboard.module.css';

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

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

  return (
    <div
      className={`${styles.toastItem} ${
        toast.type === 'error'
          ? styles.toastError
          : toast.type === 'success'
          ? styles.toastSuccess
          : toast.type === 'warning'
          ? styles.toastWarning
          : styles.toastInfo
      }`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.toastIcon}>{getIcon()}</span>
      <span className={styles.toastMessage}>{toast.message}</span>
      <button
        type="button"
        className={styles.toastCloseBtn}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer} aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
