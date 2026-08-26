'use client';

import { useState } from 'react';
import type { MediaEntry } from '@/types/media';

export type SortKey =
  | 'updated_desc'
  | 'created_desc'
  | 'created_asc'
  | 'title_asc'
  | 'title_desc'
  | 'progress_desc'
  | 'rating_desc';

export type DashboardTab = 'total' | 'shows' | 'books';

const STATUS_KEYS = ['in_progress', 'completed', 'planning', 'on_hold', 'dropped'] as const;

/**
 * Search / filter / sort state and derived views for the dashboard grid.
 */
export function useMediaFilters(entries: MediaEntry[], activeTab: DashboardTab) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated_desc');

  const allTags = Array.from(new Set(entries.flatMap((e) => e.tags || []))).filter(Boolean);

  const showEntries = entries.filter((e) => e.category === 'show' || e.category === 'anime');
  const bookEntries = entries.filter((e) => e.category === 'book' || e.category === 'manga');

  const tabScopedEntries =
    activeTab === 'shows' ? showEntries : activeTab === 'books' ? bookEntries : entries;

  const counts = {
    all: tabScopedEntries.length,
    in_progress: tabScopedEntries.filter((e) => (e.status || 'in_progress') === 'in_progress')
      .length,
    completed: tabScopedEntries.filter((e) => e.status === 'completed').length,
    planning: tabScopedEntries.filter((e) => e.status === 'planning').length,
    on_hold: tabScopedEntries.filter((e) => e.status === 'on_hold').length,
    dropped: tabScopedEntries.filter((e) => e.status === 'dropped').length,
  };

  const filteredEntries = tabScopedEntries.filter((item) => {
    if (statusFilter !== 'all') {
      const itemStatus = item.status || 'in_progress';
      if (itemStatus !== statusFilter) return false;
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
      default:
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
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
    bookEntries,
    counts,
    displayedEntries,
    statusKeys: STATUS_KEYS,
  };
}

export type ModalName = 'add' | 'theme' | 'activity' | 'share' | 'shortcuts' | 'stats' | 'data';

/**
 * Single source of truth for which dashboard modal is open.
 */
export function useModalManager() {
  const [openModal, setOpenModal] = useState<ModalName | null>(null);

  const isOpen = (name: ModalName) => openModal === name;
  const open = (name: ModalName) => setOpenModal(name);
  const close = () => setOpenModal(null);
  const anyOpen = openModal !== null;

  return { openModal, isOpen, open, close, anyOpen };
}
