export type WrappedPeriod = 'year' | 'quarter' | 'month' | 'week';

export interface WrappedPeriodOption {
  id: WrappedPeriod;
  /** Menu label, e.g. "Last quarter". */
  label: string;
  /** Terse label for tight layouts, e.g. "3 mo". */
  shortLabel: string;
  /** Chart axis granularity, e.g. "by Month". */
  granularity: string;
}

export const WRAPPED_PERIODS: readonly WrappedPeriodOption[] = [
  { id: 'year', label: 'Last year', shortLabel: '1 yr', granularity: 'by Month' },
  { id: 'quarter', label: 'Last quarter', shortLabel: '3 mo', granularity: 'by Week' },
  { id: 'month', label: 'Last month', shortLabel: '1 mo', granularity: 'by Day' },
  { id: 'week', label: 'Last week', shortLabel: '1 wk', granularity: 'by Day of Week' },
];

export const DEFAULT_WRAPPED_PERIOD: WrappedPeriod = 'year';

export interface WrappedRange {
  /** Inclusive lower bound. */
  start: Date;
  /** Inclusive upper bound. */
  end: Date;
}

export interface WrappedBuckets {
  /** One count per bucket, index-aligned with `labels`. */
  values: number[];
  labels: string[];
  /** Render a label only every N buckets, to avoid crowding the axis. */
  labelStep: number;
  /** Chart heading, e.g. "Completions by Week". */
  chartTitle: string;
}

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

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Coerce an untrusted query value to a supported period, defaulting to the year view. */
export function parseWrappedPeriod(
  raw: string | string[] | undefined | null,
  fallback: WrappedPeriod = DEFAULT_WRAPPED_PERIOD,
): WrappedPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (WRAPPED_PERIODS as readonly { id: string }[]).some((p) => p.id === value)) {
    return value as WrappedPeriod;
  }
  return fallback;
}

export function getWrappedPeriodOption(period: WrappedPeriod): WrappedPeriodOption {
  return (
    WRAPPED_PERIODS.find((p) => p.id === period) ?? (WRAPPED_PERIODS[0] as WrappedPeriodOption)
  );
}

/** The final instant a period is measured up to, for a given edition year. */
export function wrappedPeriodAnchor(year: number, now = new Date()): Date {
  if (year >= now.getFullYear()) return new Date(now.getTime());
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

/**
 * Subtract whole calendar months, clamping to the last valid day of the target
 * month so that 31 Mar minus one month is 28/29 Feb rather than spilling into March.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dayOfMonth, daysInTargetMonth));
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Midnight on the Monday of `date`'s week. */
function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  const offsetFromMonday = (day.getDay() + 6) % 7;
  return addDays(day, -offsetFromMonday);
}

/**
 * Resolve the trailing window a period covers. Every period is relative to the
 * edition's anchor, so the current year's default view is a true trailing twelve
 * months while a past edition resolves to a closed calendar window.
 */
export function resolveWrappedRange(
  period: WrappedPeriod,
  year: number,
  now = new Date(),
): WrappedRange {
  const end = wrappedPeriodAnchor(year, now);
  switch (period) {
    case 'quarter':
      return { start: addMonths(end, -3), end };
    case 'month':
      return { start: addMonths(end, -1), end };
    case 'week':
      return { start: addDays(end, -7), end };
    case 'year':
    default:
      return { start: addMonths(end, -12), end };
  }
}

export function isWithinWrappedRange(date: Date, range: WrappedRange): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

/** Human summary of a window, e.g. "28 Sep 2025 – 27 Sep 2026". */
export function describeWrappedRange(range: WrappedRange): string {
  const format = (date: Date) =>
    `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  return `${format(range.start)} – ${format(range.end)}`;
}

type BucketAxis = WrappedBuckets & { index: (date: Date) => number | null };

function monthBuckets(range: WrappedRange): BucketAxis {
  const labels: string[] = [];
  const values: number[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  for (let i = 0; i < 12; i++) {
    labels.push(MONTH_NAMES[cursor.getMonth()] ?? '');
    values.push(0);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const index = (date: Date) =>
    (date.getFullYear() - range.start.getFullYear()) * 12 +
    (date.getMonth() - range.start.getMonth());
  return { labels, values, labelStep: 1, chartTitle: 'Completions by Month', index };
}

function weekBuckets(range: WrappedRange): BucketAxis {
  const labels: string[] = [];
  const values: number[] = [];
  const starts: number[] = [];
  let cursor = startOfWeekMonday(range.start);
  while (cursor.getTime() <= range.end.getTime()) {
    starts.push(cursor.getTime());
    labels.push(`${cursor.getDate()} ${MONTH_NAMES[cursor.getMonth()] ?? ''}`.trim());
    values.push(0);
    cursor = addDays(cursor, 7);
  }
  const index = (date: Date) => {
    const offset = Math.floor((startOfDay(date).getTime() - (starts[0] ?? 0)) / (MS_PER_DAY * 7));
    if (offset < 0) return null;
    return offset < starts.length ? offset : null;
  };
  return { labels, values, labelStep: 2, chartTitle: 'Completions by Week', index };
}

function dayBuckets(range: WrappedRange, labelByWeekday: boolean): BucketAxis {
  const labels: string[] = [];
  const values: number[] = [];
  let cursor = startOfDay(range.start);
  const finalDay = startOfDay(range.end);
  while (cursor.getTime() <= finalDay.getTime()) {
    labels.push(
      labelByWeekday ? (DAY_NAMES[(cursor.getDay() + 6) % 7] ?? '') : String(cursor.getDate()),
    );
    values.push(0);
    cursor = addDays(cursor, 1);
  }
  const index = (date: Date) => {
    const offset = Math.round(
      (startOfDay(date).getTime() - startOfDay(range.start).getTime()) / MS_PER_DAY,
    );
    return offset >= 0 && offset < values.length ? offset : null;
  };
  return {
    labels,
    values,
    labelStep: labelByWeekday ? 1 : 5,
    chartTitle: labelByWeekday ? 'Completions by Day of Week' : 'Completions by Day',
    index,
  };
}

/**
 * The chart axis for a period, with counts tallied from the supplied dates.
 * Dates outside the range are ignored, so callers can pass every completion
 * timestamp they have and let this decide what is in scope.
 */
export function tallyWrappedBuckets(
  dates: readonly (string | null | undefined)[],
  range: WrappedRange,
  period: WrappedPeriod,
): WrappedBuckets {
  const bucket: BucketAxis =
    period === 'year'
      ? monthBuckets(range)
      : period === 'quarter'
        ? weekBuckets(range)
        : dayBuckets(range, period === 'week');

  for (const raw of dates) {
    if (!raw) continue;
    const date = new Date(raw);
    if (isNaN(date.getTime())) continue;
    if (!isWithinWrappedRange(date, range)) continue;
    const at = bucket.index(date);
    if (at === null) continue;
    bucket.values[at] = (bucket.values[at] ?? 0) + 1;
  }

  return {
    values: bucket.values,
    labels: bucket.labels,
    labelStep: bucket.labelStep,
    chartTitle: bucket.chartTitle,
  };
}
