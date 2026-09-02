'use client';

import { useState, useRef, useEffect } from 'react';
import { Tv, Film, Sparkles, BookOpen, Library, X, Search, Loader2 } from 'lucide-react';
import { getTileInitials } from '@/lib/format';
import { endpointFor } from '@/lib/search';
import Modal from '@/components/ui/Modal';
import { CATEGORY_CHIPS, chipClass } from '@/components/ui/media-controls';
import type { MediaCategory, StructureItem } from '@/types/media';

export interface SpotlightResult {
  sourceId?: string;
  title?: string;
  coverUrl?: string | null;
  primaryUnitTotal?: number;
  secondaryUnitTotal?: number | null;
  structure?: StructureItem[];
  year?: string | null;
  genres?: string[];
  [key: string]: unknown;
}

interface SpotlightSearchModalProps {
  isOpen: boolean;
  category: MediaCategory;
  onCategoryChange: (category: MediaCategory) => void;
  onClose: () => void;
  onManualEnter: (query: string) => void;
  onSelectResult: (result: SpotlightResult) => void;
}

const PLACEHOLDERS: Record<MediaCategory, string> = {
  show: 'Search TV shows (e.g. Breaking Bad, The Bear)...',
  movie: 'Search movies (e.g. Inception, Spirited Away, Dune)...',
  anime: 'Search anime (e.g. Frieren, Horimiya)...',
  book: 'Search books (e.g. Crime and Punishment, Dune)...',
  manga: 'Search manga (e.g. Chainsaw Man, Berserk)...',
};

/**
 * Spotlight search-first window for adding media. Owns search state and
 * result fetching; selection and manual-entry handoff flow to the parent.
 */
