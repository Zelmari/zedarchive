'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export default function ShowCard({ item, onUpdate, onDelete }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const currentSeason = item.currentSeason ?? 1;
  const totalSeasons = item.totalSeasons ?? 1;
  const currentProgress = item.currentProgress ?? 0;
  const totalUnits = item.totalUnits; // Total episodes in current season

  const canDecrementEp = currentProgress > 0;
  const canIncrementEp = totalUnits === null || totalUnits === undefined || currentProgress < totalUnits;

  const handleEpisodeChange = async (delta) => {
    let nextProgress = currentProgress + delta;
    if (nextProgress < 0) nextProgress = 0;
    if (totalUnits !== null && totalUnits !== undefined && nextProgress > totalUnits) {
      nextProgress = totalUnits;
    }

    if (nextProgress === currentProgress) return;

    // Optimistic update
    onUpdate(item.id, { currentProgress: nextProgress });

    try {
      setIsUpdating(true);
      await onUpdate(item.id, { currentProgress: nextProgress }, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSeasonChange = async (delta) => {
    let nextSeason = currentSeason + delta;
    if (nextSeason < 1) nextSeason = 1;
    if (totalSeasons && nextSeason > totalSeasons) {
      nextSeason = totalSeasons;
    }

    if (nextSeason === currentSeason) return;

    onUpdate(item.id, { currentSeason: nextSeason });
    try {
      setIsUpdating(true);
      await onUpdate(item.id, { currentSeason: nextSeason }, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const progressPercentage = totalUnits
    ? Math.min(100, Math.round((currentProgress / totalUnits) * 100))
    : 0;

  return (
    <div className={styles.card}>
      <div className={styles.coverContainer}>
        {item.coverImage ? (
          <img
            src={item.coverImage}
            alt={item.title}
            className={styles.coverImage}
            loading="lazy"
          />
        ) : (
          <div className={styles.coverPlaceholder}>
            <span className={styles.placeholderLetter}>
              {item.title ? item.title.charAt(0).toUpperCase() : 'S'}
            </span>
          </div>
        )}

        <div className={styles.badgeOverlay}>
          <span className={styles.typeBadge}>Show</span>
          <span className={styles.seasonBadge}>
            S{currentSeason}{totalSeasons > 1 ? ` / ${totalSeasons}` : ''}
          </span>
        </div>

        {onDelete && (
          <button
            type="button"
            className={styles.cardDeleteBtn}
            onClick={() => onDelete(item.id)}
            title="Delete show"
            aria-label="Delete show"
          >
            ✕
          </button>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle} title={item.title}>
            {item.title}
          </h3>
          <div className={styles.progressMeta}>
            <span className={styles.progressLabel}>
              Ep. {currentProgress}{totalUnits ? ` / ${totalUnits}` : ''}
            </span>
            {totalUnits ? (
              <span>{progressPercentage}%</span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ongoing</span>
            )}
          </div>
          {totalUnits && (
            <div className={styles.progressBarContainer}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          )}
        </div>

        {totalSeasons > 1 && (
          <div className={styles.seasonRow}>
            <span>Season {currentSeason} of {totalSeasons}</span>
            <div className={styles.seasonStepper}>
              <button
                type="button"
                className={styles.seasonMiniBtn}
                onClick={() => handleSeasonChange(-1)}
                disabled={currentSeason <= 1}
                title="Previous season"
              >
                ◀
              </button>
              <button
                type="button"
                className={styles.seasonMiniBtn}
                onClick={() => handleSeasonChange(1)}
                disabled={currentSeason >= totalSeasons}
                title="Next season"
              >
                ▶
              </button>
            </div>
          </div>
        )}

        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleEpisodeChange(-1)}
            disabled={!canDecrementEp || isUpdating}
            title="Decrement episode"
            aria-label="Decrement episode"
          >
            ◄
          </button>
          <div className={styles.progressDisplay}>
            Ep. {currentProgress}
          </div>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleEpisodeChange(1)}
            disabled={!canIncrementEp || isUpdating}
            title="Increment episode"
            aria-label="Increment episode"
          >
            ►
          </button>
        </div>
      </div>
    </div>
  );
}
