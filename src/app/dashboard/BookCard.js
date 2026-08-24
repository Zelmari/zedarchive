'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export default function BookCard({ item, onUpdate, onDelete }) {
  const category = item.category || (item.type === 'manga' ? 'manga' : 'book');
  const isManga = category === 'manga';

  const primaryUnitCurrent = item.primaryUnitCurrent ?? 1;
  const primaryUnitTotal = item.primaryUnitTotal ?? 1;
  const secondaryUnitCurrent = item.secondaryUnitCurrent ?? item.currentProgress ?? 0;
  const secondaryUnitTotal = item.secondaryUnitTotal ?? item.totalUnits ?? null; // Total chapters/pages

  const [prevProgress, setPrevProgress] = useState(secondaryUnitCurrent);
  const [inputValue, setInputValue] = useState(String(secondaryUnitCurrent));
  const [isUpdating, setIsUpdating] = useState(false);

  if (prevProgress !== secondaryUnitCurrent) {
    setPrevProgress(secondaryUnitCurrent);
    setInputValue(String(secondaryUnitCurrent));
  }

  const canDecrement = secondaryUnitCurrent > 0;
  const canIncrement = secondaryUnitTotal === null || secondaryUnitTotal === undefined || secondaryUnitCurrent < secondaryUnitTotal;

  const commitChapterValue = async (newVal) => {
    let parsed = parseInt(newVal, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    if (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && parsed > secondaryUnitTotal) {
      parsed = secondaryUnitTotal;
    }

    setInputValue(String(parsed));

    if (parsed === secondaryUnitCurrent) return;

    // Optimistic update
    const updates = { secondaryUnitCurrent: parsed };
    onUpdate(item.id, updates);

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStep = async (delta) => {
    let nextVal = secondaryUnitCurrent + delta;
    if (nextVal < 0) nextVal = 0;
    if (secondaryUnitTotal !== null && secondaryUnitTotal !== undefined && nextVal > secondaryUnitTotal) {
      nextVal = secondaryUnitTotal;
    }

    if (nextVal === secondaryUnitCurrent) return;

    setInputValue(String(nextVal));
    const updates = { secondaryUnitCurrent: nextVal };
    onUpdate(item.id, updates);

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVolumeChange = async (delta) => {
    const nextVol = primaryUnitCurrent + delta;
    if (nextVol < 1) return;
    if (primaryUnitTotal && nextVol > primaryUnitTotal) return;

    const updates = { primaryUnitCurrent: nextVol };
    onUpdate(item.id, updates);

    try {
      setIsUpdating(true);
      await onUpdate(item.id, updates, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
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
              {item.title ? item.title.charAt(0).toUpperCase() : isManga ? 'M' : 'B'}
            </span>
          </div>
        )}

        <div className={styles.badgeOverlay}>
          <span className={styles.typeBadge}>{isManga ? 'Manga' : 'Book'}</span>
          {primaryUnitTotal > 1 && (
            <span className={styles.seasonBadge}>
              Vol {primaryUnitCurrent} / {primaryUnitTotal}
            </span>
          )}
        </div>

        {onDelete && (
          <button
            type="button"
            className={styles.cardDeleteBtn}
            onClick={() => onDelete(item.id)}
            title={`Delete ${isManga ? 'manga' : 'book'}`}
            aria-label={`Delete ${isManga ? 'manga' : 'book'}`}
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
              {isManga ? 'Ch.' : 'Ch./Pg.'} {secondaryUnitCurrent}{secondaryUnitTotal ? ` / ${secondaryUnitTotal}` : ''}
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
            <span>Volume {primaryUnitCurrent} of {primaryUnitTotal}</span>
            <div className={styles.seasonStepper}>
              <button
                type="button"
                className={styles.seasonMiniBtn}
                onClick={() => handleVolumeChange(-1)}
                disabled={primaryUnitCurrent <= 1 || isUpdating}
                title="Previous volume"
              >
                ◀
              </button>
              <button
                type="button"
                className={styles.seasonMiniBtn}
                onClick={() => handleVolumeChange(1)}
                disabled={primaryUnitCurrent >= primaryUnitTotal || isUpdating}
                title="Next volume"
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
            onClick={() => handleStep(-1)}
            disabled={!canDecrement || isUpdating}
            title="Decrement chapter/page"
            aria-label="Decrement chapter/page"
          >
            ◄
          </button>
          <input
            type="number"
            min="0"
            max={secondaryUnitTotal || undefined}
            className={styles.chapterInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={(e) => commitChapterValue(e.target.value)}
            onKeyDown={handleKeyDown}
            title="Type number and press Enter or click outside"
            aria-label="Current chapter/page"
          />
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleStep(1)}
            disabled={!canIncrement || isUpdating}
            title="Increment chapter/page"
            aria-label="Increment chapter/page"
          >
            ►
          </button>
        </div>
      </div>
    </div>
  );
}
