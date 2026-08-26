'use client';

import { useState } from 'react';
import { Trash2, Pencil, ChevronLeft, ChevronRight, Minus, Plus, Star, FileText } from 'lucide-react';
import { getInitials } from '@/lib/format';
import styles from './dashboard.module.css';

export default function ShowCard({ item, onUpdate, onDelete, onEdit, onOpenDetail }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const category = item.category || (item.type === 'anime' ? 'anime' : 'show');
  const isAnime = category === 'anime';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];

  const primaryUnitCurrent = item.primaryUnitCurrent ?? item.currentSeason ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? item.totalSeasons ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? item.currentProgress ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? item.totalUnits ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const hasNextSeason = primaryUnitCurrent < primaryUnitTotal || structure.some((s) => s.number > primaryUnitCurrent);

  const isAtFinalEpisode =
    !hasNextSeason &&
    secondaryUnitTotal !== null &&
    secondaryUnitTotal !== undefined &&
    secondaryUnitCurrent >= secondaryUnitTotal;

  const canDecrementEp = secondaryUnitCurrent > 0;
  const canIncrementEp =
    hasNextSeason ||
    (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && secondaryUnitCurrent < secondaryUnitTotal);

  const advanceToNextSeason = async () => {
    const nextSeason = primaryUnitCurrent + 1;
    const nextSeasonObj = structure.find((s) => s.number === nextSeason);
    const nextSeasonTotal =
      nextSeasonObj && nextSeasonObj.total !== null && nextSeasonObj.total !== undefined
        ? nextSeasonObj.total
        : null;

    const updates = {
      primaryUnitCurrent: nextSeason,
      secondaryUnitCurrent: 1,
      secondaryUnitTotal: nextSeasonTotal,
    };

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEpisodeChange = async (delta) => {
    if (delta < 0) {
      if (secondaryUnitCurrent <= 0) return;
      const nextProgress = secondaryUnitCurrent - 1;
      const updates = { secondaryUnitCurrent: nextProgress };

      try {
        setIsUpdating(true);
        await onUpdate(item.id, updates);
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    const totalKnown =
      secondaryUnitTotal !== null && secondaryUnitTotal !== undefined;

    if (!totalKnown || secondaryUnitCurrent >= secondaryUnitTotal) {
      if (hasNextSeason) {
        await advanceToNextSeason();
      }
      return;
    }

    const nextProgress = secondaryUnitCurrent + 1;
    const updates = { secondaryUnitCurrent: nextProgress };

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSeasonChange = async (delta) => {
    const nextSeason = primaryUnitCurrent + delta;
    if (nextSeason < 1) return;
    if (primaryUnitTotal && nextSeason > primaryUnitTotal) return;

    const nextSeasonObj = structure.find((s) => s.number === nextSeason);
    const nextSeasonTotal =
      nextSeasonObj && nextSeasonObj.total !== null && nextSeasonObj.total !== undefined
        ? nextSeasonObj.total
        : null;

    const updates = {
      primaryUnitCurrent: nextSeason,
      secondaryUnitCurrent: 1,
      secondaryUnitTotal: nextSeasonTotal,
    };

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkCompleted = async () => {
    const updates = { status: 'completed', completedAt: new Date().toISOString() };
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates);
    } finally {
      setIsUpdating(false);
    }
  };

  const progressPercentage = secondaryUnitTotal
    ? Math.min(100, Math.round((secondaryUnitCurrent / secondaryUnitTotal) * 100))
    : 0;

  const formattedEp =
    secondaryUnitTotal && secondaryUnitTotal >= 10 && secondaryUnitCurrent < 10
      ? `0${secondaryUnitCurrent}`
      : `${secondaryUnitCurrent}`;

  const formattedTotal = secondaryUnitTotal ? `${secondaryUnitTotal}` : null;

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'completed': return styles.statusBadgeCompleted;
      case 'planning': return styles.statusBadgePlanning;
      case 'on_hold': return styles.statusBadgeOnHold;
      case 'dropped': return styles.statusBadgeDropped;
      default: return styles.statusBadgeInProgress;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'planning': return 'Planning';
      case 'on_hold': return 'On Hold';
      case 'dropped': return 'Dropped';
      default: return 'In Progress';
    }
  };

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
              <span>{getInitials(item.title, isAnime ? 'AN' : 'TV')}</span>
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
            <span className={styles.metaBadge}>
              S{primaryUnitCurrent}{primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
            </span>
            <span className={styles.metaBadge}>{isAnime ? 'Anime' : 'TV Series'}</span>
            {tags.slice(0, 2).map((t) => (
              <span key={t} className={styles.metaBadge} style={{ fontSize: '0.68rem', color: 'var(--za-color-text-muted)' }}>
                #{t}
              </span>
            ))}
          </div>

          {/* Multi-Season Stepper Row (if applicable) */}
          {primaryUnitTotal > 1 && (
            <div className={styles.seasonRow}>
              <span>Season {primaryUnitCurrent} of {primaryUnitTotal}</span>
              <div className={styles.seasonStepper}>
                <button
                  type="button"
                  className={styles.seasonMiniBtn}
                  onClick={() => handleSeasonChange(-1)}
                  disabled={primaryUnitCurrent <= 1 || isUpdating}
                  title="Previous season"
                  aria-label="Previous season"
                >
                  <ChevronLeft size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={styles.seasonMiniBtn}
                  onClick={() => handleSeasonChange(1)}
                  disabled={primaryUnitCurrent >= primaryUnitTotal || isUpdating}
                  title="Next season"
                  aria-label="Next season"
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

      {/* Completion Prompt (if user reached end of final season but not marked completed) */}
      {isAtFinalEpisode && status !== 'completed' && (
        <div className={styles.completionPromptRow}>
          <span>Series completed!</span>
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

      {/* Action Zone / Stepper Controls */}
      <div className={styles.cardActionZone}>
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleEpisodeChange(-1)}
            disabled={!canDecrementEp || isUpdating}
            title="Decrement episode"
            aria-label="Decrement episode"
          >
            <Minus size={15} strokeWidth={2.2} />
          </button>
          <div className={styles.progressDisplay}>
            Ep {formattedEp}{formattedTotal ? ` / ${formattedTotal}` : ''}
          </div>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleEpisodeChange(1)}
            disabled={!canIncrementEp || isUpdating}
            title={
              secondaryUnitTotal && secondaryUnitCurrent >= secondaryUnitTotal && hasNextSeason
                ? 'Advance to next season (Ep 1)'
                : 'Increment episode'
            }
            aria-label="Increment episode"
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