export default function SpotlightSearchModal({
  isOpen,
  category,
  onCategoryChange,
  onClose,
  onManualEnter,
  onSelectResult,
}: SpotlightSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotlightResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isServiceConfigured, setIsServiceConfigured] = useState(true);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const dropdownItemsRef = useRef<Array<HTMLDivElement | null>>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Focus the input whenever the spotlight opens.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownItemsRef.current[highlightedIndex]) {
      dropdownItemsRef.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Debounced search trigger (300ms, >= 2 chars)
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = searchQuery.trim();

    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on short queries
      setSearchResults([]);
      setHighlightedIndex(-1);
      setIsSearching(false);
      setSearchError('');
      setHasSearched(false);
      setIsServiceConfigured(true);
      return;
    }

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setIsSearching(true);

      try {
        const res = await fetch(endpointFor(category, trimmed), { signal: controller.signal });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setSearchResults([]);
          setHighlightedIndex(-1);
          setSearchError(String(data?.error || 'Search service unavailable'));
          setHasSearched(true);
          return;
        }

        if (data && typeof data === 'object' && 'configured' in data && data.configured === false) {
          setIsServiceConfigured(false);
        } else {
          setIsServiceConfigured(true);
        }

        const results = data?.results || (Array.isArray(data) ? data : []);
        setSearchResults(results);
        setHighlightedIndex(-1);
        setSearchError('');
        setHasSearched(true);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
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
  }, [searchQuery, category, isOpen]);

  if (!isOpen) return null;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown' && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp' && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
        onSelectResult(searchResults[highlightedIndex] as SpotlightResult);
      } else if (searchQuery.trim()) {
        onManualEnter(searchQuery.trim());
      }
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="top"
      ariaLabel="Search for media to add to your archive"
      initialFocusRef={searchInputRef}
      contentClassName="flex max-w-[38rem] flex-col overflow-hidden"
    >
      {/* Header with Category Chips and Close */}
      <div className="flex items-center justify-between border-b border-decorative bg-surface-subtle px-[var(--za-space-4)] py-[var(--za-space-3)]">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Media Category">
          {CATEGORY_CHIPS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={category === id}
              className={chipClass(category === id)}
              onClick={() => onCategoryChange(id)}
            >
              <Icon size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="flex cursor-pointer items-center justify-center rounded-small p-[var(--za-space-1)] text-ink-muted hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Search box */}
      <div className="flex items-center gap-[var(--za-space-3)] border-b border-decorative px-[var(--za-space-4)] py-[var(--za-space-3)]">
        <Search size={18} className="shrink-0 text-ink-muted" />
        <input
          ref={searchInputRef}
          type="text"
          aria-label="Search for movies, shows, books, or anime"
          className="min-w-0 flex-1 border-none bg-transparent text-[length:var(--za-text-base)] font-[var(--za-weight-body)] leading-[1.5] text-ink outline-none"
          placeholder={PLACEHOLDERS[category]}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoComplete="off"
        />
        {isSearching && <Loader2 size={16} className="za-spin shrink-0 text-ink-muted" />}
        {searchQuery && !isSearching && (
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-ink-muted"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Unconfigured API Notice for Movies */}
      {!isServiceConfigured && category === 'movie' && !isSearching && (
        <div className="mx-[var(--za-space-4)] my-3 rounded-control border border-decorative bg-surface-subtle p-3 text-center text-[length:var(--za-text-fine)]">
          <div className="font-[var(--za-weight-emphasis)] text-ink">
            TMDB movie search API key not configured
          </div>
          <div className="mt-1 text-ink-muted">
            Add <code className="rounded bg-surface px-1 text-xs">TMDB_API_READ_TOKEN</code> to{' '}
            <code className="rounded bg-surface px-1 text-xs">.env.local</code> for auto-poster
            lookup, or catalog this movie manually.
          </div>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => onManualEnter(searchQuery.trim())}
              className="za-button za-button--primary mt-2.5 inline-flex items-center gap-1 text-xs"
            >
              <span>Add &ldquo;{searchQuery.trim()}&rdquo; as Movie</span>
            </button>
          )}
        </div>
      )}

      {/* Results List */}
      {searchResults.length > 0 && (
        <div
          ref={resultsContainerRef}
          className="max-h-[22rem] overflow-y-auto py-2"
          data-testid="spotlight-results"
        >
          {searchResults.map((item, idx) => {
            const isSelected = idx === highlightedIndex;
            const metaParts: string[] = [];
            if (item.year) metaParts.push(String(item.year));

            if (category === 'movie' || item.category === 'movie') {
              if (item.secondaryUnitTotal) {
                const mins = Number(item.secondaryUnitTotal);
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                const durationStr = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m} min`;
                metaParts.push(durationStr);
              } else {
                metaParts.push('Feature Film');
              }
            } else if (item.primaryUnitTotal) {
              metaParts.push(
                `${item.primaryUnitTotal} ${item.primaryUnitTotal === 1 ? 'Season' : 'Seasons'}`,
              );
            }
            if (Array.isArray(item.genres) && item.genres.length > 0) {
              metaParts.push(item.genres.slice(0, 2).join(', '));
            }

            return (
              <div
                key={item.sourceId || `${item.title}-${idx}`}
                ref={(el) => {
                  dropdownItemsRef.current[idx] = el;
                }}
                data-testid="spotlight-item"
                className={`flex cursor-pointer select-none items-center gap-[var(--za-space-3)] border-l-[3px] border-l-transparent px-[var(--za-space-4)] py-2 transition-colors duration-[var(--za-motion-fast)] ${
                  isSelected ? 'border-l-[var(--za-color-border-focus)] bg-surface-subtle' : ''
                }`}
                onClick={() => onSelectResult(item)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote covers, unoptimized by design
                  <img
                    src={item.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-[3.25rem] w-[2.25rem] shrink-0 rounded-small border border-decorative object-cover"
                  />
                ) : (
                  <div className="flex h-[3.25rem] w-[2.25rem] shrink-0 items-center justify-center rounded-small border border-decorative bg-surface-subtle text-[0.7rem]">
                    {getTileInitials(item.title)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink">
                    {item.title}
                  </div>
                  <div className="mt-[0.15rem] truncate text-xs text-ink-muted">
                    {metaParts.join(' • ') || 'Catalogue Match'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasSearched &&
        searchResults.length === 0 &&
        !isSearching &&
        searchQuery.trim().length >= 2 &&
        isServiceConfigured && (
          <div className="p-[var(--za-space-4)] text-center text-[length:var(--za-text-fine)] text-ink-muted">
            <div>No catalogue matches found for &ldquo;{searchQuery}&rdquo;.</div>
            <button
              type="button"
              onClick={() => onManualEnter(searchQuery.trim())}
              className="za-button za-button--secondary mt-2 inline-flex items-center text-xs font-[var(--za-weight-emphasis)]"
            >
              Add &ldquo;{searchQuery.trim()}&rdquo; manually →
            </button>
          </div>
        )}
      {searchError && (
        <div className="p-[var(--za-space-4)] pt-0 text-center text-[length:var(--za-text-fine)] text-danger">
          {searchError}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-decorative bg-surface-subtle px-[var(--za-space-4)] py-[var(--za-space-3)]">
        <span className="text-[length:var(--za-text-fine)] text-ink-muted">
          Can&apos;t find a match?
        </span>
        <button
          type="button"
          className="cursor-pointer border-none bg-transparent p-0 text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] text-accent hover:underline"
          onClick={() => onManualEnter(searchQuery.trim())}
        >
          Create manually instead →
        </button>
      </div>
    </Modal>
  );
}
