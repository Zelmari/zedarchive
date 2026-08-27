'use client';

import { useState, useEffect } from 'react';
import { Flame, CheckCircle, Clock, Activity as ActivityIcon, RotateCcw, Star } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { getActivityLogs, getUserStreak } from '@/server/activity';
import { ACTIVITY_LOG_FETCH_LIMIT } from '@/lib/constants';

interface ActivityTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LogRow {
  id: string;
  actionType: string;
  details: Record<string, unknown>;
  createdAt: Date | string;
}

export default function ActivityTimelineModal({ isOpen, onClose }: ActivityTimelineModalProps) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + load pattern for modal open
      setLoading(true);
      Promise.all([getActivityLogs(ACTIVITY_LOG_FETCH_LIMIT), getUserStreak()])
        .then(([logData, streakData]) => {
          setLogs(logData || []);
          setStreak(streakData?.streak ?? 0);
        })
        .catch((e) => console.error('Failed to load activity logs:', e))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Streak is computed server-side from the full history (see getUserStreak),
  // not from the truncated activity window fetched above.

  // Group logs by relative date
  const groupedLogs = logs.reduce<Record<string, LogRow[]>>((groups, log) => {
    const logDate = new Date(log.createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let groupKey = logDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (logDate.toDateString() === today.toDateString()) groupKey = 'Today';
    else if (logDate.toDateString() === yesterday.toDateString()) groupKey = 'Yesterday';

    if (!groups[groupKey]) groups[groupKey] = [];
    (groups[groupKey] as LogRow[]).push(log);
    return groups;
  }, {});

  const formatActionMessage = (log: LogRow): string => {
    const details = log.details || {};
    const title = String(details.title || 'media entry');
    const isBook = details.category === 'book' || details.category === 'manga';

    switch (log.actionType) {
      case 'created':
        return `Added ${title} to ${String(details.category || 'archive')}`;
      case 'completed':
        return `Completed ${title}`;
      case 'rewatch':
        return `Started ${isBook ? 'reread' : 'rewatch'} of ${title}`;
      case 'rating':
        return `Rated ${title} ★ ${String(details.rating || '')}/10`;
      default:
        if (details.progress !== undefined) {
          const unit = isBook ? 'Ch / Page' : 'Ep';
          const season = Number(details.season) > 1 ? `S${details.season} ` : '';
          return `Progress on ${title}: ${season}${unit} ${details.progress}${details.total ? ` / ${details.total}` : ''}`;
        }
        return `Updated progress on ${title}`;
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'completed':
        return <CheckCircle size={14} style={{ color: '#2e7d32' }} />;
      case 'rewatch':
        return <RotateCcw size={14} style={{ color: '#d97706' }} />;
      case 'rating':
        return <Star size={14} style={{ color: '#b45309' }} fill="currentColor" />;
      default:
        return <Clock size={14} style={{ color: 'var(--za-color-text-muted)' }} />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="activity-modal-title"
      title="Activity & Habits"
      icon={<ActivityIcon size={18} />}
      contentStyle={{
        maxWidth: '36rem',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="flex-1 overflow-y-auto px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {/* Streak Banner */}
        <div
          className="mb-[var(--za-space-4)] flex items-center justify-between rounded-control border p-[var(--za-space-4)]"
          style={{
            background: streak > 0 ? 'rgba(217, 119, 6, 0.08)' : 'var(--za-color-surface-subtle)',
            borderColor:
              streak > 0 ? 'rgba(217, 119, 6, 0.3)' : 'var(--za-color-border-decorative)',
            borderWidth: 'var(--za-border-width)',
            borderStyle: 'solid',
          }}
        >
          <div className="flex items-center gap-2">
            <Flame
              size={20}
              style={{ color: streak > 0 ? '#d97706' : 'var(--za-color-text-muted)' }}
            />
            <div>
              <div
                className="text-[length:var(--za-text-base)] font-[var(--za-weight-heading)]"
                style={{ color: streak > 0 ? '#b45309' : 'var(--za-color-text)' }}
              >
                {streak > 0 ? `${streak} Day Active Streak` : 'No active streak'}
              </div>
              <div className="text-[length:var(--za-text-fine)] text-ink-muted">
                {streak > 0
                  ? 'Keep logging daily to build your habit!'
                  : 'Log an episode or chapter today to start a streak.'}
              </div>
            </div>
          </div>
          <div
            className="text-[1.4rem] font-bold"
            style={{ color: streak > 0 ? '#d97706' : 'var(--za-color-text-muted)' }}
          >
            {streak}
          </div>
        </div>

        {/* Activity Stream */}
        {loading ? (
          <div className="px-[var(--za-space-8)] py-[var(--za-space-8)] text-center text-[length:var(--za-text-fine)] text-ink-muted">
            Loading activity timeline...
          </div>
        ) : logs.length === 0 ? (
          <div className="px-[var(--za-space-8)] py-[var(--za-space-8)] text-center text-[length:var(--za-text-fine)] text-ink-muted">
            No logged activities yet. Increment an episode or chapter on any card to see your
            history here!
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--za-space-4)]">
            {Object.entries(groupedLogs).map(([dateLabel, groupItems]) => (
              <div key={dateLabel}>
                <div className="mb-[var(--za-space-2)] text-[0.75rem] font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink-muted">
                  {dateLabel}
                </div>
                <div className="flex flex-col gap-[0.35rem]">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-small border border-decorative bg-surface-subtle px-[0.65rem] py-[0.45rem] text-[length:var(--za-text-fine)]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {getActionIcon(item.actionType)}
                        <span className="truncate">{formatActionMessage(item)}</span>
                      </div>
                      <span className="ml-2 shrink-0 text-[0.7rem] text-ink-muted">
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-[var(--za-space-5)] flex justify-end">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
