'use client';

import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
  position: string;
  top: string;
  width: string;
  overflow: string;
} | null = null;

function applyLock() {
  savedScrollY = window.scrollY;
  savedStyles = {
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    overflow: document.body.style.overflow,
  };
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function releaseLock() {
  if (!savedStyles) return;
  document.body.style.position = savedStyles.position;
  document.body.style.top = savedStyles.top;
  document.body.style.width = savedStyles.width;
  document.body.style.overflow = savedStyles.overflow;
  window.scrollTo(0, savedScrollY);
  savedStyles = null;
}

export function useBodyScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    if (lockCount === 0) {
      applyLock();
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        releaseLock();
      }
    };
  }, [isOpen]);
}
