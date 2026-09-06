'use client';

import { useCallback, useState } from 'react';

export const CARD_LAYOUTS = ['poster', 'row'] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];

export const CARD_LAYOUT_STORAGE_KEY = 'za-card-layout';
export const DEFAULT_CARD_LAYOUT: CardLayout = 'row';

export function isCardLayout(value: string | null | undefined): value is CardLayout {
  return value === 'poster' || value === 'row';
}

/**
 * Archive card layout preference. Style 1 (`row`) is the default:
 * cover on the left, catalogue copy on the right. `poster` keeps the
 * previous full-bleed 2:3 cover stack so we can compare styles 1-by-1.
 */
export function useCardLayout() {
  const [layout, setLayoutState] = useState<CardLayout>(() => {
    if (typeof window === 'undefined') return DEFAULT_CARD_LAYOUT;
    try {
      const stored = localStorage.getItem(CARD_LAYOUT_STORAGE_KEY);
      return isCardLayout(stored) ? stored : DEFAULT_CARD_LAYOUT;
    } catch {
      return DEFAULT_CARD_LAYOUT;
    }
  });

  const setLayout = useCallback((next: CardLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(CARD_LAYOUT_STORAGE_KEY, next);
    } catch {
      // Ignored
    }
  }, []);

  return { layout, setLayout };
}
