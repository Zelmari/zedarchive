'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, ArrowRight, User } from 'lucide-react';
import { getInitials } from '@/lib/format';
import type { PublicUserSearchResult } from '@/types/user';

interface UserSearchComboboxProps {
  onSelectUser?: (username: string) => void;
  onFullSearch?: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function UserSearchCombobox({
  onSelectUser,
  onFullSearch,
  placeholder = 'Search public profiles by username or name…',
  autoFocus = false,
  className = '',
}: UserSearchComboboxProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setIsLoading(false);
      setIsOpen(false);
      setHasSearched(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim().replace(/^@/, '');
    if (!trimmed) {
      abortControllerRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setIsOpen(true);
      setHighlightedIndex(-1);

      try {
        const res = await fetch(`/api/search/users?q=${encodeURIComponent(trimmed)}&limit=5`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { results: PublicUserSearchResult[] };
          if (abortControllerRef.current === controller) {
            setResults(data.results || []);
            setHasSearched(true);
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Search error:', err);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = useCallback(
    (username: string) => {
      setIsOpen(false);
      if (onSelectUser) {
        onSelectUser(username);
      } else {
        router.push(`/u/${username}`);
      }
    },
    [onSelectUser, router],
  );

  const handleFullSearch = useCallback(
    (searchQuery: string) => {
      const q = searchQuery.trim().replace(/^@/, '');
      if (!q) return;
      setIsOpen(false);
      if (onFullSearch) {
        onFullSearch(q);
      } else {
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }
    },
    [onFullSearch, router],
  );

  // Total items in dropdown includes the results + the "View all results" footer (index = results.length)
  const totalDropdownItems = results.length > 0 ? results.length + 1 : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && totalDropdownItems > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev < totalDropdownItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp' && totalDropdownItems > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalDropdownItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        const selected = results[highlightedIndex];
        if (selected) handleSelect(selected.username);
      } else {
        handleFullSearch(query);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 text-ink-muted"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="user-search-listbox"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-label="Search public user profiles"
          className="w-full rounded-control border border-required bg-surface py-2 pl-9 pr-9 text-[length:var(--za-text-supporting)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
        <div className="absolute right-2.5 flex items-center gap-1">
          {isLoading && <Loader2 size={15} className="za-spin text-ink-muted" />}
          {query && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="flex cursor-pointer items-center justify-center rounded-small p-1 text-ink-muted hover:text-ink"
              aria-label="Clear search query"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && query.trim() && (
        <div
          id="user-search-listbox"
          role="listbox"
          className="animate-fade-in absolute left-0 right-0 top-full z-[var(--za-layer-modal)] mt-1.5 max-h-80 overflow-hidden rounded-control border border-required bg-surface shadow-layered"
        >
          {results.length > 0 ? (
            <div>
              <div className="border-b border-decorative px-3 py-1.5 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] uppercase tracking-wider text-ink-muted">
                Public Archives
              </div>
              <ul className="m-0 list-none p-0">
                {results.map((item, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  return (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() => handleSelect(item.username)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`flex cursor-pointer items-center justify-between gap-3 border-b border-decorative px-3 py-2.5 transition-colors ${
                        isHighlighted
                          ? 'bg-surface-subtle text-ink'
                          : 'text-ink hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full border border-decorative object-cover"
                          />
                        ) : (
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-decorative bg-[var(--za-color-title-tile)] text-xs font-[var(--za-weight-heading)] text-[var(--za-color-title-tile-text)]"
                            aria-hidden="true"
                          >
                            {getInitials(item.name)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5 truncate">
                            <span className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-heading)] text-ink">
                              {item.name}
                            </span>
                            <span className="font-mono text-[length:var(--za-text-fine)] text-ink-muted">
                              @{item.username}
                            </span>
                          </div>
                          {item.bio && (
                            <p className="truncate text-[length:var(--za-text-fine)] text-ink-muted">
                              {item.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-small border border-decorative bg-surface-subtle px-1.5 py-0.5 text-[length:var(--za-text-fine)] text-ink-muted">
                          {item.totalEntries} {item.totalEntries === 1 ? 'title' : 'titles'}
                        </span>
                        <ArrowRight size={13} className="text-ink-muted opacity-60" />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* View Full Search Page Footer Item */}
              <div
                role="option"
                aria-selected={highlightedIndex === results.length}
                onClick={() => handleFullSearch(query)}
                onMouseEnter={() => setHighlightedIndex(results.length)}
                className={`flex cursor-pointer items-center justify-between border-t border-decorative bg-surface-subtle px-3 py-2 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-accent transition-colors ${
                  highlightedIndex === results.length ? 'bg-surface underline' : 'hover:underline'
                }`}
              >
                <span>View all search results for &ldquo;{query.trim()}&rdquo;</span>
                <span className="font-normal text-ink-muted">Enter ↵</span>
              </div>
            </div>
          ) : hasSearched && !isLoading ? (
            <div className="p-4 text-center">
              <p className="text-[length:var(--za-text-supporting)] text-ink-muted">
                No public archives found matching &ldquo;{query.trim()}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => handleFullSearch(query)}
                className="mt-2 text-[length:var(--za-text-fine)] text-accent hover:underline"
              >
                Open full search page
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
