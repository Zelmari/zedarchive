'use client';

import { useState } from 'react';

export type ModalName = 'add' | 'theme' | 'activity' | 'share' | 'stats' | 'data';

/**
 * Single source of truth for which dashboard modal is open.
 */
export function useModalManager() {
  const [openModal, setOpenModal] = useState<ModalName | null>(null);

  const isOpen = (name: ModalName) => openModal === name;
  const open = (name: ModalName) => setOpenModal(name);
  const close = () => setOpenModal(null);
  const anyOpen = openModal !== null;

  return { openModal, isOpen, open, close, anyOpen };
}
