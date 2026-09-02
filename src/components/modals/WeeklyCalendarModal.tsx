'use client';

import { useState, useMemo } from 'react';
import { Calendar, CheckCircle2, ChevronRight, Tv } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { buildWeeklySchedule, ORDERED_DAYS, type DayOfWeek } from '@/lib/calendar';
import type { MediaEntry, NextAirMap, UpdateMediaInput } from '@/types/media';

interface WeeklyCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: MediaEntry[];
  nextAirMap: NextAirMap;
  onUpdateProgress?: (id: string, input: UpdateMediaInput) => Promise<void>;
  onOpenDetail?: (item: MediaEntry) => void;
}

export default function WeeklyCalendarModal({
  isOpen,
  onClose,
  entries,
  nextAirMap,
  onUpdateProgress,
  onOpenDetail,
}: WeeklyCalendarModalProps) {
  const [filter, setFilter] = useState<'all' | 'show' | 'anime'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const isOngoing = e.status === 'in_progress' || e.status === 'planning';
      if (!isOngoing) return false;
      if (filter === 'all') return e.category === 'show' || e.category === 'anime';
      return e.category === filter;
    });
  }, [entries, filter]);

  const schedule = useMemo(() => {
    return buildWeeklySchedule(filteredEntries, nextAirMap);
  }, [filteredEntries, nextAirMap]);

  const totalAiring = useMemo(() => {
    return Object.values(schedule).reduce((acc, items) => acc + items.length, 0);
  }, [schedule]);

  if (!isOpen) return null;

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as DayOfWeek;

  const handleQuickLog = async (entry: MediaEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateProgress) return;
    setUpdatingId(entry.id);
    try {
      const nextEp = (entry.secondaryUnitCurrent || 0) + 1;
      await onUpdateProgress(entry.id, {
        secondaryUnitCurrent: nextEp,
        status: 'in_progress',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="weekly-calendar-modal-title"
      contentClassName="flex max-w-6xl flex-col overflow-hidden p-0"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-decorative bg-surface-subtle p-4 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-required bg-surface text-ink">
            <Calendar size={20} strokeWidth={2} />
          </div>
          <div>
            <h2
              id="weekly-calendar-modal-title"
              className="text-lg font-[var(--za-weight-heading)] text-ink"
            >
              Weekly Airing Schedule
            </h2>
            <p className="text-xs text-ink-muted">
              {totalAiring} ongoing {totalAiring === 1 ? 'title' : 'titles'} airing in your
              watchlist
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-small px-3 py-1 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
              filter === 'all'
                ? 'border border-required bg-surface text-ink'
                : 'border border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('show')}
            className={`rounded-small px-3 py-1 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
              filter === 'show'
                ? 'border border-required bg-surface text-ink'
                : 'border border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            Shows Only
          </button>
          <button
            type="button"
            onClick={() => setFilter('anime')}
            className={`rounded-small px-3 py-1 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
              filter === 'anime'
                ? 'border border-required bg-surface text-ink'
                : 'border border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            Anime Only
          </button>
        </div>
      </div>

      {/* 7-Day Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {ORDERED_DAYS.map((day) => {
            const isToday = day === todayName;
            const items = schedule[day];

            return (
              <div
                key={day}
                className={`flex flex-col rounded-control border p-3 min-h-[14rem] transition-[colors] ${
                  isToday
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                    : 'border-decorative bg-surface-subtle'
                }`}
              >
                <div className="mb-2.5 flex items-center justify-between border-b border-decorative pb-2">
                  <span
                    className={`text-xs font-[var(--za-weight-emphasis)] ${
                      isToday ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    {day.slice(0, 3).toUpperCase()}
                  </span>
                  {isToday && (
                    <span className="rounded-small bg-accent px-1.5 py-0.2 text-[9px] font-bold text-[var(--za-color-on-accent)]">
                      TODAY
                    </span>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-center text-[11px] text-ink-muted/60">
                    No releases
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map(({ media, airInfo, timeString }) => {
                      const epLabel =
                        airInfo.season && airInfo.number
                          ? `S${airInfo.season}E${airInfo.number}`
                          : airInfo.number
                            ? `Ep ${airInfo.number}`
                            : 'Next Ep';

                      return (
                        <div
                          key={media.id}
                          onClick={() => onOpenDetail?.(media)}
                          className="group relative cursor-pointer rounded-small border border-decorative bg-surface p-2 shadow-xs transition-transform hover:-translate-y-0.5 hover:border-required"
                        >
                          <div className="flex items-start gap-2">
                            {media.coverImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={media.coverImage}
                                alt=""
                                className="h-10 w-7 flex-none rounded-xs object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-7 flex-none items-center justify-center rounded-xs bg-surface-subtle text-ink-muted">
                                <Tv size={12} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4
                                className="truncate text-xs font-[var(--za-weight-emphasis)] text-ink group-hover:text-accent"
                                title={media.title}
                              >
                                {media.title}
                              </h4>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-muted">
                                <span className="font-semibold text-accent">{epLabel}</span>
                                {timeString !== 'TBA' && <span>· {timeString}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Quick +1 Log Button */}
                          {onUpdateProgress && (
                            <button
                              type="button"
                              disabled={updatingId === media.id}
                              onClick={(e) => handleQuickLog(media, e)}
                              className="mt-2 flex w-full items-center justify-center gap-1 rounded-xs border border-decorative bg-surface-subtle py-0.5 text-[10px] font-medium text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
                              title="Mark watched / +1 episode"
                            >
                              <CheckCircle2 size={10} />
                              <span>+1 Ep</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-decorative bg-surface-subtle px-6 py-3">
        <button type="button" onClick={onClose} className="za-button za-button--secondary text-xs">
          Close Calendar
        </button>
      </div>
    </Modal>
  );
}
