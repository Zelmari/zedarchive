'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export default function ShowCard({ item, onUpdate, onDelete }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const category = item.category || (item.type === 'anime' ? 'anime' : 'show');
  const isAnime = category === 'anime';

  const primaryUnitCurrent = item.primaryUnitCurrent ?? item.currentSeason ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? item.totalSeasons ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? item.currentProgress ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? item.totalUnits ?? null; // Total episodes in current season
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const hasNextSeason = primaryUnitCurrent < primaryUnitTotal || structure.some((s) => s.number > primaryUnitCurrent);

  const canDecrementEp = secondaryUnitCurrent > 0;
  const canIncrementEp =
    secondaryUnitTotal === null ||
    secondaryUnitTotal === undefined ||
    secondaryUnitCurrent < secondaryUnitTotal ||
    hasNextSeason;

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

    // Increment (delta > 0)
    if (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && secondaryUnitCurrent >= secondaryUnitTotal) {
      // Reached max episodes for current season
      if (hasNextSeason) {
        const nextSeason = primaryUnitCurrent + 1;
        const nextSeasonObj = structure.find((s) => s.number === nextSeason);
        const nextSeasonTotal = nextSeasonObj && nextSeasonObj.total !== null && nextSeasonObj.total !== undefined
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
    const nextSeasonTotal = nextSeasonObj && nextSeasonObj.total !== null && nextSeasonObj.total !== undefined
      ? nextSeasonObj.total
      : null;

    const updates = {
      primaryUnitCurrent: nextSeason,
      secondaryUnitCurrent: 0,
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
              {item.title ? item.title.charAt(0).toUpperCase() : isAnime ? 'A' : 'S'}
            </span>
          </div>
        )}

        <div className={styles.badgeOverlay}>
          <span className={styles.typeBadge}>{isAnime ? 'Anime' : 'Show'}</span>
          <span className={styles.seasonBadge}>
            S{primaryUnitCurrent}{primaryUnitTotal > 1 ? ` / ${primaryUnitTotal}` : ''}
          </span>
        </div>

        {onDelete && (
          <button
            type="button"
            className={styles.cardDeleteBtn}
            onClick={() => onDelete(item.id)}
            title={`Delete ${isAnime ? 'anime' : 'show'}`}
            aria-label={`Delete ${isAnime ? 'anime' : 'show'}`}
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
              Ep. {secondaryUnitCurrent}{secondaryUnitTotal ? ` / ${secondaryUnitTotal}` : ''}
            </span>
            {secondaryUnitTotal ? (
              <span>{progressPercentage}%</span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ongoing</span>
            )}
          </div>
          {secondaryUnitTotal ? (
            <div className={styles.progressBarContainer}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          ) : null}
        </div>

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
                ◀
              </button>
              <button
                type="button"
                className={styles.seasonMiniBtn}
                onClick={() => handleSeasonChange(1)}
                disabled={primaryUnitCurrent >= primaryUnitTotal || isUpdating}
                title="Next season"
                aria-label="Next season"
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
            Ep. {secondaryUnitCurrent}
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
            ►
          </button>
        </div>
      </div>
    </div>
  );
}
