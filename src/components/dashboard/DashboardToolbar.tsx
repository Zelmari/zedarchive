'use client';
import type { RefObject } from 'react';
import { Activity, BarChart2, Calendar, Database, Search, Share2, Tag, X } from 'lucide-react';
import type { SortKey } from '@/hooks/use-media-filters';
import { pillClass } from '@/components/ui/media-controls';

interface DashboardToolbarProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: SortKey;
  onSortChange: (sort: SortKey) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  tags: string[];
  counts: Record<string, number>;
  onOpenModal: (modal: 'activity' | 'share' | 'stats' | 'data' | 'calendar') => void;
}

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ['priority_asc', '⚡ Queue Priority'],
  ['updated_desc', 'Recently Updated'],
  ['created_desc', 'Date Added (Newest)'],
  ['created_asc', 'Date Added (Oldest)'],
  ['title_asc', 'Title (A → Z)'],
  ['title_desc', 'Title (Z → A)'],
  ['progress_desc', 'Progress %'],
  ['rating_desc', 'Highest Rated'],
];

export default function DashboardToolbar({
  searchInputRef,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  statusFilter,
  onStatusFilterChange,
  selectedTag,
  onTagChange,
  tags,
  counts,
  onOpenModal,
}: DashboardToolbarProps) {
  const pills: Array<{ id: string; label: string }> = [
    { id: 'all', label: `All (${counts.all ?? 0})` },
    { id: 'queue', label: `⚡ Up Next (${counts.queue ?? 0})` },
    { id: 'in_progress', label: `In Progress (${counts.in_progress ?? 0})` },
    { id: 'completed', label: `Completed (${counts.completed ?? 0})` },
    { id: 'planning', label: `Planning (${counts.planning ?? 0})` },
    { id: 'on_hold', label: `On Hold (${counts.on_hold ?? 0})` },
    { id: 'dropped', label: `Dropped (${counts.dropped ?? 0})` },
  ];

  return (
    <div className="mb-[var(--za-space-6)] flex min-w-0 max-w-full flex-col gap-[var(--za-space-3)] border-y border-dashed border-decorative py-[var(--za-space-4)]">
      {/* Top row: search & sort (left) + auxiliary actions (right) */}
      <div className="flex flex-wrap items-center justify-between gap-[var(--za-space-3)]">
        <div className="flex min-w-0 w-full max-w-full flex-col gap-2 sm:max-w-[32rem] sm:flex-[1_1_20rem] sm:flex-row sm:items-center">
          <div className="relative min-w-0 w-full flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-[0.7rem] top-1/2 z-[1] -translate-y-1/2 text-ink-muted"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search archive, tags, notes..."
              aria-label="Search archive by title, tags, or notes"
              className="za-field za-field--icon-start za-field--icon-end h-[var(--za-control-min-block-size)] w-full font-[family-name:var(--za-font-serif-body)] text-[length:var(--za-text-supporting)]"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 z-[1] inline-flex -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent p-1 text-ink-muted hover:text-ink"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          <div className="w-full min-w-0 max-w-full sm:w-[min(100%,14rem)] sm:shrink-0">
            <select
              className="za-field h-[var(--za-control-min-block-size)] w-full min-w-0 max-w-full cursor-pointer px-3 py-[0.45rem] font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)]"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortKey)}
              aria-label="Sort Archive"
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-[var(--za-space-2)]">
          {[
            {
              label: 'Calendar',
              title: 'View Weekly Airing Schedule',
              modal: 'calendar' as const,
              Icon: Calendar,
            },
            {
              label: 'Activity',
              title: 'View Activity Log & Streaks',
              modal: 'activity' as const,
              Icon: Activity,
            },
            {
              label: 'Share',
              title: 'Public Share Profile',
              modal: 'share' as const,
              Icon: Share2,
            },
            {
              label: 'Stats',
              title: 'View Archive Statistics',
              modal: 'stats' as const,
              Icon: BarChart2,
            },
            {
              label: 'Backup',
              title: 'Export or Import Backups (Press B)',
              modal: 'data' as const,
              Icon: Database,
            },
          ].map(({ label, title, modal, Icon }) => (
            <button
              key={modal}
              type="button"
              className="za-button za-button--secondary px-[var(--za-space-3)]"
              onClick={() => onOpenModal(modal)}
              title={title}
              aria-label={label}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom row: status filter radios + shelves */}
      <div className="flex flex-col gap-[var(--za-space-3)] border-t border-dashed border-decorative pt-[var(--za-space-3)]">
        <div
          className="flex w-full min-w-0 max-w-full items-center gap-[var(--za-space-1)] overflow-x-auto overscroll-x-contain pb-1"
          role="radiogroup"
          aria-label="Status filter"
        >
          {pills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              role="radio"
              id={pill.id}
              aria-checked={statusFilter === pill.id}
              className={pillClass(statusFilter === pill.id)}
              onClick={() => onStatusFilterChange(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div
            className="flex w-full min-w-0 max-w-full items-center gap-[var(--za-space-1)] overflow-x-auto overscroll-x-contain pb-1"
            role="radiogroup"
            aria-label="Catalogue shelves"
          >
            <span className="flex shrink-0 items-center gap-[3px] font-[family-name:var(--za-font-mono)] text-xs uppercase tracking-[0.08em] text-ink-muted">
              <Tag size={12} /> Shelves:
            </span>
            <button
              type="button"
              role="radio"
              aria-checked={selectedTag === 'all'}
              id="shelf-all"
              className={`${pillClass(selectedTag === 'all')} px-2 py-[0.15rem] text-xs`}
              onClick={() => onTagChange('all')}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={selectedTag === tag}
                id={`shelf-${tag}`}
                className={`${pillClass(selectedTag === tag)} px-2 py-[0.15rem] text-xs`}
                onClick={() => onTagChange(selectedTag === tag ? 'all' : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
