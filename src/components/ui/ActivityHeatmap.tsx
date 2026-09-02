'use client';

import React, { useEffect, useMemo, useState } from 'react';

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

// The light palette is intentionally explicit: these are the four ink levels
// used by the Tactile Folio. Dark and one-bit themes replace the warm colors
// with their own accent so the grid remains legible on OLED and e-ink surfaces.
const PARCHMENT_RAMP = ['#EFEAE0', '#D9C3A8', '#B36856', '#8C2D19'] as const;

function getRampLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(PARCHMENT_RAMP.length - 1, Math.max(1, Math.ceil((count / max) * 3)));
}

function getThemeName(): string {
  if (typeof document === 'undefined') return 'parchment';
  return document.documentElement.getAttribute('data-theme') || 'parchment';
}

function getCellStyle(level: number, useThemeRamp: boolean): React.CSSProperties {
  if (!useThemeRamp) {
    return {
      backgroundColor: PARCHMENT_RAMP[level] ?? PARCHMENT_RAMP[0],
      borderColor: level === 0 ? 'var(--za-color-border-decorative)' : PARCHMENT_RAMP[level],
    };
  }

  if (level === 0) {
    return {
      backgroundColor: 'var(--za-color-surface-sunken)',
      borderColor: 'var(--za-color-border-decorative)',
    };
  }

  const accentStrength = [0, 28, 58, 82][level] ?? 82;
  return {
    backgroundColor: `color-mix(in srgb, var(--za-color-accent) ${accentStrength}%, var(--za-color-surface-sunken))`,
    borderColor: `color-mix(in srgb, var(--za-color-accent) ${Math.min(100, accentStrength + 12)}%, var(--za-color-surface-sunken))`,
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ActivityHeatmap({ activityMap, className = '' }: ActivityHeatmapProps) {
  const [themeName, setThemeName] = useState('parchment');

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setThemeName(getThemeName());
    // The root theme can change while the activity modal is open.
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const useThemeRamp = themeName !== 'parchment' && themeName !== 'sepia';

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
    <div className={`za-bookplate rounded-small p-[var(--za-space-4)] ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.08em] text-ink">
          Activity Over Past Year
        </div>
        <div className="font-[var(--za-font-mono)] text-[0.65rem] text-ink-muted">
          {totalLogs} {totalLogs === 1 ? 'log' : 'logs'} · Max {maxInOneDay} in one day
        </div>
      </div>

      {/* Responsive scroll container */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Months header */}
          <div className="relative mb-1 flex h-3.5 pl-8 font-[var(--za-font-mono)] text-[0.6rem] text-ink-muted">
            {monthHeaders.map((m, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${m.colIndex * 15 + 32}px`,
                }}
              >
                {m.monthName}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {/* Day of week labels */}
            <div className="flex w-6 shrink-0 flex-col gap-[3px] pt-0.5 font-[var(--za-font-mono)] text-[0.58rem] leading-3 text-ink-muted">
              {DAY_LABELS.map((label, idx) => (
                <div key={idx} className="flex h-3 items-center">
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks columns */}
            <div className="flex gap-[3px]">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[3px]">
                  {week.map((day) => {
                    const level = getRampLevel(day.count, maxInOneDay);
                    const formatted = formatDate(day.date);
                    const tooltip = `${formatted}: ${day.count} ${day.count === 1 ? 'action' : 'actions'} logged`;

                    return (
                      <div
                        key={day.dateKey}
                        title={tooltip}
                        aria-label={tooltip}
                        className="size-3 rounded-[2px] border transition-transform hover:z-10 hover:scale-125"
                        style={getCellStyle(level, useThemeRamp)}
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
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-decorative pt-2 font-[var(--za-font-mono)] text-[0.65rem] text-ink-muted">
        <span>52-week habit timeline</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <div className="flex items-center gap-1">
            {PARCHMENT_RAMP.map((_, level) => (
              <div
                key={level}
                className="size-3 rounded-[2px] border"
                style={getCellStyle(level, useThemeRamp)}
              />
            ))}
          </div>
          <span>More Activity</span>
        </div>
      </div>
    </div>
  );
}
