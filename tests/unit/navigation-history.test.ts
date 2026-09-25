import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasInAppHistory } from '@/components/navigation/NavigationHistory';

describe('hasInAppHistory', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false on a fresh tab so back buttons use their fallback href', () => {
    expect(hasInAppHistory()).toBe(false);
  });

  it('is true once an in-app navigation has been recorded', () => {
    store.set('za:nav-depth', '2');
    expect(hasInAppHistory()).toBe(true);
  });

  it('is false when storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(hasInAppHistory()).toBe(false);
  });
});
