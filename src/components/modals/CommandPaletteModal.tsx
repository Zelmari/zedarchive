'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  BarChart2,
  Palette,
  Settings,
  Sparkles,
  Layers,
  ArrowRight,
  Tv,
  Film,
  BookOpen,
  Library,
} from 'lucide-react';
import type { MediaEntry } from '@/types/media';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries?: MediaEntry[];
  onOpenAddModal?: () => void;
  onOpenStatsModal?: () => void;
  onOpenThemeModal?: () => void;
  onSelectEntry?: (entry: MediaEntry) => void;
}

interface CommandItem {
  id: string;
  type: 'action' | 'media';
  title: string;
  subtitle?: string;
  category?: string;
  Icon?: typeof Search;
  onSelect: () => void;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  entries = [],
  onOpenAddModal,
  onOpenStatsModal,
  onOpenThemeModal,
  onSelectEntry,
}: CommandPaletteModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const staticCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'cmd-add',
        type: 'action',
        title: 'Add New Title to Archive',
        subtitle: 'Search TMDB, TVMaze, AniList, or OpenLibrary',
        Icon: Plus,
        onSelect: () => {
          onClose();
          onOpenAddModal?.();
        },
      },
      {
        id: 'cmd-stats',
        type: 'action',
        title: 'View Archive Statistics',
        subtitle: 'Breakdown of completed seasons, chapters, scores',
        Icon: BarChart2,
        onSelect: () => {
          onClose();
          onOpenStatsModal?.();
        },
      },
      {
        id: 'cmd-theme',
        type: 'action',
        title: 'Customize Theme & Colors',
        subtitle: 'Parchment, Midnight, Sepia, E-Ink, Cyber or custom',
        Icon: Palette,
        onSelect: () => {
          onClose();
          onOpenThemeModal?.();
        },
      },
      {
        id: 'cmd-stacks',
        type: 'action',
        title: 'Curated Stacks & Anthologies',
        subtitle: 'Manage thematic editorial collections',
        Icon: Layers,
        onSelect: () => {
          onClose();
          router.push('/stacks');
        },
      },
      {
        id: 'cmd-wrapped',
        type: 'action',
        title: 'View Yearly Wrapped',
        subtitle: 'Your year-in-review zine report',
        Icon: Sparkles,
        onSelect: () => {
          onClose();
          router.push('/wrapped');
        },
      },
      {
        id: 'cmd-settings',
        type: 'action',
        title: 'Account & Archive Settings',
        subtitle: 'Profile, visibility, export & import',
        Icon: Settings,
        onSelect: () => {
          onClose();
          router.push('/settings');
        },
      },
    ],
    [onClose, onOpenAddModal, onOpenStatsModal, onOpenThemeModal, router],
  );

  const filteredItems: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show default top actions + recently updated entries
      const topMedia: CommandItem[] = entries.slice(0, 8).map((e) => ({
        id: `media-${e.id}`,
        type: 'media',
        title: e.title,
        subtitle: `${e.category.toUpperCase()} • ${e.status.replace('_', ' ')}`,
        category: e.category,
        onSelect: () => {
          onClose();
          onSelectEntry?.(e);
        },
      }));
      return [...staticCommands, ...topMedia];
    }

    const matchedActions = staticCommands.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q),
    );

    const matchedMedia: CommandItem[] = entries
      .filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q)) ||
          e.genres?.some((g) => g.toLowerCase().includes(q)),
      )
      .slice(0, 15)
      .map((e) => ({
        id: `media-${e.id}`,
        type: 'media',
        title: e.title,
        subtitle: `${e.category.toUpperCase()} • ${e.status.replace('_', ' ')} • Current: ${e.primaryUnitCurrent}${e.secondaryUnitCurrent > 0 ? ` ep ${e.secondaryUnitCurrent}` : ''}`,
        category: e.category,
        onSelect: () => {
          onClose();
          onSelectEntry?.(e);
        },
      }));

    return [...matchedActions, ...matchedMedia];
  }, [query, staticCommands, entries, onClose, onSelectEntry]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].onSelect();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 backdrop-blur-xs animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-control border border-required bg-surface text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-decorative px-4 py-3 bg-surface-subtle">
          <Search size={18} className="text-ink-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a title or command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="hidden rounded border border-decorative bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              No matching titles or actions found.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const ActionIcon = item.Icon || ArrowRight;

              return (
                <div
                  key={item.id}
                  onClick={() => item.onSelect()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex cursor-pointer items-center justify-between rounded-small px-3 py-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-accent/15 text-accent font-medium'
                      : 'text-ink hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {item.type === 'action' ? (
                      <ActionIcon size={15} className="shrink-0 text-ink-muted" />
                    ) : item.category === 'movie' ? (
                      <Film size={14} className="shrink-0 text-ink-muted" />
                    ) : item.category === 'book' ? (
                      <BookOpen size={14} className="shrink-0 text-ink-muted" />
                    ) : item.category === 'manga' ? (
                      <Library size={14} className="shrink-0 text-ink-muted" />
                    ) : (
                      <Tv size={14} className="shrink-0 text-ink-muted" />
                    )}
                    <div className="overflow-hidden">
                      <div className="truncate font-medium">{item.title}</div>
                      {item.subtitle && (
                        <div className="truncate text-[11px] text-ink-muted">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 text-[10px] text-accent/80 font-mono">↵ select</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-decorative bg-surface-subtle px-3 py-1.5 text-[11px] text-ink-muted">
          <span>Navigate with ↑ ↓</span>
          <span>Open with ↵</span>
        </div>
      </div>
    </div>
  );
}
