'use client';
import { Activity, BarChart2, Database, Search, Share2, Tag, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { SortKey } from './hooks';

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
  onOpenModal: (modal: 'activity' | 'share' | 'stats' | 'data') => void;
}

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ['updated_desc', 'Recently Updated'],
  ['created_desc', 'Date Added (Newest)'],
  ['created_asc', 'Date Added (Oldest)'],
  ['title_asc', 'Title (A → Z)'],
  ['title_desc', 'Title (Z → A)'],
  ['progress_desc', 'Progress %'],
  ['rating_desc', 'Highest Rated'],
];

const STATUS_PILL_BASE =
  'cursor-pointer whitespace-nowrap rounded-control border border-decorative bg-surface px-[0.65rem] py-[0.3rem] text-[length:var(--za-text-fine)] text-ink-muted transition-[all] duration-[var(--za-motion-fast)]';

function pillClass(active: boolean): string {
  return (
    STATUS_PILL_BASE +
    (active ? ' border-required bg-surface-subtle font-[var(--za-weight-emphasis)] text-ink' : '')
  );
}

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
    { id: 'in_progress', label: `In Progress (${counts.in_progress ?? 0})` },
    { id: 'completed', label: `Completed (${counts.completed ?? 0})` },
    { id: 'planning', label: `Planning (${counts.planning ?? 0})` },
    { id: 'on_hold', label: `On Hold (${counts.on_hold ?? 0})` },
    { id: 'dropped', label: `Dropped (${counts.dropped ?? 0})` },
  ];

  return (
    <div className="mb-[var(--za-space-6)] flex flex-col gap-[var(--za-space-3)]">
      {/* Top row: search & sort (left) + auxiliary actions (right) */}
      <div className="flex flex-wrap items-center justify-between gap-[var(--za-space-3)]">
        <div className="flex max-w-[32rem] flex-[1_1_20rem] items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-[0.65rem] top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search archive, tags, notes..."
              className="h-9 w-full rounded-control border border-required bg-surface px-[2.2rem] py-[0.45rem] text-[length:var(--za-text-fine)] text-ink transition-colors duration-[var(--za-motion-fast)] focus:border-accent"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-none text-[1.1rem] leading-none text-ink-muted hover:text-ink"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
              >
                <X size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          <select
            className="h-9 shrink-0 cursor-pointer rounded-control border border-required bg-surface px-3 py-[0.45rem] text-[length:var(--za-text-fine)] text-ink"
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

        <div className="flex flex-wrap items-center gap-2">
          {[
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
              title: 'Export or Import Backups',
              modal: 'data' as const,
              Icon: Database,
            },
          ].map(({ label, title, modal, Icon }) => (
            <button
              key={modal}
              type="button"
              className="za-button za-button--secondary"
              onClick={() => onOpenModal(modal)}
              title={title}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom row: status filter pills + shelves */}
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center gap-[var(--za-space-1)] overflow-x-auto pb-1"
          role="radiogroup"
          aria-label="Status filter"
        >
          {pills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              role="radio"
              aria-checked={statusFilter === pill.id}
              className={pillClass(statusFilter === pill.id)}
              onClick={() => onStatusFilterChange(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex items-center gap-[var(--za-space-1)] overflow-x-auto pb-1">
            <span className="flex shrink-0 items-center gap-[3px] text-xs text-ink-muted">
              <Tag size={12} /> Shelves:
            </span>
            <button
              type="button"
              className={`${pillClass(selectedTag === 'all')} px-2 py-[0.15rem] text-xs`}
              onClick={() => onTagChange('all')}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
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
