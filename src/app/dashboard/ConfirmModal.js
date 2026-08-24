'use client';

import { useEffect, useRef } from 'react';
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
  const modalRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const triggerElementRef = useRef(null);

  // Store the active element that opened the modal so focus can return to it
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
      // Focus confirm or cancel button when opened
      const timer = setTimeout(() => {
        if (confirmBtnRef.current) {
          confirmBtnRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (triggerElementRef.current) {
      triggerElementRef.current.focus?.();
    }
  }, [isOpen]);

  // Escape key handler and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

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
          <div className={`${styles.confirmIcon} ${isDanger ? styles.confirmIconDanger : styles.confirmIconPrimary}`}>
            {isDanger ? '⚠️' : 'ℹ️'}
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
