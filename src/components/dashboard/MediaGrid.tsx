'use client';

import MediaCard, { type MediaCardHandlers } from '@/components/cards/MediaCard';
import EmptyState from '@/components/dashboard/EmptyState';
import type { MediaEntry, NextAirMap } from '@/types/media';

interface MediaGridProps extends MediaCardHandlers {
  entries: MediaEntry[];
  activeTab: 'total' | 'shows' | 'books';
  hasActiveFilters: boolean;
  onAddClick?: () => void;
  nextAirMap?: NextAirMap;
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
    return (
      <EmptyState
        activeTab={activeTab}
        hasActiveFilters={hasActiveFilters}
        onAddClick={onAddClick}
      />
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
