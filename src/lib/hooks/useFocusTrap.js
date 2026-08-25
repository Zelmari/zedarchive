'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Custom React hook for keyboard accessibility and focus trapping inside modals and dialogs.
 * - Captures the trigger element once per open transition and restores focus upon closing or unmount
 * - Traps Tab and Shift+Tab navigation within the container
 * - Handles Escape key presses via callback
 *
 * Visibility of candidate elements is detected via getClientRects() so
 * position: fixed elements are not wrongly excluded (offsetParent is null
 * for fixed-position nodes even when they are visible).
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
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger exactly once per open transition.
    previousActiveElementRef.current = document.activeElement;

    const timer = setTimeout(() => {
      const initialFocusRef = optionsRef.current?.initialFocusRef;
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (containerRef.current) {
        const focusable = getVisibleFocusable(containerRef.current);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);

      // Restore focus whether the modal was closed via state or removed
      // from the tree entirely (unmount while still open).
      const previous = previousActiveElementRef.current;
      previousActiveElementRef.current = null;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [isOpen]);

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
        const focusable = getVisibleFocusable(containerRef.current);

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

function getVisibleFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}
