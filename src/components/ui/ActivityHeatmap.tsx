'use client';

import React, { useMemo } from 'react';

interface ActivityHeatmapProps {
  activityMap: Record<string, number>;
  className?: string;
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

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function getIntensityClass(count: number): string {
  if (count === 0) return 'bg-surface-subtle border-decorative';
  if (count <= 2) return 'bg-accent/25 border-accent/40';
  if (count <= 5) return 'bg-accent/50 border-accent/60';
  if (count <= 9) return 'bg-accent/75 border-accent/80';
  return 'bg-accent border-accent shadow-sm';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ActivityHeatmap({ activityMap, className = '' }: ActivityHeatmapProps) {
  // Generate 52 weeks (52 * 7 = 364 days) ending today
  const { weeks, monthHeaders, totalLogs, maxInOneDay } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Current day of week (0 = Sun, 1 = Mon ... 6 = Sat)
    // We want Mon = 0 ... Sun = 6
    const todayDayOfWeek = (today.getDay() + 6) % 7;

    // Start date is 52 weeks before the start of current week
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (51 * 7 + todayDayOfWeek));

    const weeksList: Array<Array<{ date: Date; dateKey: string; count: number }>> = [];
    const months: Array<{ monthName: string; colIndex: number }> = [];

    let currentWeek: Array<{ date: Date; dateKey: string; count: number }> = [];
    let lastMonth = -1;
    let total = 0;
    let max = 0;

    const cursor = new Date(startDate);
    let col = 0;

    while (cursor <= today || currentWeek.length > 0) {
      const dateKey = cursor.toISOString().slice(0, 10);
      const count = activityMap[dateKey] || 0;
      total += count;
      if (count > max) max = count;

      const m = cursor.getMonth();
      if (m !== lastMonth && currentWeek.length === 0) {
        months.push({ monthName: MONTH_NAMES[m] || '', colIndex: col });
        lastMonth = m;
      }

      currentWeek.push({
        date: new Date(cursor),
        dateKey,
        count,
      });

      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
        col++;
      }

      cursor.setDate(cursor.getDate() + 1);
      if (cursor > today && currentWeek.length === 0) {
        break;
      }
    }

    if (currentWeek.length > 0) {
      weeksList.push(currentWeek);
    }

    return {
      weeks: weeksList,
      monthHeaders: months,
      totalLogs: total,
      maxInOneDay: max,
    };
  }, [activityMap]);

  return (
    <div
      className={`rounded-control border border-decorative bg-surface p-[var(--za-space-4)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-[var(--za-weight-emphasis)] text-ink">
          Activity Over Past Year
        </div>
        <div className="text-[11px] text-ink-muted">
          {totalLogs} {totalLogs === 1 ? 'log' : 'logs'} · Max {maxInOneDay} in one day
        </div>
      </div>

      {/* Responsive scroll container */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Months header */}
          <div className="flex pl-8 text-[10px] text-ink-muted mb-1 h-3.5 relative">
            {monthHeaders.map((m, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${m.colIndex * 13 + 32}px`,
                }}
              >
                {m.monthName}
              </span>
            ))}
          </div>

          <div className="flex gap-1.5">
            {/* Day of week labels */}
            <div className="flex flex-col gap-1 text-[9px] text-ink-muted leading-[10px] w-6 shrink-0 pt-0.5">
              {DAY_LABELS.map((label, idx) => (
                <div key={idx} className="h-2.5 flex items-center">
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks columns */}
            <div className="flex gap-1">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {week.map((day) => {
                    const intensity = getIntensityClass(day.count);
                    const formatted = formatDate(day.date);
                    const tooltip = `${formatted}: ${day.count} ${day.count === 1 ? 'action' : 'actions'} logged`;

                    return (
                      <div
                        key={day.dateKey}
                        title={tooltip}
                        aria-label={tooltip}
                        className={`h-2.5 w-2.5 rounded-xs border transition-transform hover:scale-125 hover:z-10 ${intensity}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend footer */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted pt-2 border-t border-decorative">
        <span>52-week habit timeline</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded-xs border bg-surface-subtle border-decorative" />
            <div className="h-2.5 w-2.5 rounded-xs border bg-accent/25 border-accent/40" />
            <div className="h-2.5 w-2.5 rounded-xs border bg-accent/50 border-accent/60" />
            <div className="h-2.5 w-2.5 rounded-xs border bg-accent/75 border-accent/80" />
            <div className="h-2.5 w-2.5 rounded-xs border bg-accent border-accent" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
