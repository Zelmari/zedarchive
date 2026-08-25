'use client';

import { useState } from 'react';
import { Trash2, Pencil, ChevronLeft, ChevronRight, Minus, Plus, Star, FileText } from 'lucide-react';
import { getInitials } from '@/lib/format';
import styles from './dashboard.module.css';

export default function BookCard({ item, onUpdate, onDelete, onEdit, onOpenDetail }) {
  const [showNotes, setShowNotes] = useState(false);
  const category = item.category || (item.type === 'manga' ? 'manga' : 'book');
  const isManga = category === 'manga';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryUnitCurrent = item.primaryUnitCurrent ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? item.currentProgress ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? item.totalUnits ?? null;

  const [prevProgress, setPrevProgress] = useState(secondaryUnitCurrent);
  const [inputValue, setInputValue] = useState(String(secondaryUnitCurrent));
  const [isUpdating, setIsUpdating] = useState(false);

  if (prevProgress !== secondaryUnitCurrent) {
    setPrevProgress(secondaryUnitCurrent);
    setInputValue(String(secondaryUnitCurrent));
  }

  const isAtFinalChapter =
    primaryUnitCurrent >= primaryUnitTotal &&
    secondaryUnitTotal !== null &&
    secondaryUnitTotal !== undefined &&
    secondaryUnitCurrent >= secondaryUnitTotal;

  const canDecrement = secondaryUnitCurrent > 0;
  const canIncrement =
    secondaryUnitTotal === null ||
    secondaryUnitTotal === undefined ||
    secondaryUnitCurrent < secondaryUnitTotal;

  const commitChapterValue = async (newVal) => {
    let parsed = parseInt(newVal, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    if (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && parsed > secondaryUnitTotal) {
      parsed = secondaryUnitTotal;
    }

    setInputValue(String(parsed));

    if (parsed === secondaryUnitCurrent) return;

    try {
      setIsUpdating(true);
      await onUpdate(item.id, { secondaryUnitCurrent: parsed });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProgressChange = async (delta) => {
    const nextVal = Math.max(0, secondaryUnitCurrent + delta);
    if (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && nextVal > secondaryUnitTotal) {
      return;
    }
    await commitChapterValue(nextVal);
  };

  const handleStep = handleProgressChange;

  const handleVolumeChange = async (delta) => {
    const nextVol = Math.max(1, Math.min(primaryUnitTotal, primaryUnitCurrent + delta));
    if (nextVol === primaryUnitCurrent) return;

    try {
      setIsUpdating(true);
      await onUpdate(item.id, {
        primaryUnitCurrent: nextVol,
        secondaryUnitCurrent: 0,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkCompleted = async () => {
    try {
      setIsUpdating(true);
      await onUpdate(item.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'completed': return styles.statusBadgeCompleted;
      case 'planning': return styles.statusBadgePlanning;
      case 'on_hold': return styles.statusBadgeOnHold;
      case 'dropped': return styles.statusBadgeDropped;
      case 'in_progress':
      default:
        return styles.statusBadgeInProgress;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'planning': return 'Plan to Read';
      case 'on_hold': return 'On Hold';
      case 'dropped': return 'Dropped';
      case 'in_progress':
      default:
        return 'Reading';
    }
  };

  const progressPercentage = secondaryUnitTotal
    ? Math.min(100, Math.round((secondaryUnitCurrent / secondaryUnitTotal) * 100))
    : 0;

  return (
    <article className={`za-card za-card--raised ${styles.mediaCard}`} aria-label={`${item.title} card`}>
      <div className={styles.cardTopSection}>
        {/* 2:3 Aspect Ratio Tile / Cover */}
        <div
          className={styles.coverWrapper}
          onClick={() => onOpenDetail && onOpenDetail(item)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onOpenDetail) {
              e.preventDefault();
              onOpenDetail(item);
            }
          }}
          role={onOpenDetail ? 'button' : undefined}
          tabIndex={onOpenDetail ? 0 : undefined}
          aria-label={onOpenDetail ? `Open details for ${item.title}` : undefined}
          style={{ cursor: onOpenDetail ? 'pointer' : 'default' }}
          title={onOpenDetail ? `Open details for ${item.title}` : undefined}
        >
          {item.coverImage ? (
            <img
              src={item.coverImage}
              alt={item.title}
              className={styles.coverImage}
              loading="lazy"
            />
          ) : (
            <div className="za-title-tile" style={{ width: '100%', height: '100%' }}>
              <span>{getInitials(item.title, isManga ? 'MG' : 'BK')}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className={styles.cardDetails}>
          <div className={styles.cardTopRow}>
            <div className={styles.cardTitleGroup}>
              <h3
                className={styles.cardTitle}
                title={item.title}
                onClick={() => onOpenDetail && onOpenDetail(item)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onOpenDetail) {
                    e.preventDefault();
                    onOpenDetail(item);
                  }
                }}
                role={onOpenDetail ? 'button' : undefined}
                tabIndex={onOpenDetail ? 0 : undefined}
                aria-label={onOpenDetail ? `Open details for ${item.title}` : undefined}
                style={{ cursor: onOpenDetail ? 'pointer' : 'default' }}
              >
                {item.title}
              </h3>
            </div>
            <div className={styles.cardActionsGroup}>
              {onEdit && (
                <button
                  type="button"
                  className={styles.editMiniBtn}
                  onClick={() => onEdit(item)}
                  title={`Edit ${item.title}`}
                  aria-label={`Edit ${item.title}`}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className={styles.deleteMiniBtn}
                  onClick={() => onDelete(item.id)}
                  title={`Remove ${item.title}`}
                  aria-label={`Remove ${item.title}`}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>

          {/* Badges Row */}
          <div className={styles.badgeRow}>
            <span className={`${styles.metaBadge} ${getStatusBadgeClass()}`}>
              {getStatusLabel()}
            </span>
            {rating != null && (
              <span className={styles.ratingBadge} title={`Rated ${rating}/10`}>
                <Star size={11} className={styles.ratingStarIcon} fill="currentColor" />
                <span>{rating}</span>
              </span>
            )}
            {primaryUnitTotal > 1 && (
              <span className={styles.metaBadge}>
                Vol {primaryUnitCurrent} / {primaryUnitTotal}
              </span>
            )}
            <span className={styles.metaBadge}>{isManga ? 'Manga' : 'Book'}</span>
            {tags.slice(0, 2).map((t) => (
              <span key={t} className={styles.metaBadge} style={{ fontSize: '0.68rem', color: 'var(--za-color-text-muted)' }}>
                #{t}
              </span>
            ))}
          </div>

          {/* Multi-Volume Stepper Row (if applicable) */}
          {primaryUnitTotal > 1 && (
            <div className={styles.seasonRow}>
              <span>Volume {primaryUnitCurrent} of {primaryUnitTotal}</span>
              <div className={styles.seasonStepper}>
                <button
                  type="button"
                  className={styles.seasonMiniBtn}
                  onClick={() => handleVolumeChange(-1)}
                  disabled={primaryUnitCurrent <= 1 || isUpdating}
                  title="Previous volume"
                  aria-label="Previous volume"
                >
                  <ChevronLeft size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={styles.seasonMiniBtn}
                  onClick={() => handleVolumeChange(1)}
                  disabled={primaryUnitCurrent >= primaryUnitTotal || isUpdating}
                  title="Next volume"
                  aria-label="Next volume"
                >
                  <ChevronRight size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}

          {/* Notes Toggle */}
          {item.notes && (
            <div className={styles.cardNotesSection}>
              <button
                type="button"
                className={styles.notesToggleBtn}
                onClick={() => setShowNotes((p) => !p)}
              >
                <FileText size={12} />
                <span>{showNotes ? 'Hide note' : 'View note'}</span>
              </button>
              {showNotes && (
                <div className={styles.cardNotesDrawer}>
                  {item.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Completion Prompt (if user reached end of book but not marked completed) */}
      {isAtFinalChapter && status !== 'completed' && (
        <div className={styles.completionPromptRow}>
          <span>Finished reading!</span>
          <button
            type="button"
            className={styles.markCompleteBtn}
            onClick={handleMarkCompleted}
            disabled={isUpdating}
          >
            Mark Completed
          </button>
        </div>
      )}

      {/* Action Zone / Controls */}
      <div className={styles.cardActionZone}>
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleStep(-1)}
            disabled={!canDecrement || isUpdating}
            title="Decrement chapter/page"
            aria-label="Decrement chapter/page"
          >
            <Minus size={15} strokeWidth={2.2} />
          </button>
          <input
            type="number"
            min="0"
            max={secondaryUnitTotal || undefined}
            className={styles.numericInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={(e) => commitChapterValue(e.target.value)}
            onKeyDown={handleKeyDown}
            title="Type number and press Enter or click outside"
            aria-label="Current chapter or page"
          />
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleStep(1)}
            disabled={!canIncrement || isUpdating}
            title="Increment chapter/page"
            aria-label="Increment chapter/page"
          >
            <Plus size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* Progress bar */}
        {secondaryUnitTotal ? (
          <div className={styles.progressBarSection}>
            <div className={styles.progressBarContainer}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className={styles.progressPercent}>{progressPercentage}%</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

