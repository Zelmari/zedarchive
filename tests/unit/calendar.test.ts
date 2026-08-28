import { describe, it, expect } from 'vitest';
import { buildWeeklySchedule, ORDERED_DAYS } from '@/lib/calendar';
import type { MediaEntry, NextAirMap } from '@/types/media';

const baseEntry = (
  id: string,
  title: string,
  category: 'show' | 'anime',
  sourceId: string,
): MediaEntry => ({
  id,
  userId: 'u1',
  title,
  category,
  status: 'in_progress',
  dropReason: null,
  droppedAt: null,
  droppedProgressPrimary: null,
  droppedProgressSecondary: null,
  priorityIndex: null,
  cycles: [],
  primaryUnitCurrent: 1,
  primaryUnitTotal: 1,
  secondaryUnitCurrent: 1,
  secondaryUnitTotal: 10,
  structure: [],
  completedAt: null,
  startedAt: null,
  rewatchCount: 0,
  rating: null,
  tags: [],
  genres: [],
  synopsis: null,
  coverImage: null,
  sourceId,
  notes: null,
  quotes: [],
  isPrivate: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('buildWeeklySchedule', () => {
  it('groups entries into correct days of the week', () => {
    const entries: MediaEntry[] = [
      baseEntry('1', 'Severance', 'show', 'tvmaze-100'),
      baseEntry('2', 'Frieren', 'anime', 'anilist-200'),
    ];

    // Monday August 24, 2026 & Friday August 28, 2026
    const airMap: NextAirMap = {
      'tvmaze-100': {
        season: 2,
        number: 5,
        airdate: '2026-08-24',
        airstamp: '2026-08-24T20:00:00Z',
        status: 'Running',
      },
      'anilist-200': {
        season: 1,
        number: 18,
        airdate: '2026-08-28',
        airstamp: '2026-08-28T15:30:00Z',
        status: 'RELEASING',
      },
    };

    const refDate = new Date('2026-08-28T00:00:00Z');
    const schedule = buildWeeklySchedule(entries, airMap, refDate);

    expect(schedule.Monday).toHaveLength(1);
    expect(schedule.Monday[0]?.media.title).toBe('Severance');
    expect(schedule.Monday[0]?.airInfo.number).toBe(5);

    expect(schedule.Friday).toHaveLength(1);
    expect(schedule.Friday[0]?.media.title).toBe('Frieren');
    expect(schedule.Friday[0]?.isToday).toBe(true);

    expect(schedule.Tuesday).toHaveLength(0);
    expect(schedule.Wednesday).toHaveLength(0);
  });

  it('handles entries without air dates gracefully', () => {
    const entries: MediaEntry[] = [baseEntry('1', 'Unknown Show', 'show', 'tvmaze-999')];
    const airMap: NextAirMap = {
      'tvmaze-999': null,
    };

    const schedule = buildWeeklySchedule(entries, airMap);
    for (const day of ORDERED_DAYS) {
      expect(schedule[day]).toHaveLength(0);
    }
  });
});
