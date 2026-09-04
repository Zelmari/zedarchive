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
  Users,
  MessageSquare,
  X,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
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
  section: 'commands' | 'catalogue';
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
    }
  }, [isOpen]);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const staticCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'cmd-add',
        type: 'action',
        section: 'commands',
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
        section: 'commands',
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
        section: 'commands',
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
        section: 'commands',
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
        section: 'commands',
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
        section: 'commands',
        title: 'Account & Archive Settings',
        subtitle: 'Profile, visibility, export & import',
        Icon: Settings,
        onSelect: () => {
          onClose();
          router.push('/settings');
        },
      },
      {
        id: 'cmd-friends',
        type: 'action',
        section: 'commands',
        title: 'Friends & Requests',
        subtitle: 'Manage friendships and requests',
        Icon: Users,
        onSelect: () => {
          onClose();
          router.push('/friends');
        },
      },
      {
        id: 'cmd-groups',
        type: 'action',
        section: 'commands',
        title: 'Groups & Group Chats',
        subtitle: 'Collaborate in shared archives and 7-day chats',
        Icon: MessageSquare,
        onSelect: () => {
          onClose();
          router.push('/groups');
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
        section: 'catalogue',
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
        section: 'catalogue',
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="top"
      ariaLabel="Command palette"
      initialFocusRef={inputRef}
      contentClassName="max-w-[40rem] overflow-hidden rounded-small text-ink shadow-layered"
    >
      <div className="border-b border-decorative bg-canvas px-4 py-4 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-2 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.16em] text-ink-faint">
          <span>Commands &amp; Navigation</span>
          <div className="flex items-center gap-2">
            <kbd className="hidden rounded-small border border-decorative bg-surface px-1.5 py-0.5 font-[var(--za-font-mono)] text-[0.65rem] tracking-normal text-ink-muted sm:inline-block">
              ⌘K
            </kbd>
            <button
              type="button"
              aria-label="Close command palette"
              onClick={onClose}
              className="za-modal-close"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Search size={19} className="shrink-0 text-accent" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a title, action, or command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 bg-transparent font-[var(--za-font-display)] text-[1.05rem] tracking-[0.02em] text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="shrink-0 rounded-small border border-decorative bg-surface px-1.5 py-0.5 font-[var(--za-font-mono)] text-[0.65rem] text-ink-muted">
            ESC
          </kbd>
        </div>
      </div>

      <div
        ref={listRef}
        className="max-h-[26rem] overflow-y-auto bg-surface p-2 sm:p-3"
        role="listbox"
        aria-label="Command palette results"
      >
        {filteredItems.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="font-[var(--za-font-display)] text-sm uppercase tracking-[0.08em] text-ink">
              No results found
            </div>
            <div className="mt-1 font-[var(--za-font-mono)] text-[0.7rem] text-ink-muted">
              No matching titles or actions for “{query.trim()}”.
            </div>
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const ActionIcon = item.Icon || ArrowRight;
            const previousItem = filteredItems[index - 1];
            const showSection = !previousItem || previousItem.section !== item.section;
            const sectionLabel =
              item.section === 'commands'
                ? 'Commands & Navigation'
                : query.trim()
                  ? `Catalogue Works (${filteredItems.filter((entry) => entry.section === 'catalogue').length})`
                  : `Catalogue Works (${entries.length})`;

            return (
              <div key={item.id}>
                {showSection && (
                  <div className="px-3 pb-1 pt-2 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.15em] text-ink-faint first:pt-0">
                    {sectionLabel}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => item.onSelect()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'group flex w-full cursor-pointer items-center justify-between rounded-small px-3 py-2.5 text-left text-sm transition-[background-color,color,box-shadow,transform] duration-[var(--za-motion-fast)]',
                    isSelected
                      ? 'bg-accent text-on-accent shadow-raised'
                      : 'text-ink hover:bg-surface-subtle',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                    {item.type === 'action' ? (
                      <ActionIcon
                        size={15}
                        aria-hidden="true"
                        className={cn('shrink-0', isSelected ? 'text-on-accent' : 'text-accent')}
                      />
                    ) : item.category === 'movie' ? (
                      <Film
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', isSelected ? 'text-on-accent' : 'text-ink-muted')}
                      />
                    ) : item.category === 'book' ? (
                      <BookOpen
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', isSelected ? 'text-on-accent' : 'text-ink-muted')}
                      />
                    ) : item.category === 'manga' ? (
                      <Library
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', isSelected ? 'text-on-accent' : 'text-ink-muted')}
                      />
                    ) : (
                      <Tv
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', isSelected ? 'text-on-accent' : 'text-ink-muted')}
                      />
                    )}
                    <span className="min-w-0 overflow-hidden">
                      <span className="block truncate font-[var(--za-weight-emphasis)]">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span
                          className={cn(
                            'block truncate text-[0.7rem]',
                            isSelected ? 'text-on-accent/80' : 'text-ink-muted',
                          )}
                        >
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="ml-3 shrink-0 font-[var(--za-font-mono)] text-[0.65rem] text-on-accent/80">
                      ↵ select
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-decorative bg-surface-subtle px-4 py-2 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.08em] text-ink-muted sm:px-6">
        <span>Navigate with ↑ ↓</span>
        <span>Open with ↵</span>
      </div>
    </Modal>
  );
}
