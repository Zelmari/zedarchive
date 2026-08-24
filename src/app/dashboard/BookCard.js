'use client';

import { useState, useEffect } from 'react';
import styles from './dashboard.module.css';

export default function BookCard({ item, onUpdate, onDelete }) {
  const currentProgress = item.currentProgress ?? 0;
  const totalUnits = item.totalUnits; // Total chapters
  const [prevProgress, setPrevProgress] = useState(currentProgress);
  const [inputValue, setInputValue] = useState(String(currentProgress));
  const [isUpdating, setIsUpdating] = useState(false);

  if (prevProgress !== currentProgress) {
    setPrevProgress(currentProgress);
    setInputValue(String(currentProgress));
  }

  const canDecrement = currentProgress > 0;
  const canIncrement = totalUnits === null || totalUnits === undefined || currentProgress < totalUnits;

  const commitChapterValue = async (newVal) => {
    let parsed = parseInt(newVal, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    if (totalUnits !== null && totalUnits !== undefined && parsed > totalUnits) {
      parsed = totalUnits;
    }

    setInputValue(String(parsed));

    if (parsed === currentProgress) return;

    // Optimistic update
    onUpdate(item.id, { currentProgress: parsed });

    try {
      setIsUpdating(true);
      await onUpdate(item.id, { currentProgress: parsed }, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStep = async (delta) => {
    let nextVal = currentProgress + delta;
    if (nextVal < 0) nextVal = 0;
    if (totalUnits !== null && totalUnits !== undefined && nextVal > totalUnits) {
      nextVal = totalUnits;
    }

    if (nextVal === currentProgress) return;

    setInputValue(String(nextVal));
    onUpdate(item.id, { currentProgress: nextVal });

    try {
      setIsUpdating(true);
      await onUpdate(item.id, { currentProgress: nextVal }, true);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
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
              {item.title ? item.title.charAt(0).toUpperCase() : 'B'}
            </span>
          </div>
        )}

        <div className={styles.badgeOverlay}>
          <span className={styles.typeBadge}>Book</span>
        </div>

        {onDelete && (
          <button
            type="button"
            className={styles.cardDeleteBtn}
            onClick={() => onDelete(item.id)}
            title="Delete book"
            aria-label="Delete book"
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
              Ch. {currentProgress}{totalUnits ? ` / ${totalUnits}` : ''}
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

        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleStep(-1)}
            disabled={!canDecrement || isUpdating}
            title="Decrement chapter"
            aria-label="Decrement chapter"
          >
            ◄
          </button>
          <input
            type="number"
            min="0"
            max={totalUnits || undefined}
            className={styles.chapterInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={(e) => commitChapterValue(e.target.value)}
            onKeyDown={handleKeyDown}
            title="Type chapter number and press Enter or click outside"
            aria-label="Current chapter"
          />
          <button
            type="button"
            className={styles.stepperBtn}
            onClick={() => handleStep(1)}
            disabled={!canIncrement || isUpdating}
            title="Increment chapter"
            aria-label="Increment chapter"
          >
            ►
          </button>
        </div>
      </div>
    </div>
  );
}
