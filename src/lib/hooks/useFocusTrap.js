'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom React hook for keyboard accessibility and focus trapping inside modals and dialogs.
 * - Captures the trigger element and restores focus upon closing
 * - Traps Tab and Shift+Tab navigation within the container
 * - Handles Escape key presses via callback
 *
 * @param {boolean} isOpen - Whether the modal/dialog is currently open
 * @param {Function} [onEscape] - Callback function invoked on Escape key press
 * @param {Object} [options] - Additional options
 * @param {React.RefObject} [options.initialFocusRef] - Specific element ref to focus on open
 * @returns {React.RefObject} Ref to attach to the modal container element
 */
export function useFocusTrap(isOpen, onEscape, options = {}) {
  const containerRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement;

      const timer = setTimeout(() => {
        if (options.initialFocusRef?.current) {
          options.initialFocusRef.current.focus();
        } else if (containerRef.current) {
          const focusable = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);

      return () => clearTimeout(timer);
    } else {
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    }
  }, [isOpen, options.initialFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onEscape) {
          e.preventDefault();
          onEscape(e);
        }
        return;
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = Array.from(
          containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null); // only visible elements

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onEscape]);

  return containerRef;
}
