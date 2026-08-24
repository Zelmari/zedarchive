'use client';

import { useRef } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null);
  const modalRef = useFocusTrap(isOpen, onCancel, { initialFocusRef: confirmBtnRef });

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div className={styles.modalBackdrop} onClick={onCancel}>
      <div
        ref={modalRef}
        className={styles.confirmModalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <div className={styles.confirmModalHeader}>
          <div
            className={`${styles.confirmIcon} ${
              isDanger ? styles.confirmIconDanger : styles.confirmIconPrimary
            }`}
          >
            {isDanger ? (
              <AlertTriangle size={20} strokeWidth={2} />
            ) : (
              <Info size={20} strokeWidth={2} />
            )}
          </div>
          <div>
            <h2 id="confirm-modal-title" className={styles.confirmModalTitle}>
              {title}
            </h2>
            <p id="confirm-modal-message" className={styles.confirmModalMessage}>
              {message}
            </p>
          </div>
        </div>

        <div className={styles.confirmModalFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={isDanger ? styles.confirmDangerBtn : styles.submitBtn}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
