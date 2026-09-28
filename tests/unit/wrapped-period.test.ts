import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  DEFAULT_WRAPPED_PERIOD,
  WRAPPED_PERIODS,
  describeWrappedRange,
  getWrappedPeriodOption,
  isWithinWrappedRange,
  parseWrappedPeriod,
  resolveWrappedRange,
  tallyWrappedBuckets,
  wrappedPeriodAnchor,
  type WrappedPeriod,
  type WrappedRange,
} from '@/lib/wrapped-period';

/** Fixed "now" for every window assertion: Monday 28 September 2026, midday local time. */
const now = new Date(2026, 8, 28, 12, 0, 0);

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const HOUR = 60 * 60 * 1000;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Build a local-time Date, so no assertion depends on the runner's timezone offset. */
const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date =>
  new Date(year, month, day, hour, minute, second, 0);

const iso = (date: Date): string => date.toISOString();

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Monday-first weekday name, matching the axis the module labels its day buckets with. */
const weekdayName = (date: Date): string => WEEKDAY_NAMES[(date.getDay() + 6) % 7] ?? '';

/** The label the module gives a week bucket that begins on `date`. */
const weekBucketLabel = (date: Date): string => `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;

/** Independently derive the Monday-start week buckets that should cover `range`. */
const expectedWeekLabels = (range: WrappedRange): string[] => {
  const first = startOfDay(range.start);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const labels: string[] = [];
  for (
    let cursor = new Date(first.getTime());
    cursor.getTime() <= range.end.getTime();
    cursor.setDate(cursor.getDate() + 7)
  ) {
    labels.push(weekBucketLabel(cursor));
  }
  return labels;
};

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** The calendar days a range covers, counted with local date arithmetic. */
const calendarDays = (range: WrappedRange): string[] => {
  const days: string[] = [];
  for (
    const cursor = startOfDay(range.start);
    cursor.getTime() <= range.end.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push(cursor.toDateString());
  }
  return days;
};

/** Two in-range dates per period, chosen to land inside that period's own axis. */
const inRangeByPeriod: Record<WrappedPeriod, Date[]> = {
  year: [local(2025, 8, 28, 12), local(2026, 2, 15, 12)],
  quarter: [local(2026, 5, 28, 12), local(2026, 7, 15, 12)],
  month: [local(2026, 7, 28, 12), local(2026, 8, 15, 9)],
  week: [local(2026, 8, 22, 12), local(2026, 8, 24, 9)],
};

const PERIODS: WrappedPeriod[] = ['year', 'quarter', 'month', 'week'];

/** Every year the injected `now` treats as a past edition. */
const PAST_YEARS: number[] = Array.from({ length: 36 }, (_, index) => 1990 + index);

/**
 * A week's Monday-Sunday alignment is never considered: a week is always the
 * trailing seven days at the edition's anchor, so the weekday axis is rotated by
 * that anchor's weekday for every edition. This split exists only to name the
 * years whose 31 December is a Sunday, where a contained week used to be chosen.
 */
const SUNDAY_ENDING_YEARS: number[] = PAST_YEARS.filter(
  (year) => new Date(year, 11, 31).getDay() === 0,
);
const NON_SUNDAY_ENDING_YEARS: number[] = PAST_YEARS.filter(
  (year) => new Date(year, 11, 31).getDay() !== 0,
);

/** The last whole calendar year, used to check a past edition resolves to it exactly. */
const closedCalendarYear = (year: number): WrappedRange => ({
  start: new Date(year, 0, 1, 0, 0, 0, 0),
  end: new Date(year, 11, 31, 23, 59, 59, 999),
});

/** The close of a year, which is also the anchor a past edition falls back to. */
const yearEndAnchor = (year: number): Date => new Date(year, 11, 31, 23, 59, 59, 999);

describe('parseWrappedPeriod', () => {
  it('defaults to the year view for missing, empty and unknown values', () => {
    expect(parseWrappedPeriod(undefined)).toBe('year');
    expect(parseWrappedPeriod(null)).toBe('year');
    expect(parseWrappedPeriod('')).toBe('year');
    expect(parseWrappedPeriod('decade')).toBe('year');
    expect(parseWrappedPeriod('YEAR')).toBe('year');
    expect(parseWrappedPeriod(' year')).toBe('year');
  });

  it('accepts every supported period id', () => {
    expect(parseWrappedPeriod('year')).toBe('year');
    expect(parseWrappedPeriod('quarter')).toBe('quarter');
    expect(parseWrappedPeriod('month')).toBe('month');
    expect(parseWrappedPeriod('week')).toBe('week');
  });

  it('takes the first entry of a string array', () => {
    expect(parseWrappedPeriod(['quarter'])).toBe('quarter');
    expect(parseWrappedPeriod(['month', 'week'])).toBe('month');
  });

  it('falls back for an empty array or an unknown array head', () => {
    expect(parseWrappedPeriod([])).toBe('year');
    expect(parseWrappedPeriod(['decade', 'week'])).toBe('year');
  });

  it('honours a custom fallback but still prefers a valid id', () => {
    expect(parseWrappedPeriod('decade', 'week')).toBe('week');
    expect(parseWrappedPeriod(undefined, 'month')).toBe('month');
    expect(parseWrappedPeriod('month', 'week')).toBe('month');
  });

  it('defaults to the exported default period', () => {
    expect(DEFAULT_WRAPPED_PERIOD).toBe('year');
  });
});

describe('getWrappedPeriodOption', () => {
  it('returns the option matching each supported id', () => {
    for (const option of WRAPPED_PERIODS) {
      expect(getWrappedPeriodOption(option.id)).toBe(option);
    }
    expect(getWrappedPeriodOption('year').shortLabel).toBe('1 yr');
    expect(getWrappedPeriodOption('quarter').granularity).toBe('by Week');
  });

  it('never returns undefined for a valid id', () => {
    for (const period of PERIODS) {
      const option = getWrappedPeriodOption(period);
      expect(option).toBeDefined();
      expect(option.id).toBe(period);
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.shortLabel.length).toBeGreaterThan(0);
      expect(option.granularity.length).toBeGreaterThan(0);
    }
  });
});

describe('wrappedPeriodAnchor', () => {
  it('anchors the current year at the injected instant', () => {
    expect(wrappedPeriodAnchor(2026, now).getTime()).toBe(now.getTime());
  });

  it('anchors a future year at the injected instant too', () => {
    expect(wrappedPeriodAnchor(2027, now).getTime()).toBe(now.getTime());
  });

  it('anchors a past edition at the close of its December', () => {
    expect(wrappedPeriodAnchor(2023, now).getTime()).toBe(
      new Date(2023, 11, 31, 23, 59, 59, 999).getTime(),
    );
  });

  it('returns a copy rather than the injected date itself', () => {
    const anchor = wrappedPeriodAnchor(2026, now);
    anchor.setFullYear(1999);
    expect(now.getFullYear()).toBe(2026);
  });
});

describe('resolveWrappedRange', () => {
  it('resolves the current year as a trailing twelve-month window', () => {
    const range = resolveWrappedRange('year', 2026, now);
    expect(range.start.getTime()).toBe(local(2025, 8, 28, 12).getTime());
    expect(range.end.getTime()).toBe(now.getTime());
    const span = range.end.getTime() - range.start.getTime();
    expect(Math.abs(span - 365 * MS_PER_DAY)).toBeLessThanOrEqual(3 * HOUR);
  });

  it('resolves the trailing quarter, month and week windows from now', () => {
    const quarter = resolveWrappedRange('quarter', 2026, now);
    expect(quarter.start.getTime()).toBe(local(2026, 5, 28, 12).getTime());
    expect(quarter.end.getTime()).toBe(now.getTime());
    expect(
      Math.abs(quarter.end.getTime() - quarter.start.getTime() - 92 * MS_PER_DAY),
    ).toBeLessThanOrEqual(3 * HOUR);

    const month = resolveWrappedRange('month', 2026, now);
    expect(month.start.getTime()).toBe(local(2026, 7, 28, 12).getTime());
    expect(month.end.getTime()).toBe(now.getTime());
    expect(
      Math.abs(month.end.getTime() - month.start.getTime() - 31 * MS_PER_DAY),
    ).toBeLessThanOrEqual(3 * HOUR);

    // Six day-increments between inclusive bounds is exactly seven calendar days.
    const week = resolveWrappedRange('week', 2026, now);
    expect(week.start.getTime()).toBe(local(2026, 8, 22, 12).getTime());
    expect(week.end.getTime()).toBe(now.getTime());
    expect(week.end.getTime() - week.start.getTime()).toBe(6 * MS_PER_DAY);
  });

  it('resolves the week window to seven inclusive calendar days', () => {
    // The same seven-day rule holds for a running edition and for every past one.
    const anchors: Date[] = [now, ...PAST_YEARS.map((year) => local(year, 11, 31, 12))];
    for (const anchor of anchors) {
      const range = resolveWrappedRange('week', anchor.getFullYear(), anchor);
      expect(calendarDays(range)).toHaveLength(7);
    }

    for (let day = 0; day < 365; day += 5) {
      const range = resolveWrappedRange('week', 2026, local(2026, 0, 1 + day, 12));
      expect(calendarDays(range)).toHaveLength(7);
    }
  });

  it('resolves a past edition year to the closed calendar year', () => {
    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('year', year, now);
      const expected = closedCalendarYear(year);
      expect(range.start.getTime()).toBe(expected.start.getTime());
      expect(range.end.getTime()).toBe(expected.end.getTime());
      expect(range.start.getDate()).toBe(1);
      expect(range.start.getMonth()).toBe(0);
      expect(range.start.getHours()).toBe(0);
      expect(range.end.getHours()).toBe(23);
    }
  });

  it('resolves a past edition quarter to the final quarter of that year', () => {
    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('quarter', year, now);
      expect(range.start.getTime()).toBe(new Date(year, 9, 1, 0, 0, 0, 0).getTime());
      expect(range.end.getTime()).toBe(yearEndAnchor(year).getTime());
    }
    expect(describeWrappedRange(resolveWrappedRange('quarter', 2023, now))).toBe(
      '1 Oct 2023 – 31 Dec 2023',
    );
  });

  it('resolves a past edition month to the final month of that year', () => {
    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('month', year, now);
      expect(range.start.getTime()).toBe(new Date(year, 11, 1, 0, 0, 0, 0).getTime());
      expect(range.end.getTime()).toBe(yearEndAnchor(year).getTime());
    }
  });

  it('resolves a past edition week to the trailing seven days ending 31 December', () => {
    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('week', year, now);
      expect(range.end.getTime()).toBe(yearEndAnchor(year).getTime());
      expect(range.start.getTime()).toBe(new Date(year, 11, 25, 23, 59, 59, 999).getTime());
      expect(range.end.getTime() - range.start.getTime()).toBe(6 * MS_PER_DAY);
      expect(range.start.getHours()).toBe(23);
      expect(range.end.getHours()).toBe(23);
    }
  });

  it('gives every edition the same week rule, anchored at its own end', () => {
    // A past edition anchors at the close of 31 December; the running edition at now.
    // Both then step back six days, so a week means the same thing everywhere.
    const past = resolveWrappedRange('week', 2021, now);
    const running = resolveWrappedRange('week', 2026, now);
    expect(past.end.getTime()).toBe(yearEndAnchor(2021).getTime());
    expect(running.end.getTime()).toBe(now.getTime());
    expect(past.end.getTime() - past.start.getTime()).toBe(
      running.end.getTime() - running.start.getTime(),
    );

    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('week', year, now);
      const days = calendarDays(range);
      expect(days).toHaveLength(7);
      expect(days[0]).toBe(startOfDay(range.start).toDateString());
      expect(days[6]).toBe(startOfDay(range.end).toDateString());
    }
  });

  it('never snaps a past edition week to a Monday', () => {
    // 2023 ends on a Sunday, so its final days really are Monday to Sunday; every
    // other past year gets the same trailing shape, and never a Monday midnight.
    for (const year of SUNDAY_ENDING_YEARS) {
      const range = resolveWrappedRange('week', year, now);
      expect(range.start.getTime()).toBe(new Date(year, 11, 25, 23, 59, 59, 999).getTime());
      expect(range.start.getHours()).toBe(23);
    }
    for (const year of NON_SUNDAY_ENDING_YEARS) {
      const range = resolveWrappedRange('week', year, now);
      expect(range.start.getTime()).toBe(new Date(year, 11, 25, 23, 59, 59, 999).getTime());
      expect(range.start.getHours()).toBe(23);
    }
  });

  it('clamps a 31 March anchor back to 28 February', () => {
    const march = new Date(2026, 2, 31, 12, 0, 0);
    const range = resolveWrappedRange('month', 2026, march);
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(1);
    expect(range.start.getDate()).toBe(28);
    expect(range.start.getTime()).toBe(new Date(2026, 1, 28, 12, 0, 0).getTime());
  });

  it('clamps a 31 March anchor back to 29 February in a leap year', () => {
    const leapMarch = new Date(2024, 2, 31, 12, 0, 0);
    const range = resolveWrappedRange('month', 2024, leapMarch);
    expect(range.start.getFullYear()).toBe(2024);
    expect(range.start.getMonth()).toBe(1);
    expect(range.start.getDate()).toBe(29);
    expect(range.start.getTime()).toBe(new Date(2024, 1, 29, 12, 0, 0).getTime());
  });

  it('clamps backwards too, from 29 February to 28 February', () => {
    const leapFebruary = new Date(2024, 1, 29, 12, 0, 0);
    const year = resolveWrappedRange('year', 2024, leapFebruary);
    expect(year.start.getTime()).toBe(new Date(2023, 1, 28, 12, 0, 0).getTime());
    const quarter = resolveWrappedRange('quarter', 2024, leapFebruary);
    expect(quarter.start.getTime()).toBe(new Date(2023, 10, 29, 12, 0, 0).getTime());
  });

  it('spans exactly seven calendar days across a DST change', () => {
    // Sweep a whole year of anchors so every DST transition in any timezone is covered.
    for (let day = 0; day < 365; day += 7) {
      const anchor = local(2026, 0, 1 + day, 12, 0);
      const range = resolveWrappedRange('week', 2026, anchor);
      const start = range.start;
      const seen = calendarDays(range);
      const expected: string[] = [];
      for (let offset = 0; offset < 7; offset++) {
        expected.push(
          local(start.getFullYear(), start.getMonth(), start.getDate() + offset).toDateString(),
        );
      }
      expect(seen).toEqual(expected);
      expect(seen).toHaveLength(7);
      expect(range.end.getHours()).toBe(start.getHours());
      expect(Math.abs(range.end.getTime() - start.getTime() - 6 * MS_PER_DAY)).toBeLessThanOrEqual(
        HOUR,
      );
    }
  });
});

describe('isWithinWrappedRange', () => {
  const range = resolveWrappedRange('month', 2026, now);

  it('accepts timestamps equal to either bound', () => {
    expect(isWithinWrappedRange(new Date(range.start.getTime()), range)).toBe(true);
    expect(isWithinWrappedRange(new Date(range.end.getTime()), range)).toBe(true);
  });

  it('rejects a millisecond outside either bound', () => {
    expect(isWithinWrappedRange(new Date(range.start.getTime() - 1), range)).toBe(false);
    expect(isWithinWrappedRange(new Date(range.end.getTime() + 1), range)).toBe(false);
  });

  it('accepts every instant in between', () => {
    expect(isWithinWrappedRange(local(2026, 8, 1, 0, 0), range)).toBe(true);
    expect(isWithinWrappedRange(local(2026, 8, 28, 0, 0), range)).toBe(true);
    expect(isWithinWrappedRange(local(2026, 7, 27, 23, 59), range)).toBe(false);
  });
});

describe('tallyWrappedBuckets for the year period', () => {
  const range = resolveWrappedRange('year', 2026, now);

  it('builds a bucket for every month a trailing window touches', () => {
    const buckets = tallyWrappedBuckets([], range, 'year');
    expect(buckets.labels).toEqual([
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
    ]);
    expect(buckets.values).toHaveLength(13);
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.values.every((value) => value === 0)).toBe(true);
    expect(buckets.labelStep).toBe(1);
    expect(buckets.chartTitle).toBe('Completions by Month');
  });

  it('builds exactly twelve buckets for a closed calendar year', () => {
    const buckets = tallyWrappedBuckets([], closedCalendarYear(2023), 'year');
    expect(buckets.labels).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(buckets.values).toHaveLength(12);
    expect(buckets.values).toHaveLength(buckets.labels.length);
  });

  it('reads a past edition as exactly twelve Jan..Dec buckets', () => {
    for (const year of PAST_YEARS) {
      const range = resolveWrappedRange('year', year, now);
      const buckets = tallyWrappedBuckets([], range, 'year');
      expect(buckets.labels).toEqual(MONTH_NAMES);
      expect(buckets.values).toHaveLength(12);
      expect(buckets.values).toHaveLength(buckets.labels.length);
      expect(buckets.labelStep).toBe(1);
    }
  });

  it('has no dead leading bucket for a past edition', () => {
    const past = resolveWrappedRange('year', 2023, now);
    const buckets = tallyWrappedBuckets(
      [
        iso(new Date(2023, 0, 1, 0, 0, 0, 0)),
        iso(local(2023, 5, 15, 12)),
        iso(new Date(2023, 11, 31, 23, 59, 59, 999)),
      ],
      past,
      'year',
    );
    expect(buckets.labels[0]).toBe('Jan');
    expect(buckets.labels.at(-1)).toBe('Dec');
    // January 1 lands in the first bucket, so nothing sits dead ahead of the data.
    expect(buckets.values[0]).toBe(1);
    expect(buckets.values[5]).toBe(1);
    expect(buckets.values[11]).toBe(1);
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(sum(buckets.values)).toBe(3);
  });

  it('places a completion in the bucket for its own month', () => {
    const buckets = tallyWrappedBuckets(
      [
        iso(local(2025, 10, 14, 9)),
        iso(local(2026, 1, 2, 9)),
        iso(local(2026, 7, 30, 9)),
        iso(local(2026, 8, 15, 9)),
      ],
      range,
      'year',
    );
    // Sep 2025 is bucket 0, so Nov 2025 is 2, Feb 2026 is 5, Aug 2026 is 11 and Sep 2026 is 12.
    expect(buckets.values).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1]);
    expect(buckets.chartTitle).toBe('Completions by Month');
  });

  it('rolls the month labels forward from any start month', () => {
    const spring = resolveWrappedRange('year', 2026, new Date(2026, 2, 15, 12, 0, 0));
    const buckets = tallyWrappedBuckets([], spring, 'year');
    expect(buckets.labels).toEqual([
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
    ]);
    expect(buckets.values).toHaveLength(13);
  });

  it('sums to the number of in-range valid dates supplied', () => {
    const dates = [
      iso(local(2025, 8, 28, 12)),
      iso(local(2025, 11, 25, 8)),
      iso(local(2026, 3, 1, 8)),
      iso(local(2026, 7, 31, 23)),
      iso(local(2026, 8, 28, 12)),
    ];
    const buckets = tallyWrappedBuckets(dates, range, 'year');
    expect(sum(buckets.values)).toBe(dates.length);
    expect(buckets.values).toHaveLength(13);
    expect(buckets.values).toHaveLength(buckets.labels.length);
  });

  // A trailing twelve-month window runs into a second occurrence of its start month, so
  // a completion in that trailing partial month must land in the final bucket rather
  // than growing `values` past `labels`.
  it('keeps values aligned with labels for a date in the trailing partial month', () => {
    const buckets = tallyWrappedBuckets([iso(local(2026, 8, 15, 9))], range, 'year');
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.values).toHaveLength(13);
    expect(buckets.values[12]).toBe(1);
    expect(sum(buckets.values)).toBe(1);
  });
});

describe('tallyWrappedBuckets for the quarter period', () => {
  const range = resolveWrappedRange('quarter', 2026, now);

  it('builds Monday-start week buckets covering the quarter', () => {
    const buckets = tallyWrappedBuckets([], range, 'quarter');
    expect(buckets.labels).toEqual(expectedWeekLabels(range));
    expect(buckets.labels[0]).toBe('22 Jun');
    expect(buckets.labels.at(-1)).toBe('28 Sep');
    expect(buckets.labels.length).toBeGreaterThanOrEqual(13);
    expect(buckets.labels.length).toBeLessThanOrEqual(15);
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.labelStep).toBe(2);
    expect(buckets.chartTitle).toBe('Completions by Week');
  });

  it('starts every bucket on a Monday seven days apart', () => {
    const buckets = tallyWrappedBuckets([], range, 'quarter');
    const first = startOfDay(range.start);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    expect(first.getDay()).toBe(1);
    buckets.labels.forEach((label, index) => {
      expect(label).toBe(
        weekBucketLabel(local(first.getFullYear(), first.getMonth(), first.getDate() + index * 7)),
      );
    });
  });

  it('places a date in the middle of a bucket in that bucket', () => {
    // Wednesday 5 August 2026 sits in the week beginning Monday 3 August.
    const buckets = tallyWrappedBuckets([iso(local(2026, 7, 5, 9, 30))], range, 'quarter');
    const index = buckets.labels.indexOf('3 Aug');
    expect(index).toBe(6);
    expect(buckets.values[index]).toBe(1);
    expect(sum(buckets.values)).toBe(1);
  });

  it('keeps a Monday and the Sunday that closes its week in one bucket', () => {
    const monday = local(2026, 5, 29, 0, 0);
    const sunday = local(2026, 6, 5, 23, 59, 59);
    const buckets = tallyWrappedBuckets([iso(monday), iso(sunday)], range, 'quarter');
    const index = buckets.labels.indexOf('29 Jun');
    expect(buckets.values[index]).toBe(2);
    expect(buckets.values.filter((value) => value > 0)).toHaveLength(1);
  });

  it('splits a Sunday and the Monday that follows it across buckets', () => {
    const buckets = tallyWrappedBuckets(
      [iso(local(2026, 8, 27, 23, 59, 59)), iso(local(2026, 8, 28, 12))],
      range,
      'quarter',
    );
    const sunday = buckets.labels.indexOf('21 Sep');
    const monday = buckets.labels.indexOf('28 Sep');
    expect(buckets.values[sunday]).toBe(1);
    expect(buckets.values[monday]).toBe(1);
    expect(sunday).not.toBe(monday);
    expect(sum(buckets.values)).toBe(2);
  });
});

describe('tallyWrappedBuckets for the month period', () => {
  const range = resolveWrappedRange('month', 2026, now);

  it('builds one bucket per day across the month window', () => {
    const buckets = tallyWrappedBuckets([], range, 'month');
    expect(buckets.labels).toHaveLength(32);
    expect(buckets.labels[0]).toBe('28');
    expect(buckets.labels[4]).toBe('1');
    expect(buckets.labels.at(-1)).toBe('28');
    expect(buckets.labels.every((label) => /^\d{1,2}$/.test(label))).toBe(true);
    expect(buckets.values).toHaveLength(32);
    expect(buckets.labelStep).toBe(5);
    expect(buckets.chartTitle).toBe('Completions by Day');
  });

  it('counts each day of the window once, including both bounds', () => {
    const dates = [
      iso(local(2026, 7, 28, 12)),
      iso(local(2026, 8, 15, 9)),
      iso(local(2026, 8, 15, 21)),
      iso(local(2026, 8, 28, 12)),
    ];
    const buckets = tallyWrappedBuckets(dates, range, 'month');
    expect(buckets.values[0]).toBe(1);
    expect(buckets.values[18]).toBe(2);
    expect(buckets.values[31]).toBe(1);
    expect(sum(buckets.values)).toBe(dates.length);
  });
});

describe('tallyWrappedBuckets for the week period', () => {
  const range = resolveWrappedRange('week', 2026, now);

  it('labels its seven day buckets with weekday short names', () => {
    const buckets = tallyWrappedBuckets([], range, 'week');
    expect(buckets.labels).toHaveLength(7);
    expect(new Set(buckets.labels)).toEqual(new Set(WEEKDAY_NAMES));
    expect(buckets.labelStep).toBe(1);
    expect(buckets.chartTitle).toBe('Completions by Day of Week');
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.values.every((value) => value === 0)).toBe(true);
  });

  it('renders Mon..Sun when the trailing week happens to start on a Monday', () => {
    // Anchored on a Sunday, so the seven trailing days run Monday to Sunday.
    const sunday = new Date(2026, 8, 27, 12, 0, 0);
    const buckets = tallyWrappedBuckets([], resolveWrappedRange('week', 2026, sunday), 'week');
    expect(buckets.labels).toEqual(WEEKDAY_NAMES);
    expect(buckets.values).toHaveLength(7);
    expect(buckets.values).toHaveLength(buckets.labels.length);
  });

  it('never repeats a weekday bucket', () => {
    for (let day = 0; day < 7; day++) {
      const anchor = local(2026, 8, 22 + day, 12, 0);
      const buckets = tallyWrappedBuckets([], resolveWrappedRange('week', 2026, anchor), 'week');
      expect(buckets.labels).toHaveLength(7);
      expect(new Set(buckets.labels).size).toBe(7);
      expect(buckets.labels).toContain(weekdayName(anchor));
    }
  });

  it('reads a past edition week as the trailing seven days in order', () => {
    // 31 December 2023 is a Sunday, so these seven days happen to read Mon..Sun.
    const buckets = tallyWrappedBuckets([], resolveWrappedRange('week', 2023, now), 'week');
    expect(buckets.labels).toEqual(WEEKDAY_NAMES);
    expect(buckets.values).toHaveLength(7);
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.chartTitle).toBe('Completions by Day of Week');
  });

  // Rotation is the contract, not a side effect: a week is the seven days ending at
  // the edition's anchor, so it genuinely starts on whatever weekday that is. The
  // same rule applies to a running and a past edition, which is why the axis is
  // rotated rather than snapped to Monday in either case.
  it('yields seven distinct weekday buckets rotated to the trailing window', () => {
    const anchors = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    for (const year of anchors) {
      const window = resolveWrappedRange('week', year, now);
      const buckets = tallyWrappedBuckets([], window, 'week');
      expect(buckets.labels).toHaveLength(7);
      expect(buckets.values).toHaveLength(7);
      expect(buckets.values).toHaveLength(buckets.labels.length);
      expect(new Set(buckets.labels).size).toBe(7);
      expect(buckets.labels[0]).toBe(weekdayName(startOfDay(window.start)));
      expect(buckets.labels[6]).toBe(weekdayName(startOfDay(window.end)));
      expect(buckets.values.every((value) => value === 0)).toBe(true);
    }
  });

  it('renders the trailing order of the weekday axis (Sat..Fri for a 2021 edition)', () => {
    // 31 December 2021 is a Friday, so the week runs Saturday 25 to Friday 31 December.
    const window = resolveWrappedRange('week', 2021, now);
    const buckets = tallyWrappedBuckets(
      [iso(new Date(2021, 11, 25, 23, 59, 59, 999)), iso(new Date(2021, 11, 31, 12))],
      window,
      'week',
    );
    expect(buckets.labels).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(buckets.values).toHaveLength(buckets.labels.length);
    expect(buckets.values[0]).toBe(1);
    expect(buckets.values[6]).toBe(1);
    expect(sum(buckets.values)).toBe(2);
  });

  it('places each date in the bucket labelled with its weekday', () => {
    // The window runs 22 to 28 September 2026, so midday is inside every day of it.
    for (let offset = 0; offset < 7; offset++) {
      const date = local(2026, 8, 22 + offset, 12, 0);
      const buckets = tallyWrappedBuckets([iso(date)], range, 'week');
      const index = buckets.values.findIndex((value) => value === 1);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(buckets.labels[index]).toBe(weekdayName(date));
      expect(sum(buckets.values)).toBe(1);
    }
  });

  it('puts the first and last day of the window in the first and last buckets', () => {
    const buckets = tallyWrappedBuckets(
      [iso(new Date(range.start.getTime())), iso(new Date(range.end.getTime()))],
      range,
      'week',
    );
    expect(buckets.values[0]).toBe(1);
    expect(buckets.values[6]).toBe(1);
    expect(buckets.values.filter((value) => value > 0)).toHaveLength(2);
    expect(sum(buckets.values)).toBe(2);
  });
});

describe('tallyWrappedBuckets input handling', () => {
  it('ignores dates outside the range for every period', () => {
    for (const period of PERIODS) {
      const range = resolveWrappedRange(period, 2026, now);
      const inside = inRangeByPeriod[period];
      const buckets = tallyWrappedBuckets(
        [
          iso(new Date(range.start.getTime() - 1)),
          iso(new Date(range.end.getTime() + 1)),
          ...inside.map(iso),
        ],
        range,
        period,
      );
      expect(sum(buckets.values)).toBe(inside.length);
      expect(buckets.values.every((value) => value <= 1)).toBe(true);
      expect(buckets.values).toHaveLength(buckets.labels.length);
    }
  });

  it('skips null, undefined and unparseable entries without throwing', () => {
    for (const period of PERIODS) {
      const range = resolveWrappedRange(period, 2026, now);
      const inside = inRangeByPeriod[period];
      const buckets = tallyWrappedBuckets(
        [null, undefined, '', '   ', 'not-a-date', 'Invalid Date', 'TBD', ...inside.map(iso)],
        range,
        period,
      );
      expect(sum(buckets.values)).toBe(inside.length);
      expect(buckets.values).toHaveLength(buckets.labels.length);
    }
  });

  it('returns an all-zero aligned axis for an empty input', () => {
    for (const period of PERIODS) {
      const buckets = tallyWrappedBuckets([], resolveWrappedRange(period, 2026, now), period);
      expect(buckets.labels.length).toBeGreaterThan(0);
      expect(buckets.values).toHaveLength(buckets.labels.length);
      expect(sum(buckets.values)).toBe(0);
    }
  });

  it('does not let the caller mutate the anchor it was given', () => {
    const range = resolveWrappedRange('year', 2026, now);
    range.end.setFullYear(1999);
    expect(resolveWrappedRange('year', 2026, now).end.getFullYear()).toBe(2026);
  });
});

describe('tallyWrappedBuckets week buckets across a DST change', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('pins the timezone used by this block', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
    // Clocks spring forward at 02:00 on 8 March 2026 in this zone.
    expect(local(2026, 2, 8, 3).getHours()).not.toBe(2);
  });

  // weekBuckets counts calendar days rather than elapsed milliseconds, so a Monday
  // that opens a bucket after a spring-forward stays in its own week.
  it('keeps a bucket-starting Monday inside its own week bucket', () => {
    const range = resolveWrappedRange('quarter', 2026, new Date(2026, 3, 10, 12, 0, 0));
    const buckets = tallyWrappedBuckets([iso(local(2026, 2, 30, 0, 0))], range, 'quarter');
    const index = buckets.labels.indexOf('30 Mar');
    expect(index).toBe(12);
    expect(buckets.values[index]).toBe(1);
    expect(buckets.values[index - 1]).toBe(0);
  });
});

describe('describeWrappedRange', () => {
  it('summarises the trailing year window', () => {
    const range = resolveWrappedRange('year', 2026, now);
    expect(describeWrappedRange(range)).toBe('28 Sep 2025 – 28 Sep 2026');
  });

  it('summarises a past edition as its closed calendar year', () => {
    const range = resolveWrappedRange('year', 2023, now);
    expect(describeWrappedRange(range)).toBe('1 Jan 2023 – 31 Dec 2023');
  });

  it('summarises each past edition period', () => {
    expect(describeWrappedRange(resolveWrappedRange('quarter', 2023, now))).toBe(
      '1 Oct 2023 – 31 Dec 2023',
    );
    expect(describeWrappedRange(resolveWrappedRange('month', 2023, now))).toBe(
      '1 Dec 2023 – 31 Dec 2023',
    );
    // The week is a trailing window, not a calendar unit, but the label is unchanged.
    expect(describeWrappedRange(resolveWrappedRange('week', 2023, now))).toBe(
      '25 Dec 2023 – 31 Dec 2023',
    );
  });

  it('reads as a short human summary for every period', () => {
    const pattern = /^\d{1,2} [A-Z][a-z]{2} \d{4} – \d{1,2} [A-Z][a-z]{2} \d{4}$/;
    for (const period of PERIODS) {
      for (const year of [2026, 2023]) {
        const summary = describeWrappedRange(resolveWrappedRange(period, year, now));
        expect(summary).toMatch(pattern);
        expect(summary.length).toBeLessThan(40);
      }
    }
  });

  it('carries both the start and the end date', () => {
    const range = resolveWrappedRange('month', 2026, now);
    const [start, end] = describeWrappedRange(range).split(' – ');
    expect(start).toBe('28 Aug 2026');
    expect(end).toBe('28 Sep 2026');
  });
});
