'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Tv, Sparkles, BookOpen, Library, X, Upload, Search, ArrowLeft, Loader2 } from 'lucide-react';
import { compressImageFile, fetchAndCompressRemoteImage } from '@/lib/image-utils';
import { getTileInitials } from '@/lib/format';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import styles from './dashboard.module.css';

// Persist the last-used category across modal open/close within this page session
let lastCategory = null;

export default function AddMediaModal({ isOpen, onClose, type = 'show', onAdd, editItem = null, onSave = null }) {
  const isEditMode = !!editItem;
  const initialCategory = type === 'book' ? 'book' : 'show';
  const [category, setCategory] = useState(() => lastCategory || initialCategory);
  const updateCategory = (nextCategory) => {
    lastCategory = nextCategory;
    setCategory(nextCategory);
  };

  // View Mode: 'search' (Spotlight-first) or 'manual' (Full form)
  const [viewMode, setViewMode] = useState(() => (isEditMode ? 'manual' : 'search'));

  // Form Fields
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [rating, setRating] = useState(null);
  const [primaryUnitTotal, setPrimaryUnitTotal] = useState('1');
  const [primaryUnitCurrent, setPrimaryUnitCurrent] = useState('1');
  const [secondaryUnitTotal, setSecondaryUnitTotal] = useState('');
  const [secondaryUnitCurrent, setSecondaryUnitCurrent] = useState('0');
  const [structure, setStructure] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [notes, setNotes] = useState('');
  const [coverImage, setCoverImage] = useState(null);

  // Search & Autofill state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const searchInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const dropdownItemsRef = useRef([]);
  const fileInputRef = useRef(null);
  const searchAbortRef = useRef(null);
  const coverRequestRef = useRef(0);

  const isShowLike = category === 'show' || category === 'anime';

  const resetForm = useCallback(() => {
    if (editItem) {
      setTitle(editItem.title || '');
      const cat = editItem.category || (editItem.type === 'manga' ? 'manga' : editItem.type === 'book' ? 'book' : editItem.type === 'anime' ? 'anime' : 'show');
      setCategory(cat);
      setStatus(editItem.status || 'in_progress');
      setRating(editItem.rating != null ? editItem.rating : null);
      setPrimaryUnitTotal(editItem.primaryUnitTotal != null ? String(editItem.primaryUnitTotal) : '');
      setPrimaryUnitCurrent(editItem.primaryUnitCurrent != null ? String(editItem.primaryUnitCurrent) : '1');
      setSecondaryUnitTotal(editItem.secondaryUnitTotal != null ? String(editItem.secondaryUnitTotal) : '');
      setSecondaryUnitCurrent(editItem.secondaryUnitCurrent != null ? String(editItem.secondaryUnitCurrent) : '0');
      setStructure(Array.isArray(editItem.structure) ? editItem.structure : []);
      setSourceId(editItem.sourceId || '');
      setNotes(editItem.notes || '');
      setCoverImage(editItem.coverImage || null);
      setViewMode('manual');
    } else {
      setTitle('');
      setSearchQuery('');
      setCategory(lastCategory || (type === 'book' ? 'book' : 'show'));
      setStatus('in_progress');
      setRating(null);
      setPrimaryUnitTotal('1');
      setPrimaryUnitCurrent('1');
      setSecondaryUnitTotal('');
      setSecondaryUnitCurrent('0');
      setStructure([]);
      setSourceId('');
      setNotes('');
      setCoverImage(null);
      setViewMode('search');
    }
    setSearchResults([]);
    setHighlightedIndex(-1);
    setSearchError('');
    setHasSearched(false);
    setError('');
    coverRequestRef.current += 1;
  }, [editItem, type]);

  const resetAndClose = useCallback(() => {
    if (isSubmitting || isCompressing) return;
    resetForm();
    onClose();
  }, [resetForm, onClose, isSubmitting, isCompressing]);

  // Escape key handler: in 'search' mode, opens 'manual' mode. In 'manual' mode, closes modal.
  const handleEscape = useCallback(() => {
    if (viewMode === 'search') {
      if (searchQuery.trim() && !title) {
        setTitle(searchQuery.trim());
      }
      setViewMode('manual');
    } else {
      resetAndClose();
    }
  }, [viewMode, searchQuery, title, resetAndClose]);

  // Accessible focus trapping
  const modalRef = useFocusTrap(isOpen, handleEscape, {
    initialFocusRef: viewMode === 'search' ? searchInputRef : titleInputRef,
  });

  // Sync form when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetForm();
    }
  }, [isOpen, resetForm]);

  // Focus search input when switching to search view
  useEffect(() => {
    if (isOpen && viewMode === 'search') {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, viewMode]);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownItemsRef.current[highlightedIndex]) {
      dropdownItemsRef.current[highlightedIndex]?.scrollIntoView?.({
        block: 'nearest',
      });
    }
  }, [highlightedIndex]);

  // Debounced search trigger (300ms, >= 2 chars)
  useEffect(() => {
    if (viewMode !== 'search') return;
    const trimmed = searchQuery.trim();

    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setHighlightedIndex(-1);
      setIsSearching(false);
      setSearchError('');
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setIsSearching(true);
      setError('');

      try {
        let endpoint = '/api/search/shows';
        if (category === 'book') {
          endpoint = `/api/search/books?q=${encodeURIComponent(trimmed)}`;
        } else if (category === 'anime') {
          endpoint = `/api/search/anime?q=${encodeURIComponent(trimmed)}&category=anime`;
        } else if (category === 'manga') {
          endpoint = `/api/search/anime?q=${encodeURIComponent(trimmed)}&category=manga`;
        } else {
          endpoint = `/api/search/shows?q=${encodeURIComponent(trimmed)}`;
        }

        const res = await fetch(endpoint, {
          signal: controller.signal,
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message = data?.error || 'Search service unavailable';
          setSearchResults([]);
          setHighlightedIndex(-1);
          setSearchError(message);
          setHasSearched(true);
          return;
        }

        const results = data?.results || (Array.isArray(data) ? data : []);
        setSearchResults(results);
        setHighlightedIndex(-1);
        setSearchError('');
        setHasSearched(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err);
          setSearchResults([]);
          setHighlightedIndex(-1);
          setSearchError('Search failed. Please try again.');
          setHasSearched(true);
        }
      } finally {
        if (searchAbortRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [searchQuery, category, viewMode]);

  if (!isOpen) return null;

  // Autofill on Selection from search results
  const handleSelectResult = async (item) => {
    const requestId = ++coverRequestRef.current;
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

    // Switch to manual edit mode so user can review and customize before saving!
    setViewMode('manual');

    // Fetch and compress remote poster
    if (item.coverUrl) {
      setIsCompressing(true);
      try {
        const compressedBase64 = await fetchAndCompressRemoteImage(item.coverUrl, 320, 480, 0.7);
        if (coverRequestRef.current !== requestId) return;
        if (compressedBase64) {
          setCoverImage(compressedBase64);
        } else {
          setCoverImage(item.coverUrl);
        }
      } catch (imgErr) {
        console.warn('Failed to compress remote cover:', imgErr);
        if (coverRequestRef.current !== requestId) return;
        setCoverImage(item.coverUrl);
      } finally {
        if (coverRequestRef.current === requestId) {
          setIsCompressing(false);
        }
      }
    }
  };

  // Keyboard navigation for search input
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleEscape();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (searchResults.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
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
        return;
      }
    }
    setSecondaryUnitTotal('');
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
        status,
        rating: rating != null ? parseInt(rating, 10) : null,
        primaryUnitCurrent: parseInt(primaryUnitCurrent, 10) || 1,
        primaryUnitTotal: primaryUnitTotal ? parseInt(primaryUnitTotal, 10) : 1,
        secondaryUnitCurrent: parseInt(secondaryUnitCurrent, 10) || 0,
        secondaryUnitTotal: secondaryUnitTotal ? parseInt(secondaryUnitTotal, 10) : null,
        structure: structure || [],
        coverImage: coverImage || null,
        sourceId: sourceId || null,
        notes: notes.trim() || null,
      };

      if (isEditMode && onSave) {
        await onSave(editItem.id, payload);
      } else if (onAdd) {
        await onAdd(payload);
      }
      resetAndClose();
    } catch (err) {
      setError(err.message || (isEditMode ? 'Failed to update entry' : 'Failed to create entry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // VIEW MODE 1: SPOTLIGHT SEARCH-FIRST WINDOW
  // =========================================================================
  if (viewMode === 'search') {
    return (
      <div className={styles.modalBackdrop} onClick={resetAndClose}>
        <div
          ref={modalRef}
          className={styles.spotlightModalContent}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="spotlight-modal-title"
        >
          {/* Header with Category Chips and Close */}
          <div className={styles.spotlightHeader}>
            <div className={styles.categoryChips} role="radiogroup" aria-label="Media Category">
              <button
                type="button"
                role="radio"
                aria-checked={category === 'show'}
                className={`${styles.categoryChip} ${category === 'show' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('show')}
              >
                <Tv size={14} strokeWidth={2} />
                <span>TV Show</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'anime'}
                className={`${styles.categoryChip} ${category === 'anime' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('anime')}
              >
                <Sparkles size={14} strokeWidth={2} />
                <span>Anime</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'book'}
                className={`${styles.categoryChip} ${category === 'book' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('book')}
              >
                <BookOpen size={14} strokeWidth={2} />
                <span>Book</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'manga'}
                className={`${styles.categoryChip} ${category === 'manga' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('manga')}
              >
                <Library size={14} strokeWidth={2} />
                <span>Manga</span>
              </button>
            </div>

            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={resetAndClose}
              aria-label="Close modal"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Large Spotlight Search Box */}
          <div className={styles.spotlightSearchWrapper}>
            <Search size={18} className={styles.spotlightSearchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.spotlightSearchInput}
              placeholder={
                category === 'show'
                  ? 'Search TV shows (e.g. Breaking Bad, The Bear)...'
                  : category === 'anime'
                  ? 'Search anime (e.g. Frieren, Horimiya)...'
                  : category === 'book'
                  ? 'Search books (e.g. Crime and Punishment, Dune)...'
                  : 'Search manga (e.g. Chainsaw Man, Berserk)...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
            {isSearching && <Loader2 size={16} className="za-spin" style={{ color: 'var(--za-color-text-muted)' }} />}
            {searchQuery && !isSearching && (
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--za-color-text-muted)', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  searchInputRef.current?.focus();
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Results List */}
          {searchResults.length > 0 && (
            <div ref={resultsContainerRef} className={styles.spotlightResultsContainer}>
              {searchResults.map((item, idx) => {
                const isSelected = idx === highlightedIndex;
                const metaParts = [];
                if (item.year) metaParts.push(item.year);
                if (item.primaryUnitTotal) {
                  metaParts.push(
                    `${item.primaryUnitTotal} ${category === 'book' || category === 'manga' ? 'Volumes' : 'Seasons'}`
                  );
                }
                if (item.secondaryUnitTotal) {
                  metaParts.push(
                    `${item.secondaryUnitTotal} ${category === 'book' || category === 'manga' ? 'Chapters' : 'Episodes'}`
                  );
                }
                if (item.genres && item.genres.length > 0) {
                  metaParts.push(item.genres.slice(0, 2).join(', '));
                }

                return (
                  <div
                    key={item.sourceId || idx}
                    ref={(el) => (dropdownItemsRef.current[idx] = el)}
                    className={`${styles.spotlightItem} ${isSelected ? styles.spotlightItemActive : ''}`}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className={styles.spotlightItemThumb} loading="lazy" />
                    ) : (
                      <div className={styles.spotlightItemThumb} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                        {getTileInitials(item.title)}
                      </div>
                    )}
                    <div className={styles.spotlightItemInfo}>
                      <div className={styles.spotlightItemTitle}>{item.title}</div>
                      <div className={styles.spotlightItemMeta}>
                        {metaParts.join(' • ') || 'Catalogue Match'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasSearched && searchResults.length === 0 && !isSearching && searchQuery.trim().length >= 2 && (
            <div style={{ padding: 'var(--za-space-4)', textAlign: 'center', color: 'var(--za-color-text-muted)', fontSize: 'var(--za-text-fine)' }}>
              No catalogue matches found for &ldquo;{searchQuery}&rdquo;.
            </div>
          )}

          {/* Spotlight Footer with Prompt */}
          <div className={styles.spotlightFooter}>
            <span>
              Press <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--za-color-surface)', border: '1px solid var(--za-color-border-decorative)', borderRadius: 3 }}>Esc</kbd> to enter manually
            </span>
            <button
              type="button"
              className={styles.spotlightManualBtn}
              onClick={() => {
                if (searchQuery.trim() && !title) {
                  setTitle(searchQuery.trim());
                }
                setViewMode('manual');
              }}
            >
              Enter manually →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW MODE 2: FULL EDIT / MANUAL CREATION VIEW
  // =========================================================================
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
          {!isEditMode && (
            <button
              type="button"
              className={styles.backToSearchBtn}
              onClick={() => setViewMode('search')}
            >
              <ArrowLeft size={14} />
              <span>Back to Search</span>
            </button>
          )}
          <h2 id="add-media-modal-title" className={styles.modalTitle}>
            {isEditMode ? 'Edit Entry' : 'Manual Entry'}
          </h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={resetAndClose}
            aria-label="Close modal"
          >
            <X size={18} strokeWidth={2} />
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
                onClick={() => updateCategory('show')}
              >
                <Tv size={14} strokeWidth={2} />
                <span>TV Show</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'anime'}
                className={`${styles.categoryChip} ${category === 'anime' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('anime')}
              >
                <Sparkles size={14} strokeWidth={2} />
                <span>Anime</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'book'}
                className={`${styles.categoryChip} ${category === 'book' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('book')}
              >
                <BookOpen size={14} strokeWidth={2} />
                <span>Book</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={category === 'manga'}
                className={`${styles.categoryChip} ${category === 'manga' ? styles.categoryChipActive : ''}`}
                onClick={() => updateCategory('manga')}
              >
                <Library size={14} strokeWidth={2} />
                <span>Manga</span>
              </button>
            </div>
          </div>

          {/* Title Field */}
          <div className={styles.formGroup}>
            <label htmlFor="media-title" className={styles.formLabel}>
              Title <span className={styles.required}>*</span>
            </label>
            <input
              ref={titleInputRef}
              id="media-title"
              type="text"
              className={styles.formInput}
              placeholder="e.g. Frieren: Beyond Journey's End"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Cover Art Preview & Upload */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Cover Art</label>
            <div className={styles.coverUploadRow}>
              {coverImage ? (
                <div className={styles.coverThumbnailWrapper}>
                  <img src={coverImage} alt="Cover preview" className={styles.coverThumbnail} />
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    onClick={handleRemoveImage}
                    title="Remove cover"
                    aria-label="Remove cover image"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.uploadButton}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                >
                  <Upload size={18} strokeWidth={2} />
                  <span>{isCompressing ? 'Compressing…' : 'Upload custom image'}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.hiddenFileInput}
                onChange={handleImageUpload}
              />
            </div>
          </div>

          {/* Units / Breakdown */}
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
                    placeholder="1"
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
                    Episodes in Season {primaryUnitCurrent}
                  </label>
                  <input
                    id="secondary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="e.g. 12"
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
            <>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="primary-unit-total" className={styles.formLabel}>
                    Total Volumes
                  </label>
                  <input
                    id="primary-unit-total"
                    type="number"
                    min="1"
                    className={styles.formInput}
                    placeholder="1"
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

          {/* Status Selector */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Status</label>
            <div className={styles.statusFilterPills} role="radiogroup" aria-label="Media Status">
              {[
                { id: 'in_progress', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
                { id: 'planning', label: 'Planning' },
                { id: 'on_hold', label: 'On Hold' },
                { id: 'dropped', label: 'Dropped' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={status === s.id}
                  className={`${styles.statusPillBtn} ${status === s.id ? styles.statusPillActive : ''}`}
                  onClick={() => setStatus(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating (1-10) */}
          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.formLabel}>Personal Rating (1–10)</label>
              {rating && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--za-color-text-muted)', fontSize: 'var(--za-text-fine)', cursor: 'pointer' }}
                  onClick={() => setRating(null)}
                >
                  Clear Rating
                </button>
              )}
            </div>
            <div className={styles.ratingSelectGrid} role="radiogroup" aria-label="Score">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-checked={rating === score}
                  className={`${styles.ratingOptionBtn} ${rating === score ? styles.ratingOptionActive : ''}`}
                  onClick={() => setRating(rating === score ? null : score)}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          {/* Personal Notes */}
          <div className={styles.formGroup}>
            <label htmlFor="media-notes" className={styles.formLabel}>
              Personal Notes & Review
            </label>
            <textarea
              id="media-notes"
              className={styles.formInput}
              rows={3}
              placeholder="Thoughts, quotes, or reminders..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'vertical', minHeight: '4.5rem' }}
            />
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className="za-button za-button--secondary"
              onClick={resetAndClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="za-button za-button--primary"
              disabled={isSubmitting || isCompressing}
            >
              {isSubmitting
                ? (isEditMode ? 'Saving…' : 'Adding…')
                : (isEditMode ? 'Save Changes' : 'Add to Archive')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
