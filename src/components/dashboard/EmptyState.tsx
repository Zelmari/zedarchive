'use client';

import { BookOpen, Film, Layers, Plus, Tv } from 'lucide-react';
import type { DashboardTab } from '@/types/dashboard';

interface EmptyStateProps {
  activeTab: DashboardTab;
  hasActiveFilters: boolean;
  onAddClick?: () => void;
}

function EmptyIcon({ tab }: { tab: EmptyStateProps['activeTab'] }) {
  const size = { size: 36, strokeWidth: 1.5 } as const;
  if (tab === 'shows') return <Tv {...size} />;
  if (tab === 'movies') return <Film {...size} />;
  if (tab === 'books') return <BookOpen {...size} />;
  return <Layers {...size} />;
}

export default function EmptyState({ activeTab, hasActiveFilters, onAddClick }: EmptyStateProps) {
  const noun =
    activeTab === 'shows'
      ? 'show'
      : activeTab === 'movies'
        ? 'movie'
        : activeTab === 'books'
          ? 'book'
          : null;

  return (
    <div className="za-bookplate relative col-span-full flex flex-col items-center justify-center px-[var(--za-space-6)] py-[var(--za-space-12)] text-center">
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <div className="mb-[var(--za-space-4)] flex items-center justify-center text-accent">
        <EmptyIcon tab={activeTab} />
      </div>
      <h2 className="mb-[var(--za-space-1)] font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
        {hasActiveFilters
          ? 'No matching catalogue entries'
          : activeTab === 'total'
            ? 'Your catalogue awaits its first entry'
            : activeTab === 'movies'
              ? 'No movies or films catalogued yet'
              : `No ${noun}s or ${activeTab === 'shows' ? 'anime' : 'manga'} catalogued yet`}
      </h2>
      <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
        {hasActiveFilters
          ? 'Try adjusting your search, shelf, or status filter.'
          : `Use the ribbon below to catalogue your first ${noun ?? 'media'} title.`}
      </p>
      {!hasActiveFilters && onAddClick && (
        <button type="button" className="za-button za-button--primary" onClick={onAddClick}>
          <Plus size={16} strokeWidth={2.2} />
          <span>Add Title</span>
        </button>
      )}
    </div>
  );
}
