'use client';

import { BookOpen, Film, Layers, Plus, Tv } from 'lucide-react';
import EmptyLedger from '@/components/ui/EmptyLedger';
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

  const title = hasActiveFilters
    ? 'No matching catalogue entries'
    : activeTab === 'total'
      ? 'Your catalogue awaits its first entry'
      : activeTab === 'movies'
        ? 'No movies or films catalogued yet'
        : `No ${noun}s or ${activeTab === 'shows' ? 'anime' : 'manga'} catalogued yet`;

  const description = hasActiveFilters
    ? 'Try adjusting your search, shelf, or status filter.'
    : `Catalogue your first ${noun ?? 'media'} title when you are ready.`;

  return (
    <EmptyLedger
      className="col-span-full"
      icon={<EmptyIcon tab={activeTab} />}
      title={title}
      description={description}
      action={
        !hasActiveFilters && onAddClick ? (
          <button type="button" className="za-button za-button--primary" onClick={onAddClick}>
            <Plus size={16} strokeWidth={2.2} />
            <span>Add {activeTab === 'books' ? 'Book' : 'Media'}</span>
          </button>
        ) : undefined
      }
    />
  );
}
