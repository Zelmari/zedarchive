'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
  /** Specific element to focus on open */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Custom React hook for keyboard accessibility and focus trapping inside modals and dialogs.
 * - Captures the trigger element once per open transition and restores focus upon closing or unmount
 * - Traps Tab and Shift+Tab navigation within the container
 * - Handles Escape key presses via callback
 *
 * Visibility of candidate elements is detected via getClientRects() so
 * position: fixed elements are not wrongly excluded (offsetParent is null
 * for fixed-position nodes even when they are visible).
 */
export function useFocusTrap(
  isOpen: boolean,
  onEscape?: (e: globalThis.KeyboardEvent) => void,
  options: FocusTrapOptions = {}
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger exactly once per open transition.
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const initialFocusRef = optionsRef.current.initialFocusRef;
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (containerRef.current) {
        const focusable = getVisibleFocusable(containerRef.current);
        focusable[0]?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);

      // Restore focus whether the modal was closed via state or removed
      // from the tree entirely (unmount while still open).
      const previous = previousActiveElementRef.current;
      previousActiveElementRef.current = null;
      previous?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
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

        if (!firstElement || !lastElement) return;

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

function getVisibleFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}
