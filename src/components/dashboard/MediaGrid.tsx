'use client';

import { BookOpen, Layers, Plus, Tv } from 'lucide-react';
import MediaCard, { type MediaCardHandlers } from '@/components/cards/MediaCard';
import type { MediaEntry, NextAirMap } from '@/types/media';

interface MediaGridProps extends MediaCardHandlers {
  entries: MediaEntry[];
  activeTab: 'total' | 'shows' | 'books';
  hasActiveFilters: boolean;
  onAddClick?: () => void;
  nextAirMap?: NextAirMap;
}

function EmptyIcon({ tab }: { tab: MediaGridProps['activeTab'] }) {
  const size = { size: 36, strokeWidth: 1.5 } as const;
  if (tab === 'shows') return <Tv {...size} />;
  if (tab === 'books') return <BookOpen {...size} />;
  return <Layers {...size} />;
}

export default function MediaGrid({
  entries,
  activeTab,
  hasActiveFilters,
  onAddClick,
  nextAirMap,
  onUpdate,
  onDelete,
  onEdit,
  onOpenDetail,
}: MediaGridProps) {
  if (entries.length === 0) {
    const noun = activeTab === 'shows' ? 'show' : activeTab === 'books' ? 'book' : null;

    return (
      <div className="za-card za-card--raised col-span-full flex flex-col items-center justify-center rounded-control border border-dashed border-required px-[var(--za-space-6)] py-[var(--za-space-12)] text-center [box-shadow:none]">
        <div className="mb-[var(--za-space-4)] flex items-center justify-center text-ink-muted">
          <EmptyIcon tab={activeTab} />
        </div>
        <h2 className="mb-[var(--za-space-1)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
          {hasActiveFilters
            ? 'No matching entries found'
            : activeTab === 'total'
              ? 'Your archive is currently empty'
              : `No ${noun}s or ${activeTab === 'shows' ? 'anime' : 'manga'} in your archive yet`}
        </h2>
        <p className="mb-[var(--za-space-6)] max-w-[var(--za-measure-readable)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
          {hasActiveFilters
            ? 'Try adjusting your search terms, shelves, or status filter.'
            : `Click below to catalog your first ${noun ?? 'media'} title.`}
        </p>
        {!hasActiveFilters && onAddClick && (
          <button type="button" className="za-button za-button--primary" onClick={onAddClick}>
            <Plus size={16} strokeWidth={2.2} />
            <span>Add New Title</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {entries.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          nextAir={item.sourceId ? nextAirMap?.[item.sourceId] : undefined}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEdit={onEdit}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </>
  );
}
