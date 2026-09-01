import type { MediaEntry, NextAirInfo } from '@/types/media';

export type DayOfWeek =
  'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface CalendarEpisodeItem {
  media: MediaEntry;
  airInfo: NextAirInfo;
  airDateObj: Date;
  dayOfWeek: DayOfWeek;
  isToday: boolean;
  timeString: string;
}

export type WeeklyCalendarSchedule = Record<DayOfWeek, CalendarEpisodeItem[]>;

export const ORDERED_DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const JS_DAY_INDEX_TO_NAME: Record<number, DayOfWeek> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function buildWeeklySchedule(
  entries: MediaEntry[],
  airMap: Record<string, NextAirInfo | null>,
  now = new Date(),
): WeeklyCalendarSchedule {
  const schedule: WeeklyCalendarSchedule = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };

  const todayStr = now.toDateString();

  for (const entry of entries) {
    if (!entry.sourceId) continue;
    const airInfo = airMap[entry.sourceId];
    if (!airInfo || !airInfo.airdate) continue;

    // Use airstamp if available for precise local time, fallback to airdate (UTC)
    const hasAirstamp = Boolean(airInfo.airstamp);
    const dateObj = new Date(airInfo.airstamp || `${airInfo.airdate}T00:00:00Z`);
    if (isNaN(dateObj.getTime())) continue;

    const dayName = hasAirstamp
      ? JS_DAY_INDEX_TO_NAME[dateObj.getDay()]
      : JS_DAY_INDEX_TO_NAME[dateObj.getUTCDay()];
    if (!dayName) continue;

    const isToday = hasAirstamp
      ? dateObj.toDateString() === now.toDateString()
      : airInfo.airdate === now.toISOString().slice(0, 10);

    const timeString = hasAirstamp
      ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'TBA';

    schedule[dayName].push({
      media: entry,
      airInfo,
      airDateObj: dateObj,
      dayOfWeek: dayName,
      isToday,
      timeString,
    });
  }

  // Sort each day's list chronologically by airtime
  for (const day of ORDERED_DAYS) {
    schedule[day].sort((a, b) => a.airDateObj.getTime() - b.airDateObj.getTime());
  }

  return schedule;
}
