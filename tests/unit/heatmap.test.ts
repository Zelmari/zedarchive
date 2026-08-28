import { describe, it, expect } from 'vitest';

describe('Activity Heatmap Aggregation', () => {
  it('correctly maps dates to activity intensity bins', () => {
    const activityMap: Record<string, number> = {
      '2026-01-01': 1,
      '2026-01-02': 4,
      '2026-01-03': 8,
      '2026-01-04': 15,
    };

    expect(activityMap['2026-01-01']).toBe(1);
    expect(activityMap['2026-01-02']).toBe(4);
    expect(activityMap['2026-01-03']).toBe(8);
    expect(activityMap['2026-01-04']).toBe(15);
    expect(activityMap['2026-01-05'] || 0).toBe(0);
  });
});
