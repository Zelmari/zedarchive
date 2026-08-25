'use client';

import { useState, useEffect } from 'react';
import { Flame, CheckCircle, Clock, Activity, RotateCcw, Star } from 'lucide-react';
import ModalShell from './ModalShell';
import { getActivityLogs, getUserStreak } from '@/server/activity';
import { ACTIVITY_LOG_FETCH_LIMIT } from '@/lib/constants';
import styles from './dashboard.module.css';

export default function ActivityTimelineModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      Promise.all([
        getActivityLogs(ACTIVITY_LOG_FETCH_LIMIT),
        getUserStreak(),
      ])
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
  const groupedLogs = logs.reduce((groups, log) => {
    const logDate = new Date(log.createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let groupKey = logDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (logDate.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (logDate.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    }

    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(log);
    return groups;
  }, {});

  const formatActionMessage = (log) => {
    const details = log.details || {};
    const title = details.title || 'media entry';
    const isBook = details.category === 'book' || details.category === 'manga';

    switch (log.actionType) {
      case 'created':
        return `Added ${title} to ${details.category || 'archive'}`;
      case 'completed':
        return `Completed ${title}`;
      case 'rewatch':
        return `Started ${isBook ? 'reread' : 'rewatch'} of ${title}`;
      case 'rating':
        return `Rated ${title} ★ ${details.rating || ''}/10`;
      case 'progress_update':
      default:
        if (details.progress !== undefined) {
          const unit = isBook ? 'Ch / Page' : 'Ep';
          const season = details.season && details.season > 1 ? `S${details.season} ` : '';
          return `Progress on ${title}: ${season}${unit} ${details.progress}${details.total ? ` / ${details.total}` : ''}`;
        }
        return `Updated progress on ${title}`;
    }
  };

  const getActionIcon = (type) => {
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="activity-modal-title"
      title="Activity & Habits"
      icon={<Activity size={18} />}
      contentStyle={{ maxWidth: '36rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ padding: 'var(--za-space-4) var(--za-space-6)', overflowY: 'auto', flex: 1 }}>
          {/* Streak Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--za-space-3) var(--za-space-4)',
              background: streak > 0 ? 'rgba(217, 119, 6, 0.08)' : 'var(--za-color-surface-subtle)',
              border: `var(--za-border-width) solid ${streak > 0 ? 'rgba(217, 119, 6, 0.3)' : 'var(--za-color-border-decorative)'}`,
              borderRadius: 'var(--za-radius-control)',
              marginBottom: 'var(--za-space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Flame size={20} style={{ color: streak > 0 ? '#d97706' : 'var(--za-color-text-muted)' }} />
              <div>
                <div style={{ fontWeight: 'var(--za-weight-heading)', fontSize: 'var(--za-text-base)', color: streak > 0 ? '#b45309' : 'var(--za-color-text)' }}>
                  {streak > 0 ? `${streak} Day Active Streak` : 'No active streak'}
                </div>
                <div style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)' }}>
                  {streak > 0 ? 'Keep logging daily to build your habit!' : 'Log an episode or chapter today to start a streak.'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: streak > 0 ? '#d97706' : 'var(--za-color-text-muted)' }}>
              {streak}
            </div>
          </div>

          {/* Activity Stream */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--za-space-8)', color: 'var(--za-color-text-muted)', fontSize: 'var(--za-text-fine)' }}>
              Loading activity timeline...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--za-space-8)', color: 'var(--za-color-text-muted)', fontSize: 'var(--za-text-fine)' }}>
              No logged activities yet. Increment an episode or chapter on any card to see your history here!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-4)' }}>
              {Object.entries(groupedLogs).map(([dateLabel, groupItems]) => (
                <div key={dateLabel}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 'var(--za-weight-heading)',
                      color: 'var(--za-color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 'var(--za-space-2)',
                    }}
                  >
                    {dateLabel}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {groupItems.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.65rem',
                          background: 'var(--za-color-surface-subtle)',
                          borderRadius: 'var(--za-radius-small)',
                          border: 'var(--za-border-width) solid var(--za-color-border-decorative)',
                          fontSize: 'var(--za-text-fine)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          {getActionIcon(item.actionType)}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatActionMessage(item)}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--za-color-text-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--za-space-5)' }}>
            <button type="button" className="za-button za-button--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
    </ModalShell>
  );
}
