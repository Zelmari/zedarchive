'use client';

import { useState } from 'react';
import { X, Pencil, Star, RotateCcw, Tag, FileText, Tv, BookOpen } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

export default function MediaDetailModal({ isOpen, onClose, item, onUpdate, onEdit }) {
  const modalRef = useFocusTrap(isOpen, onClose);
  const [activeSeason, setActiveSeason] = useState(1);
  const [newTagInput, setNewTagInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen || !item) return null;

  const category = item.category || (item.type === 'anime' ? 'anime' : item.type === 'book' ? 'book' : 'show');
  const isBookLike = category === 'book' || category === 'manga';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryCurrent = item.primaryUnitCurrent ?? 1;
  const primaryTotal = item.primaryUnitTotal ?? 1;
  const secondaryCurrent = item.secondaryUnitCurrent ?? 0;
  const secondaryTotal = item.secondaryUnitTotal ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const handleStartRewatch = async () => {
    const nextRewatchCount = (item.rewatchCount || 0) + 1;
    const updates = {
      rewatchCount: nextRewatchCount,
      primaryUnitCurrent: 1,
      secondaryUnitCurrent: 0,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    };

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetEpisode = async (epNumber, seasonNumber) => {
    const updates = {};
    if (seasonNumber && seasonNumber !== primaryCurrent) {
      updates.primaryUnitCurrent = seasonNumber;
      const seasonObj = structure.find((s) => s.number === seasonNumber);
      if (seasonObj && seasonObj.total) {
        updates.secondaryUnitTotal = seasonObj.total;
      }
    }
    updates.secondaryUnitCurrent = epNumber;

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    const clean = newTagInput.trim().toLowerCase();
    if (!clean || tags.includes(clean)) return;

    const nextTags = [...tags, clean];
    setNewTagInput('');
    await onUpdate(item.id, { tags: nextTags }, true);
  };

  const handleRemoveTag = async (tagToRemove) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    await onUpdate(item.id, { tags: nextTags }, true);
  };

  // Determine episodes for current selected season
  const currentSeasonObj = structure.find((s) => s.number === activeSeason);
  const totalUnitsInSeason = currentSeasonObj?.total || (activeSeason === primaryCurrent ? secondaryTotal : null) || 24;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modalContent}`}
        style={{ maxWidth: '44rem', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-detail-title"
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            {isBookLike ? <BookOpen size={20} /> : <Tv size={20} />}
            <h2 id="media-detail-title" className={styles.modalTitle} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </h2>
          </div>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Content Layout */}
        <div style={{ padding: 'var(--za-space-4) var(--za-space-6)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--za-space-5)' }}>
            {/* Left Column: Artwork & Metadata */}
            <div>
              <div style={{ width: '100%', maxWidth: '14rem', aspectRatio: '2/3', borderRadius: 'var(--za-radius-control)', overflow: 'hidden', border: 'var(--za-border-width) solid var(--za-color-border-required)', backgroundColor: 'var(--za-color-surface-subtle)', margin: '0 auto' }}>
                {item.coverImage ? (
                  <img src={item.coverImage} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.5rem' }}>
                    {item.title ? item.title.slice(0, 2).toUpperCase() : '??'}
                  </div>
                )}
              </div>

              {/* Status & Rating Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'var(--za-space-3)' }}>
                <span className={styles.metaBadge} style={{ textTransform: 'capitalize' }}>
                  {status.replace('_', ' ')}
                </span>
                {rating != null && (
                  <span className={styles.ratingBadge}>
                    <Star size={11} fill="currentColor" /> {rating}/10
                  </span>
                )}
                <span className={styles.metaBadge}>
                  {isBookLike ? `Vol ${primaryCurrent}/${primaryTotal}` : `Season ${primaryCurrent}/${primaryTotal}`}
                </span>
              </div>

              {/* Rewatch / Reread Tracker */}
              <div style={{ marginTop: 'var(--za-space-4)', padding: 'var(--za-space-3)', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-control)', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)' }}>
                  {isBookLike ? 'Reread History' : 'Rewatch History'}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'var(--za-weight-heading)', margin: '0.2rem 0' }}>
                  {item.rewatchCount || 0} {item.rewatchCount === 1 ? 'time' : 'times'}
                </div>
                <button
                  type="button"
                  className="za-button za-button--secondary"
                  style={{ width: '100%', fontSize: 'var(--za-text-fine)', marginTop: '0.4rem' }}
                  onClick={handleStartRewatch}
                  disabled={isUpdating}
                >
                  <RotateCcw size={12} style={{ marginRight: 4 }} />
                  {isBookLike ? 'Start Reread' : 'Start Rewatch'}
                </button>
              </div>

              {/* Custom Tags / Shelves */}
              <div style={{ marginTop: 'var(--za-space-4)' }}>
                <div style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', color: 'var(--za-color-text-muted)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag size={12} /> Tags & Shelves
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                  {tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--za-radius-small)',
                        background: 'var(--za-color-surface-subtle)',
                        border: 'var(--za-border-width) solid var(--za-color-border-decorative)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      #{t}
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--za-color-text-muted)', padding: 0 }}
                        onClick={() => handleRemoveTag(t)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '0.3rem' }}>
                  <input
                    type="text"
                    placeholder="Add tag (e.g. favorites)..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    style={{
                      flex: 1,
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.4rem',
                      border: 'var(--za-border-width) solid var(--za-color-border-required)',
                      borderRadius: 'var(--za-radius-small)',
                      background: 'var(--za-color-surface)',
                      color: 'var(--za-color-text)',
                    }}
                  />
                  <button type="submit" className="za-button za-button--secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                    +
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Progress Checklist, Notes & Synopsis */}
            <div>
              {/* Synopsis if available */}
              {item.synopsis && (
                <div style={{ marginBottom: 'var(--za-space-4)' }}>
                  <div style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', color: 'var(--za-color-text-muted)', marginBottom: '0.2rem' }}>
                    SYNOPSIS
                  </div>
                  <p style={{ fontSize: 'var(--za-text-fine)', lineHeight: 'var(--za-leading-body)', color: 'var(--za-color-text)' }}>
                    {item.synopsis}
                  </p>
                </div>
              )}

              {/* Progress Checklist */}
              <div>
                <div style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-2)' }}>
                  {isBookLike ? 'CHAPTER / PAGE QUICK JUMP' : 'EPISODE QUICK JUMP'}
                </div>

                {/* Season Tabs (if multi-season) */}
                {structure.length > 1 && (
                  <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', paddingBottom: '0.4rem', marginBottom: '0.5rem' }}>
                    {structure.map((s) => (
                      <button
                        key={s.number}
                        type="button"
                        className={`${styles.statusPillBtn} ${activeSeason === s.number ? styles.statusPillActive : ''}`}
                        onClick={() => setActiveSeason(s.number)}
                      >
                        {s.name || `Season ${s.number}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Unit Numbers Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))', gap: '0.35rem', maxHeight: '12rem', overflowY: 'auto', padding: 'var(--za-space-2)', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-control)', border: 'var(--za-border-width) solid var(--za-color-border-decorative)' }}>
                  {Array.from({ length: Math.min(100, Math.max(1, totalUnitsInSeason)) }).map((_, i) => {
                    const unitNum = i + 1;
                    const isDone = activeSeason < primaryCurrent || (activeSeason === primaryCurrent && unitNum <= secondaryCurrent);
                    const isCurrent = activeSeason === primaryCurrent && unitNum === secondaryCurrent;

                    return (
                      <button
                        key={unitNum}
                        type="button"
                        onClick={() => handleSetEpisode(unitNum, activeSeason)}
                        disabled={isUpdating}
                        style={{
                          height: '2.2rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'var(--za-text-fine)',
                          fontWeight: isCurrent ? 'bold' : 'normal',
                          background: isCurrent ? 'var(--za-color-accent)' : isDone ? 'rgba(46, 125, 50, 0.15)' : 'var(--za-color-surface)',
                          color: isCurrent ? 'var(--za-color-on-accent)' : isDone ? '#2e7d32' : 'var(--za-color-text)',
                          border: `1px solid ${isCurrent ? 'var(--za-color-accent)' : isDone ? 'rgba(46, 125, 50, 0.4)' : 'var(--za-color-border-decorative)'}`,
                          borderRadius: 'var(--za-radius-small)',
                          cursor: 'pointer',
                        }}
                      >
                        {unitNum}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Personal Notes */}
              {item.notes && (
                <div style={{ marginTop: 'var(--za-space-4)' }}>
                  <div style={{ fontSize: 'var(--za-text-fine)', fontWeight: 'var(--za-weight-emphasis)', color: 'var(--za-color-text-muted)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FileText size={12} /> PERSONAL NOTES
                  </div>
                  <div style={{ padding: 'var(--za-space-3)', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-control)', fontSize: 'var(--za-text-fine)', whiteSpace: 'pre-wrap', border: 'var(--za-border-width) solid var(--za-color-border-decorative)' }}>
                    {item.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--za-space-5)', borderTop: 'var(--za-border-width) solid var(--za-color-border-decorative)', paddingTop: 'var(--za-space-3)' }}>
            <button
              type="button"
              className="za-button za-button--secondary"
              onClick={() => {
                onClose();
                if (onEdit) onEdit(item);
              }}
            >
              <Pencil size={14} style={{ marginRight: 6 }} /> Edit All Details
            </button>

            <button type="button" className="za-button za-button--primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
