'use client';

import { useState, useEffect } from 'react';
import { X, Flame, CheckCircle, Clock, Activity, RotateCcw, Star } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { getActivityLogs } from './actions';
import { ACTIVITY_LOG_FETCH_LIMIT } from '@/lib/constants';
import styles from './dashboard.module.css';

export default function ActivityTimelineModal({ isOpen, onClose }) {
  const modalRef = useFocusTrap(isOpen, onClose);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      getActivityLogs(ACTIVITY_LOG_FETCH_LIMIT)
        .then((data) => setLogs(data || []))
        .catch((e) => console.error(e))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate streaks
  const calculateStreak = () => {
    if (logs.length === 0) return 0;
    const uniqueDays = new Set(logs.map((l) => new Date(l.createdAt).toDateString()));
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const hasToday = uniqueDays.has(today.toDateString());
    const hasYesterday = uniqueDays.has(yesterday.toDateString());

    if (!hasToday && !hasYesterday) return 0;

    let streak = 0;
    let checkDate = hasToday ? today : yesterday;

    while (uniqueDays.has(checkDate.toDateString())) {
      streak++;
      checkDate = new Date(checkDate);
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };

  const streak = calculateStreak();

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
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modalContent}`}
        style={{ maxWidth: '36rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
      >
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} />
            <h2 id="activity-modal-title" className={styles.modalTitle}>
              Activity & Habits
            </h2>
          </div>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

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
      </div>
    </div>
  );
}
