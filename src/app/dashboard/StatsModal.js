'use client';

import { X, Tv, BookOpen, CheckCircle, Star, BarChart2 } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

export default function StatsModal({ isOpen, onClose, entries = [] }) {
  const modalRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const totalEntries = entries.length;
  const showEntries = entries.filter((e) => e.category === 'show' || e.category === 'anime');
  const bookEntries = entries.filter((e) => e.category === 'book' || e.category === 'manga');

  const completedEntries = entries.filter((e) => e.status === 'completed');
  const inProgressEntries = entries.filter((e) => !e.status || e.status === 'in_progress');
  const planningEntries = entries.filter((e) => e.status === 'planning');

  const totalEpisodes = showEntries.reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);
  const totalChapters = bookEntries.reduce((sum, e) => sum + (e.secondaryUnitCurrent || 0), 0);

  const ratedEntries = entries.filter((e) => e.rating != null && e.rating > 0);
  const avgRating = ratedEntries.length > 0
    ? (ratedEntries.reduce((sum, e) => sum + e.rating, 0) / ratedEntries.length).toFixed(1)
    : '—';

  const completionRate = totalEntries > 0
    ? Math.round((completedEntries.length / totalEntries) * 100)
    : 0;

  const topRated = [...ratedEntries].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modalContent} ${styles.statsModalContent}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-modal-title"
      >
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={18} />
            <h2 id="stats-modal-title" className={styles.modalTitle}>
              Archive Statistics
            </h2>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 'var(--za-space-4) var(--za-space-6)' }}>
          {/* Status Breakdown Section */}
          <div className={styles.statsSectionTitle}>Collection Status</div>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{totalEntries}</div>
              <div className={styles.statLabel}>Total Titles</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ color: '#2e7d32' }}>{completedEntries.length}</div>
              <div className={styles.statLabel}>Completed ({completionRate}%)</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{inProgressEntries.length}</div>
              <div className={styles.statLabel}>In Progress</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{planningEntries.length}</div>
              <div className={styles.statLabel}>Planning</div>
            </div>
          </div>

          {/* Volume & Ratings Section */}
          <div className={styles.statsSectionTitle} style={{ marginTop: 'var(--za-space-3)' }}>Activity & Ratings</div>
          <div className={styles.statsGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))' }}>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Tv size={16} /> {totalEpisodes}
              </div>
              <div className={styles.statLabel}>Episodes Watched</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <BookOpen size={16} /> {totalChapters}
              </div>
              <div className={styles.statLabel}>Chapters / Pages</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Star size={16} fill="currentColor" /> {avgRating}
              </div>
              <div className={styles.statLabel}>Avg Rating ({ratedEntries.length} rated)</div>
            </div>
          </div>

          {/* Top Rated Titles */}
          {topRated.length > 0 && (
            <div style={{ marginTop: 'var(--za-space-4)', borderTop: 'var(--za-border-width) solid var(--za-color-border-decorative)', paddingTop: 'var(--za-space-3)' }}>
              <div className={styles.statsSectionTitle}>
                TOP RATED ENTRIES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {topRated.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.65rem', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-small)', border: 'var(--za-border-width) solid var(--za-color-border-decorative)' }}>
                    <span style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </span>
                    <span className={styles.ratingBadge}>
                      <Star size={10} fill="currentColor" /> {item.rating}/10
                    </span>
                  </div>
                ))}
              </div>
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
