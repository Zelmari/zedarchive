'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { compressImageFile, fetchAndCompressRemoteImage } from '@/lib/image-utils';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

export default function AddMediaModal({ isOpen, onClose, type = 'show', onAdd }) {
  const initialCategory = type === 'book' ? 'book' : 'show';
  const [category, setCategory] = useState(initialCategory);
  const [title, setTitle] = useState('');
  const [primaryUnitTotal, setPrimaryUnitTotal] = useState('1');
  const [primaryUnitCurrent, setPrimaryUnitCurrent] = useState('1');
  const [secondaryUnitTotal, setSecondaryUnitTotal] = useState('');
  const [secondaryUnitCurrent, setSecondaryUnitCurrent] = useState('0');
  const [structure, setStructure] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [notes, setNotes] = useState('');
  const [coverImage, setCoverImage] = useState(null);

  // Search & Autofill state
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const dropdownItemsRef = useRef([]);
  const fileInputRef = useRef(null);
  const searchAbortRef = useRef(null);

  const isShowLike = category === 'show' || category === 'anime';

  const resetForm = useCallback(() => {
    setTitle('');
    setPrimaryUnitTotal('1');
    setPrimaryUnitCurrent('1');
    setSecondaryUnitTotal('');
    setSecondaryUnitCurrent('0');
    setStructure([]);
    setSourceId('');
    setNotes('');
    setCoverImage(null);
    setSearchResults([]);
    setHighlightedIndex(-1);
    setShowDropdown(false);
    setError('');
  }, []);

  const resetAndClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Escape key handler: close dropdown if open, else close modal
  const handleEscape = useCallback(
    (e) => {
      if (showDropdown) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      } else {
        resetAndClose();
      }
    },
    [showDropdown, resetAndClose]
  );

  // Accessible focus trapping
  const modalRef = useFocusTrap(isOpen, handleEscape, { initialFocusRef: titleInputRef });

  // Sync category if type prop changes when modal opens
  useEffect(() => {
    if (isOpen) {
      const defaultCat = type === 'book' ? 'book' : 'show';
      setCategory(defaultCat);
      resetForm();
    }
  }, [isOpen, type, resetForm]);

  // Handle click outside dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownItemsRef.current[highlightedIndex]) {
      dropdownItemsRef.current[highlightedIndex]?.scrollIntoView?.({
        block: 'nearest',
      });
    }
  }, [highlightedIndex]);

  // Debounced search trigger (350ms, >= 3 chars)
  useEffect(() => {
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 3) {
      setSearchResults([]);
      setHighlightedIndex(-1);
      setIsSearching(false);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      searchAbortRef.current = new AbortController();

      setIsSearching(true);
      setError('');

      try {
        let endpoint = '/api/search/shows';
        if (category === 'book') {
          endpoint = `/api/search/books?q=${encodeURIComponent(trimmedTitle)}`;
        } else if (category === 'anime') {
          endpoint = `/api/search/anime?q=${encodeURIComponent(trimmedTitle)}&category=anime`;
        } else if (category === 'manga') {
          endpoint = `/api/search/anime?q=${encodeURIComponent(trimmedTitle)}&category=manga`;
        } else {
          endpoint = `/api/search/shows?q=${encodeURIComponent(trimmedTitle)}`;
        }

        const res = await fetch(endpoint, {
          signal: searchAbortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error('Search failed');
        }

        const data = await res.json();
        const results = data.results || (Array.isArray(data) ? data : []);
        setSearchResults(results);
        setHighlightedIndex(-1);
        setShowDropdown(results.length > 0);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err);
          setSearchResults([]);
          setHighlightedIndex(-1);
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [title, category]);

  if (!isOpen) return null;

  // Autofill on Selection from search dropdown
  const handleSelectResult = async (item) => {
    setTitle(item.title || '');
    setSourceId(item.sourceId || '');

    const itemStructure = item.structure || [];
    setStructure(itemStructure);

    const primTotal = item.primaryUnitTotal || (itemStructure.length > 0 ? itemStructure.length : 1);
    setPrimaryUnitTotal(String(primTotal));
    setPrimaryUnitCurrent('1');
    setSecondaryUnitCurrent('0');

    // Look up season 1 in structure if available
    const season1 = itemStructure.find((s) => s.number === 1);
    const secTotal = season1?.total || item.secondaryUnitTotal || '';
    setSecondaryUnitTotal(secTotal ? String(secTotal) : '');

    setShowDropdown(false);
    setHighlightedIndex(-1);

    // Fetch and compress remote poster
    if (item.coverUrl) {
      setIsCompressing(true);
      try {
        const compressedBase64 = await fetchAndCompressRemoteImage(item.coverUrl, 320, 480, 0.7);
        if (compressedBase64) {
          setCoverImage(compressedBase64);
        } else {
          setCoverImage(item.coverUrl);
        }
      } catch (imgErr) {
        console.warn('Failed to compress remote cover:', imgErr);
        setCoverImage(item.coverUrl);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  // Keyboard navigation for search input
  const handleTitleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (searchResults.length > 0) {
        e.preventDefault();
        if (!showDropdown) {
          setShowDropdown(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
        }
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (searchResults.length > 0) {
        e.preventDefault();
        if (!showDropdown) {
          setShowDropdown(true);
          setHighlightedIndex(searchResults.length - 1);
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
        }
      }
      return;
    }

    if (e.key === 'Enter') {
      if (showDropdown && highlightedIndex >= 0 && searchResults[highlightedIndex]) {
        e.preventDefault();
        handleSelectResult(searchResults[highlightedIndex]);
      }
    }
  };

  // Dynamic season/volume change handler
  const handlePrimaryUnitChange = (val) => {
    setPrimaryUnitCurrent(val);
    const seasonNum = parseInt(val, 10);
    if (!isNaN(seasonNum) && structure.length > 0) {
      const seasonObj = structure.find((s) => s.number === seasonNum);
      if (seasonObj && seasonObj.total !== null && seasonObj.total !== undefined) {
        setSecondaryUnitTotal(String(seasonObj.total));
      }
    }
  };

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
      const payload = {
        title: title.trim(),
        category,
        primaryUnitCurrent: parseInt(primaryUnitCurrent, 10) || 1,
        primaryUnitTotal: primaryUnitTotal ? parseInt(primaryUnitTotal, 10) : 1,
        secondaryUnitCurrent: parseInt(secondaryUnitCurrent, 10) || 0,
        secondaryUnitTotal: secondaryUnitTotal ? parseInt(secondaryUnitTotal, 10) : null,
        structure: structure || [],
        coverImage: coverImage || null,
        sourceId: sourceId || null,
        notes: notes.trim() || null,
      };

      await onAdd(payload);
      resetAndClose();
    } catch (err) {
      setError(err.message || 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={resetAndClose}>
      <div
        ref={modalRef}
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-media-modal-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="add-media-modal-title" className={styles.modalTitle}>
            Add New Media
          </h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={resetAndClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          {/* Category Selector Chips */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Category</label>
            <div className={styles.categoryChips} role="radiogroup" aria-label="Media Category">
              <button
                type="button"
                role="radio"
                aria-checked={category === 'show'}
                className={`${styles.categoryChip} ${category === 'show' ? styles.categoryChipActive : ''}`}
                onClick={() => setCategory('show')}
              >
                🎬 TV Show
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'anime'}
                className={`${styles.categoryChip} ${category === 'anime' ? styles.categoryChipActive : ''}`}
                onClick={() => setCategory('anime')}
              >
                ⚡ Anime
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'book'}
                className={`${styles.categoryChip} ${category === 'book' ? styles.categoryChipActive : ''}`}
                onClick={() => setCategory('book')}
              >
                📖 Book
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'manga'}
                className={`${styles.categoryChip} ${category === 'manga' ? styles.categoryChipActive : ''}`}
                onClick={() => setCategory('manga')}
              >
                📚 Manga
              </button>
            </div>
          </div>

          {/* Cover Image Preview & Upload */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cover Image (Autofilled or Upload)</label>
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

          {/* Title with Debounced Search Dropdown & Arrow Key Navigation */}
          <div className={styles.formGroup} ref={searchContainerRef} style={{ position: 'relative' }}>
            <div className={styles.labelRow}>
              <label htmlFor="media-title" className={styles.formLabel}>
                Title *
              </label>
              {isSearching && <span className={styles.searchIndicator}>Searching sources...</span>}
            </div>
            <input
              ref={titleInputRef}
              id="media-title"
              type="text"
              required
              autoComplete="off"
              className={styles.formInput}
              placeholder={
                category === 'show'
                  ? 'e.g., Breaking Bad'
                  : category === 'anime'
                  ? 'e.g., Attack on Titan, Frieren'
                  : category === 'book'
                  ? 'e.g., The Name of the Wind, Dune'
                  : 'e.g., One Piece, Berserk'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              autoFocus
              aria-expanded={showDropdown}
              aria-autocomplete="list"
              aria-controls="search-results-list"
            />

            {/* Floating Dropdown Results */}
            {showDropdown && (
              <div
                id="search-results-list"
                className={styles.searchDropdown}
                role="listbox"
                aria-label="Search results"
              >
                {searchResults.map((item, idx) => (
                  <div
                    key={item.sourceId || `${item.title}-${item.year}-${idx}`}
                    ref={(el) => {
                      dropdownItemsRef.current[idx] = el;
                    }}
                    className={`${styles.searchResultItem} ${
                      highlightedIndex === idx ? styles.searchResultItemActive : ''
                    }`}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    role="option"
                    aria-selected={highlightedIndex === idx}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectResult(item);
                      }
                    }}
                  >
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        className={styles.searchItemThumb}
                      />
                    ) : (
                      <div className={styles.searchItemThumbPlaceholder}>
                        {item.title ? item.title.charAt(0) : '?'}
                      </div>
                    )}
                    <div className={styles.searchItemInfo}>
                      <div className={styles.searchItemTitle}>{item.title}</div>
                      <div className={styles.searchItemMeta}>
                        {item.year && <span>{item.year}</span>}
                        {item.authors && <span>{item.authors}</span>}
                        {item.structure?.length > 0 && (
                          <span className={styles.searchItemBadge}>
                            {item.structure.length} Seasons
                          </span>
                        )}
                        {item.secondaryUnitTotal && !item.structure?.length && (
                          <span className={styles.searchItemBadge}>
                            {item.secondaryUnitTotal} {isShowLike ? 'Eps' : 'Pages/Ch'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hierarchical Progress Fields */}
          {isShowLike ? (
            <>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="primary-unit-total" className={styles.formLabel}>
                    Total Seasons
                  </label>
                  <input
                    id="primary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    value={primaryUnitTotal}
                    onChange={(e) => setPrimaryUnitTotal(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="primary-unit-current" className={styles.formLabel}>
                    Current Season
                  </label>
                  <input
                    id="primary-unit-current"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    value={primaryUnitCurrent}
                    onChange={(e) => handlePrimaryUnitChange(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="secondary-unit-total" className={styles.formLabel}>
                    Total Episodes (Season {primaryUnitCurrent})
                  </label>
                  <input
                    id="secondary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="e.g. 12 or 24"
                    value={secondaryUnitTotal}
                    onChange={(e) => setSecondaryUnitTotal(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="secondary-unit-current" className={styles.formLabel}>
                    Current Episode
                  </label>
                  <input
                    id="secondary-unit-current"
                    type="number"
                    min="0"
                    className={styles.formInput}
                    value={secondaryUnitCurrent}
                    onChange={(e) => setSecondaryUnitCurrent(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            /* Book / Manga Fields */
            <>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="primary-unit-total" className={styles.formLabel}>
                    Total Volumes (Optional)
                  </label>
                  <input
                    id="primary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="e.g. 1"
                    value={primaryUnitTotal}
                    onChange={(e) => setPrimaryUnitTotal(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="primary-unit-current" className={styles.formLabel}>
                    Current Volume
                  </label>
                  <input
                    id="primary-unit-current"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    value={primaryUnitCurrent}
                    onChange={(e) => handlePrimaryUnitChange(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="secondary-unit-total" className={styles.formLabel}>
                    Total Chapters / Pages
                  </label>
                  <input
                    id="secondary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="e.g. 350"
                    value={secondaryUnitTotal}
                    onChange={(e) => setSecondaryUnitTotal(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="secondary-unit-current" className={styles.formLabel}>
                    Current Chapter / Page
                  </label>
                  <input
                    id="secondary-unit-current"
                    type="number"
                    min="0"
                    className={styles.formInput}
                    value={secondaryUnitCurrent}
                    onChange={(e) => setSecondaryUnitCurrent(e.target.value)}
                  />
                </div>
              </div>
            </>
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
              {isSubmitting ? 'Adding...' : 'Add to Archive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
