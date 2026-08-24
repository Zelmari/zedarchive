'use client';

import { useState } from 'react';
import { Trash2, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import styles from './dashboard.module.css';

export default function BookCard({ item, onUpdate, onDelete }) {
  const category = item.category || (item.type === 'manga' ? 'manga' : 'book');
  const isManga = category === 'manga';

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

  const getInitials = (titleStr) => {
    if (!titleStr) return isManga ? 'MG' : 'BK';
    const words = titleStr.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

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
            {primaryUnitTotal > 1 && (
              <span className={styles.metaBadge}>
                Vol {primaryUnitCurrent} / {primaryUnitTotal}
              </span>
            )}
            <span className={styles.metaBadge}>{isManga ? 'Manga' : 'Book'}</span>
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
        </div>
      </div>

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

