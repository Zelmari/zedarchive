'use client';

import { useState } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import styles from './dashboard.module.css';

export default function ShowCard({ item, onUpdate, onDelete }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const category = item.category || (item.type === 'anime' ? 'anime' : 'show');
  const isAnime = category === 'anime';

  const primaryUnitCurrent = item.primaryUnitCurrent ?? item.currentSeason ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? item.totalSeasons ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? item.currentProgress ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? item.totalUnits ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const hasNextSeason = primaryUnitCurrent < primaryUnitTotal || structure.some((s) => s.number > primaryUnitCurrent);

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

    onUpdate(item.id, updates);
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEpisodeChange = async (delta) => {
    if (delta < 0) {
      if (secondaryUnitCurrent <= 0) return;
      const nextProgress = secondaryUnitCurrent - 1;
      const updates = { secondaryUnitCurrent: nextProgress };

      onUpdate(item.id, updates);
      try {
        setIsUpdating(true);
        await onUpdate(item.id, updates, true);
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

    onUpdate(item.id, updates);
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
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

    onUpdate(item.id, updates);
    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const progressPercentage = secondaryUnitTotal
    ? Math.min(100, Math.round((secondaryUnitCurrent / secondaryUnitTotal) * 100))
    : 0;

  const getInitials = (titleStr) => {
    if (!titleStr) return isAnime ? 'AN' : 'TV';
    const words = titleStr.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const formattedEp =
    secondaryUnitTotal && secondaryUnitTotal >= 10 && secondaryUnitCurrent < 10
      ? `0${secondaryUnitCurrent}`
      : `${secondaryUnitCurrent}`;

  const formattedTotal = secondaryUnitTotal ? `${secondaryUnitTotal}` : null;

  return (
    <article className={`za-card za-card--raised ${styles.mediaCard}`} aria-label={`${item.title} card`}>
      <div className={styles.cardTopSection}>
        {/* 2:3 Aspect Ratio Tile / Cover */}
        <div className={styles.coverWrapper}>
          {item.coverImage ? (
            <img
              src={item.coverImage}
              alt={item.title}
              className={styles.coverImage}
              loading="lazy"
            />
          ) : (
            <div className="za-title-tile" style={{ width: '100%', height: '100%' }}>
              <span>{getInitials(item.title)}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className={styles.cardDetails}>
          <div className={styles.cardTopRow}>
            <div className={styles.cardTitleGroup}>
              <h3 className={styles.cardTitle} title={item.title}>
                {item.title}
              </h3>
            </div>
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

          {/* Badges Row */}
          <div className={styles.badgeRow}>
            <span className={styles.metaBadge}>
              S{primaryUnitCurrent}{primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
            </span>
            <span className={styles.metaBadge}>{isAnime ? 'Anime' : 'TV Series'}</span>
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
        </div>
      </div>

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

