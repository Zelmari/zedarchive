'use client';

import { useState, useEffect } from 'react';
import type { MediaEntry } from '@/types/media';
import type { DashboardTab, SortKey } from '@/types/dashboard';

export type { DashboardTab, SortKey };

export { VALID_STATUSES as STATUS_KEYS } from '@/lib/constants';

/**
 * Search / filter / sort state and derived views for the dashboard grid.
 * Features stable session-snapshot sorting to prevent cards from jumping
 * when updated in-place via steppers or modals.
 */
export function useMediaFilters(entries: MediaEntry[], activeTab: DashboardTab) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated_desc');

  // Session snapshot state to preserve positional stability during active edits
  const [sessionTimestamps, setSessionTimestamps] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    entries.forEach((item) => {
      initial[item.id] = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    });
    return initial;
  });

  // Reset filters and refresh snapshot when activeTab explicitly changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset filters on tab switch
    setSearchQuery('');
    setStatusFilter('all');
    setSelectedTag('all');
    setSortBy('updated_desc');

    const fresh: Record<string, number> = {};
    entries.forEach((item) => {
      fresh[item.id] = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    });
    setSessionTimestamps(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Synchronize new entries (e.g. CREATE_ENTRY) with a top-ranking timestamp
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync session timestamps for newly created entries
    setSessionTimestamps((prev) => {
      let hasNew = false;
      const next = { ...prev };
      entries.forEach((item) => {
        if (!(item.id in next)) {
          next[item.id] = Date.now();
          hasNew = true;
        }
      });
      return hasNew ? next : prev;
    });
  }, [entries]);

  const allTags = Array.from(new Set(entries.flatMap((e) => e.tags || []))).filter(Boolean);

  const showEntries = entries.filter((e) => e.category === 'show' || e.category === 'anime');
  const movieEntries = entries.filter((e) => e.category === 'movie');
  const bookEntries = entries.filter((e) => e.category === 'book' || e.category === 'manga');

  const tabScopedEntries =
    activeTab === 'shows'
      ? showEntries
      : activeTab === 'movies'
        ? movieEntries
        : activeTab === 'books'
          ? bookEntries
          : entries;

  const counts = {
    all: tabScopedEntries.length,
    queue: tabScopedEntries.filter((e) => e.priorityIndex != null).length,
    in_progress: tabScopedEntries.filter((e) => (e.status || 'in_progress') === 'in_progress')
      .length,
    completed: tabScopedEntries.filter((e) => e.status === 'completed').length,
    planning: tabScopedEntries.filter((e) => e.status === 'planning').length,
    on_hold: tabScopedEntries.filter((e) => e.status === 'on_hold').length,
    dropped: tabScopedEntries.filter((e) => e.status === 'dropped').length,
  };

  const filteredEntries = tabScopedEntries.filter((item) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'queue') {
        if (item.priorityIndex == null) return false;
      } else {
        const itemStatus = item.status || 'in_progress';
        if (itemStatus !== statusFilter) return false;
      }
    }

    if (selectedTag !== 'all') {
      if (!Array.isArray(item.tags) || !item.tags.includes(selectedTag)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = item.title?.toLowerCase().includes(q);
      const notesMatch = item.notes?.toLowerCase().includes(q);
      const tagMatch =
        Array.isArray(item.tags) && item.tags.some((t) => t.toLowerCase().includes(q));
      if (!titleMatch && !notesMatch && !tagMatch) return false;
    }

    return true;
  });

  const displayedEntries = [...filteredEntries].sort((a, b) => {
    switch (sortBy) {
      case 'priority_asc': {
        const pA = a.priorityIndex ?? Infinity;
        const pB = b.priorityIndex ?? Infinity;
        if (pA !== pB) return pA - pB;
        const tA = sessionTimestamps[a.id] ?? (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        const tB = sessionTimestamps[b.id] ?? (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
        return tB - tA;
      }
      case 'title_asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'title_desc':
        return (b.title || '').localeCompare(a.title || '');
      case 'created_desc':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'created_asc':
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case 'rating_desc':
        return (b.rating || 0) - (a.rating || 0);
      case 'progress_desc': {
        const pA = a.secondaryUnitTotal ? (a.secondaryUnitCurrent || 0) / a.secondaryUnitTotal : 0;
        const pB = b.secondaryUnitTotal ? (b.secondaryUnitCurrent || 0) / b.secondaryUnitTotal : 0;
        return pB - pA;
      }
      case 'updated_desc':
      default: {
        const tA = sessionTimestamps[a.id] ?? (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        const tB = sessionTimestamps[b.id] ?? (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
        return tB - tA;
      }
    }
  });

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    selectedTag,
    setSelectedTag,
    sortBy,
    setSortBy,
    allTags,
    showEntries,
    movieEntries,
    bookEntries,
    counts,
    displayedEntries,
  };
}
