'use client';

import { useEffect } from 'react';
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
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
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
        ✕
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
