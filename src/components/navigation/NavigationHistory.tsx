'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const DEPTH_KEY = 'za:nav-depth';

function readDepth(): number {
  try {
    return Number(sessionStorage.getItem(DEPTH_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeDepth(depth: number) {
  try {
    sessionStorage.setItem(DEPTH_KEY, String(Math.max(0, depth)));
  } catch {
    // Storage can be unavailable (private mode); back buttons fall back to their href.
  }
}

/**
 * True when the previous history entry is a page inside zedarchive, so
 * router.back() will not leave the app (or do nothing in the installed PWA).
 */
export function hasInAppHistory(): boolean {
  return readDepth() > 0;
}

function arrivedFromOutside(): boolean {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (entry && entry.type !== 'navigate') return false;
  if (!document.referrer) return true;
  try {
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/**
 * Counts client-side navigations within the current tab. Pushes add one and
 * popstate (browser back) removes one; forward navigation also removes one,
 * which can only undercount and make back buttons use their safe href.
 */
export default function NavigationHistory() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);
  const popping = useRef(false);

  useEffect(() => {
    if (arrivedFromOutside()) writeDepth(0);
    const onPop = () => {
      popping.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const previous = lastPathname.current;
    lastPathname.current = pathname;
    if (previous === null || previous === pathname) return;
    writeDepth(readDepth() + (popping.current ? -1 : 1));
    popping.current = false;
  }, [pathname]);

  return null;
}
