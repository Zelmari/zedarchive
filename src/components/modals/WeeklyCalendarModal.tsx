'use client';

import { useState, useMemo } from 'react';
import { Calendar, CheckCircle2, Clock3, Tv } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { buildWeeklySchedule, ORDERED_DAYS, type DayOfWeek } from '@/lib/calendar';
import type { MediaEntry, NextAirMap, UpdateMediaInput } from '@/types/media';
import { cn } from '@/lib/cn';

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
      contentClassName="flex max-w-[72rem] flex-col overflow-hidden rounded-small p-0"
    >
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-decorative bg-canvas px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-small border border-required bg-surface text-accent shadow-raised">
            <Calendar size={19} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <div className="mb-1 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.16em] text-accent">
              Broadcast Radar &amp; Schedule
            </div>
            <h2
              id="weekly-calendar-modal-title"
              className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink"
            >
              Weekly Airing Schedule
            </h2>
            <p className="mt-1 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] text-ink-muted">
              {totalAiring} ongoing {totalAiring === 1 ? 'title' : 'titles'} airing in your
              watchlist
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-1 border-b border-decorative"
          role="tablist"
          aria-label="Calendar filters"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            className={cn(
              'border-b-2 px-3 py-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.07em] transition-colors',
              filter === 'all'
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'show'}
            onClick={() => setFilter('show')}
            className={cn(
              'border-b-2 px-3 py-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.07em] transition-colors',
              filter === 'show'
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            Shows Only
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'anime'}
            onClick={() => setFilter('anime')}
            className={cn(
              'border-b-2 px-3 py-2 font-[var(--za-font-display)] text-[0.7rem] font-bold uppercase tracking-[0.07em] transition-colors',
              filter === 'anime'
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            Anime Only
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-surface-subtle p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {ORDERED_DAYS.map((day) => {
            const isToday = day === todayName;
            const items = schedule[day];

            return (
              <div
                key={day}
                className={cn(
                  'flex min-h-[15rem] flex-col rounded-small border bg-surface p-3 transition-[border-color,box-shadow]',
                  isToday ? 'border-accent shadow-gold' : 'border-decorative shadow-raised',
                )}
              >
                <div className="mb-3 flex items-center justify-between border-b border-decorative pb-2">
                  <span
                    className={cn(
                      'font-[var(--za-font-display)] text-xs font-bold uppercase tracking-[0.08em]',
                      isToday ? 'text-accent' : 'text-ink',
                    )}
                  >
                    {day.slice(0, 3)}
                  </span>
                  {isToday && (
                    <span className="rounded-small bg-accent px-1.5 py-0.5 font-[var(--za-font-mono)] text-[0.58rem] font-bold uppercase tracking-[0.06em] text-on-accent">
                      TODAY
                    </span>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-ink-muted/60">
                    <Clock3 size={15} aria-hidden="true" />
                    <span className="font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.06em]">
                      No releases
                    </span>
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
                        <article
                          key={media.id}
                          onClick={() => onOpenDetail?.(media)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onOpenDetail?.(media);
                            }
                          }}
                          role={onOpenDetail ? 'button' : undefined}
                          tabIndex={onOpenDetail ? 0 : undefined}
                          className={cn(
                            'group relative rounded-small border border-decorative bg-surface-subtle p-2 shadow-raised transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-required',
                            onOpenDetail && 'cursor-pointer',
                          )}
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
                                <Tv size={12} aria-hidden="true" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4
                                className="truncate font-[var(--za-font-serif-body)] text-sm font-[var(--za-weight-emphasis)] text-ink group-hover:text-accent"
                                title={media.title}
                              >
                                {media.title}
                              </h4>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-[var(--za-font-mono)] text-[0.62rem] text-ink-muted">
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
                              className="za-button za-button--primary mt-2 flex min-h-0 w-full gap-1 px-2 py-1 text-[0.65rem] disabled:opacity-50"
                              title="Mark watched / +1 episode"
                            >
                              <CheckCircle2 size={11} aria-hidden="true" />
                              <span>+1 Ep</span>
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-decorative bg-canvas px-4 py-3 sm:px-6">
        <span className="font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.08em] text-ink-muted">
          One-click episode logging
        </span>
        <button type="button" onClick={onClose} className="za-button za-button--secondary text-xs">
          Close Calendar
        </button>
      </div>
    </Modal>
  );
}
