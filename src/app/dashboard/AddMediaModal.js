'use client';

import { useState, useRef } from 'react';
import { compressImageFile } from '@/lib/image-utils';
import styles from './dashboard.module.css';

export default function AddMediaModal({ isOpen, onClose, type = 'show', onAdd }) {
  const [title, setTitle] = useState('');
  const [totalSeasons, setTotalSeasons] = useState('1');
  const [currentSeason, setCurrentSeason] = useState('1');
  const [totalUnits, setTotalUnits] = useState('');
  const [currentProgress, setCurrentProgress] = useState('0');
  const [coverImage, setCoverImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const isShow = type === 'show';

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setIsCompressing(true);
    try {
      const compressedDataUrl = await compressImageFile(file, 320, 480, 0.7);
      setCoverImage(compressedDataUrl);
    } catch (err) {
      setError(err.message || 'Failed to process image');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = () => {
    setCoverImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const data = {
        title: title.trim(),
        type: isShow ? 'show' : 'book',
        currentProgress: currentProgress ? parseInt(currentProgress, 10) : 0,
        totalUnits: totalUnits ? parseInt(totalUnits, 10) : null,
        coverImage: coverImage || null,
      };

      if (isShow) {
        data.totalSeasons = totalSeasons ? parseInt(totalSeasons, 10) : 1;
        data.currentSeason = currentSeason ? parseInt(currentSeason, 10) : 1;
      }

      await onAdd(data);
      resetAndClose();
    } catch (err) {
      setError(err.message || 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTitle('');
    setTotalSeasons('1');
    setCurrentSeason('1');
    setTotalUnits('');
    setCurrentProgress('0');
    setCoverImage(null);
    setError('');
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={resetAndClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Add New {isShow ? 'Show' : 'Book'}
          </h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={resetAndClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          {/* Cover Image Upload */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cover Image (Optional)</label>
            <div className={styles.imagePickerContainer}>
              <div className={styles.imagePreview}>
                {isCompressing ? (
                  <span className={styles.imagePlaceholder}>Compressing...</span>
                ) : coverImage ? (
                  <img src={coverImage} alt="Cover preview" />
                ) : (
                  <span className={styles.imagePlaceholder}>No image</span>
                )}
              </div>
              <div className={styles.fileInputWrapper}>
                <label className={styles.fileInputLabel}>
                  {coverImage ? 'Change Image' : 'Upload Cover'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenFileInput}
                    onChange={handleImageUpload}
                    disabled={isCompressing || isSubmitting}
                  />
                </label>
                {coverImage && (
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    onClick={handleRemoveImage}
                  >
                    Remove cover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className={styles.formGroup}>
            <label htmlFor="media-title" className={styles.formLabel}>
              Title *
            </label>
            <input
              id="media-title"
              type="text"
              required
              className={styles.formInput}
              placeholder={isShow ? 'e.g., Attack on Titan' : 'e.g., The Name of the Wind'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Show Specific Fields */}
          {isShow ? (
            <>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="total-seasons" className={styles.formLabel}>
                    Total Seasons
                  </label>
                  <input
                    id="total-seasons"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    value={totalSeasons}
                    onChange={(e) => setTotalSeasons(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="current-season" className={styles.formLabel}>
                    Current Season
                  </label>
                  <input
                    id="current-season"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    value={currentSeason}
                    onChange={(e) => setCurrentSeason(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="total-units" className={styles.formLabel}>
                    Total Episodes (Season)
                  </label>
                  <input
                    id="total-units"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="e.g. 12 or 24"
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="current-progress" className={styles.formLabel}>
                    Current Episode
                  </label>
                  <input
                    id="current-progress"
                    type="number"
                    min="0"
                    className={styles.formInput}
                    value={currentProgress}
                    onChange={(e) => setCurrentProgress(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            /* Book Specific Fields */
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="book-total-units" className={styles.formLabel}>
                  Total Chapters (Optional)
                </label>
                <input
                  id="book-total-units"
                  type="number"
                  min="1"
                  className={styles.formInput}
                  placeholder="e.g. 350"
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="book-current-progress" className={styles.formLabel}>
                  Current Chapter
                </label>
                <input
                  id="book-current-progress"
                  type="number"
                  min="0"
                  className={styles.formInput}
                  value={currentProgress}
                  onChange={(e) => setCurrentProgress(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={resetAndClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting || isCompressing}
            >
              {isSubmitting ? 'Adding...' : `Add ${isShow ? 'Show' : 'Book'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
