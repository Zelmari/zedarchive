import { describe, it, expect } from 'vitest';
import { isCardLayout, DEFAULT_CARD_LAYOUT } from '@/hooks/use-card-layout';

describe('isCardLayout', () => {
  it('accepts the known archive card styles', () => {
    expect(isCardLayout('row')).toBe(true);
    expect(isCardLayout('poster')).toBe(true);
    expect(DEFAULT_CARD_LAYOUT).toBe('row');
  });

  it('rejects unknown values', () => {
    expect(isCardLayout('grid')).toBe(false);
    expect(isCardLayout('')).toBe(false);
    expect(isCardLayout(null)).toBe(false);
    expect(isCardLayout(undefined)).toBe(false);
  });
});
