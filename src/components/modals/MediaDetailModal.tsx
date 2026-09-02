'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Pencil,
  Star,
  RotateCcw,
  Tag,
  BookmarkX,
  Trash2,
  Check,
  ExternalLink,
  Quote,
  Copy,
  X,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import DropReasonModal from '@/components/modals/DropReasonModal';
import { CATEGORY_CHIPS, pillClass } from '@/components/ui/media-controls';
import { MAX_TITLE_LENGTH, MAX_NOTES_LENGTH, STATUS_OPTIONS } from '@/lib/constants';
import { formatDisplayDate, pageToPercent } from '@/lib/format';
import { seasonTotal } from '@/lib/season';
import { MarkdownNotes } from '@/lib/markdown';
import { useCoverUpload } from '@/hooks/use-cover-upload';
import FolioCover from '@/components/modals/folio/FolioCover';
import FolioNotes from '@/components/modals/folio/FolioNotes';
import FolioUnitTotals from '@/components/modals/folio/FolioUnitTotals';
import type { MediaCategory, MediaEntry, MediaCycle, MediaQuote } from '@/types/media';
import type { WatchProviderItem, WatchProvidersResult } from '@/lib/services/tmdb';
import type { AnimeFillerMap } from '@/lib/services/anime';
import {
  addMediaQuote,
  updateMediaQuote,
  deleteMediaQuote,
  togglePriorityQueue,
} from '@/server/media';

interface MediaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MediaEntry | null;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
  isGroup?: boolean; // hide privacy when true
}

interface ProviderChipsProps {
  label: string;
  providers?: WatchProviderItem[];
  link?: string;
  titlePrefix: string;
}

function ProviderChips({ label, providers, link, titlePrefix }: ProviderChipsProps) {
  if (!providers?.length) return null;

  return (
    <div className="mt-2">
      <div className="mb-1 font-[var(--za-font-mono)] text-[10px] font-[var(--za-weight-emphasis)] uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {providers.map((provider) => (
          <a
            key={provider.id}
            href={link || '#'}
            target="_blank"
            rel="noopener noreferrer"
            title={`${titlePrefix} ${provider.name}`}
            className="inline-flex items-center gap-1.5 rounded-small border border-decorative bg-surface px-2 py-1 text-xs text-ink transition-[border-color,transform] hover:border-required hover:scale-105"
          >
            {provider.logoPath && (
              // eslint-disable-next-line @next/next/no-img-element -- external provider logos
              <img src={provider.logoPath} alt="" className="h-4 w-4 rounded-sm object-cover" />
            )}
            <span>{provider.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

interface ProviderAvailabilityProps {
  isBookLike: boolean;
  providersCountry: string;
  providersLoading: boolean;
  watchProviders: WatchProvidersResult | null;
}

function ProviderAvailability({
  isBookLike,
  providersCountry,
  providersLoading,
  watchProviders,
}: ProviderAvailabilityProps) {
  if (isBookLike) return null;

  const hasProviders = Boolean(
    watchProviders?.flatrate?.length ||
    watchProviders?.free?.length ||
    watchProviders?.rent?.length ||
    watchProviders?.buy?.length,
  );

  return (
    <div className="mt-[var(--za-space-5)] border-t border-dashed border-decorative pt-[var(--za-space-4)]">
      <div className="mb-2 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.1em] text-ink">
        Where to watch
        {providersCountry ? (
          <span className="ml-1 font-[var(--za-font-mono)] text-ink-muted">
            · {providersCountry}
          </span>
        ) : null}
      </div>
      {providersLoading && (
        <p className="text-xs text-ink-muted" role="status">
          Checking providers…
        </p>
      )}
      {!providersLoading && !hasProviders && (
        <p className="text-xs leading-[var(--za-leading-body)] text-ink-muted">
          No streaming providers detected for this title in {providersCountry}.
        </p>
      )}

      <ProviderChips
        label="Stream on subscription:"
        providers={watchProviders?.flatrate}
        link={watchProviders?.link}
        titlePrefix="Stream on"
      />
      <ProviderChips
        label="Free / with ads:"
        providers={watchProviders?.free}
        link={watchProviders?.link}
        titlePrefix="Watch free on"
      />
      <ProviderChips
        label="Rent:"
        providers={watchProviders?.rent}
        link={watchProviders?.link}
        titlePrefix="Rent on"
      />
      <ProviderChips
        label="Buy:"
        providers={watchProviders?.buy}
        link={watchProviders?.link}
        titlePrefix="Buy on"
      />

      {watchProviders?.link && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
          <span>Powered by JustWatch</span>
          <a
            href={watchProviders.link}
            target="_blank"
            rel="noopener noreferrer"
            className="za-link inline-flex items-center gap-0.5"
          >
            View all rent &amp; buy options <ExternalLink size={10} />
          </a>
        </div>
      )}
    </div>
  );
}

type CycleFormState = {
  startedAt: string;
  completedAt: string;
  rating: number | null;
  notes: string;
};

interface CycleLedgerProps {
  cycles: MediaCycle[];
  isBookLike: boolean;
  editingCycleId: string | 'new' | null;
  cycleForm: CycleFormState;
  isUpdating: boolean;
  onCycleFormChange: (updater: (previous: CycleFormState) => CycleFormState) => void;
  onOpenAddCycle: () => void;
  onOpenEditCycle: (cycle: MediaCycle) => void;
  onSaveCycle: () => void;
  onCancelCycle: () => void;
  onDeleteCycle: (cycleId: string) => void;
  onStartNewCycle: () => void;
}

function CycleLedger({
  cycles,
  isBookLike,
  editingCycleId,
  cycleForm,
  isUpdating,
  onCycleFormChange,
  onOpenAddCycle,
  onOpenEditCycle,
  onSaveCycle,
  onCancelCycle,
  onDeleteCycle,
  onStartNewCycle,
}: CycleLedgerProps) {
  return (
    <div className="border-t border-dashed border-decorative pt-[var(--za-space-4)]">
      <div className="mb-[var(--za-space-2)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.1em] text-ink">
          <RotateCcw size={12} />
          {isBookLike ? 'Reread cycles' : 'Rewatch cycles'}
        </div>
        <span className="font-[var(--za-font-mono)] text-xs font-[var(--za-weight-emphasis)] text-ink-muted">
          {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'}
        </span>
      </div>

      <div className="space-y-1.5">
        {cycles.map((cycle) => {
          const isOriginal = cycle.cycleNumber === 1;

          return (
            <div
              key={cycle.id}
              className="rounded-small border border-decorative bg-surface-subtle p-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-[var(--za-weight-emphasis)] text-ink">
                  {isOriginal
                    ? 'Cycle 1 (Original)'
                    : `Cycle ${cycle.cycleNumber} (${isBookLike ? 'Reread' : 'Rewatch'} ${cycle.cycleNumber - 1})`}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {cycle.rating != null && (
                    <span className="font-[var(--za-font-mono)] text-[10px] font-bold text-gold-dark">
                      ★ {cycle.rating}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenEditCycle(cycle)}
                    title="Edit cycle"
                    aria-label={`Edit cycle ${cycle.cycleNumber}`}
                    className="cursor-pointer rounded-small p-1 text-ink-muted hover:bg-surface hover:text-ink"
                  >
                    <Pencil size={11} />
                  </button>
                  {cycles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteCycle(cycle.id)}
                      title="Delete cycle"
                      aria-label={`Delete cycle ${cycle.cycleNumber}`}
                      className="cursor-pointer rounded-small p-1 text-ink-muted hover:bg-danger-surface hover:text-danger"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-0.5 text-[11px] text-ink-muted">
                {formatDisplayDate(cycle.startedAt)} →{' '}
                {cycle.completedAt ? (
                  formatDisplayDate(cycle.completedAt)
                ) : (
                  <span className="font-[var(--za-weight-emphasis)] text-accent">In Progress</span>
                )}
              </div>

              {cycle.notes && (
                <p className="mt-1 text-[11px] italic text-ink-muted">
                  &ldquo;{cycle.notes}&rdquo;
                </p>
              )}
            </div>
          );
        })}
      </div>

      {editingCycleId && (
        <div className="mt-2 rounded-small border border-required bg-surface p-2.5 text-xs">
          <div className="mb-1.5 font-[var(--za-weight-emphasis)] text-ink">
            {editingCycleId === 'new' ? 'Log Past Cycle' : 'Edit Cycle'}
          </div>
          <div className="space-y-1.5">
            <div>
              <label className="block text-[10px] text-ink-muted" htmlFor="cycle-start-date">
                Start Date
              </label>
              <input
                id="cycle-start-date"
                type="date"
                className="za-field text-xs"
                value={cycleForm.startedAt}
                onChange={(event) =>
                  onCycleFormChange((previous) => ({
                    ...previous,
                    startedAt: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-[10px] text-ink-muted" htmlFor="cycle-finish-date">
                Finish Date (Optional)
              </label>
              <input
                id="cycle-finish-date"
                type="date"
                className="za-field text-xs"
                value={cycleForm.completedAt}
                onChange={(event) =>
                  onCycleFormChange((previous) => ({
                    ...previous,
                    completedAt: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-[10px] text-ink-muted" htmlFor="cycle-rating">
                Rating (1–10, Optional)
              </label>
              <input
                id="cycle-rating"
                type="number"
                min={1}
                max={10}
                placeholder="e.g. 9"
                className="za-field text-xs"
                value={cycleForm.rating ?? ''}
                onChange={(event) => {
                  const value = event.target.value ? parseInt(event.target.value, 10) : null;
                  onCycleFormChange((previous) => ({ ...previous, rating: value }));
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-ink-muted" htmlFor="cycle-notes">
                Notes (Optional)
              </label>
              <input
                id="cycle-notes"
                type="text"
                placeholder="e.g. Rewatched with friends"
                className="za-field text-xs"
                value={cycleForm.notes}
                onChange={(event) =>
                  onCycleFormChange((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={onCancelCycle}
                className="za-button za-button--secondary min-h-0 px-2 py-0.5 text-xs"
                disabled={isUpdating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveCycle}
                disabled={isUpdating}
                className="za-button za-button--primary min-h-0 px-2 py-0.5 text-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-col gap-1.5">
        <button
          type="button"
          className="za-button za-button--secondary w-full text-xs"
          onClick={onStartNewCycle}
          disabled={isUpdating}
        >
          <RotateCcw size={12} />
          {isBookLike ? 'Start New Reread' : 'Start New Rewatch'}
        </button>
        {!editingCycleId && (
          <button
            type="button"
            className="za-button za-button--secondary min-h-0 py-1 text-xs"
            onClick={onOpenAddCycle}
            disabled={isUpdating}
          >
            + Log Past Cycle Date
          </button>
        )}
      </div>
    </div>
  );
}

function getStatusLabel(status: string, category: MediaCategory): string {
  if (status === 'completed' && category === 'movie') return 'Watched';
  if (status === 'planning') {
    if (category === 'movie') return 'Plan to Watch';
    if (category === 'book' || category === 'manga') return 'Plan to Read';
  }
  return status.replace('_', ' ');
}

function toDateInputVal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function MediaDetailModal({
  isOpen,
  onClose,
  item,
  onUpdate,
  isGroup = false,
}: MediaDetailModalProps) {
  const [activeSeason, setActiveSeason] = useState(1);
  const [newTagInput, setNewTagInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDropReasonOpen, setIsDropReasonOpen] = useState(false);
  const [isSelectingDroppedStatus, setIsSelectingDroppedStatus] = useState(false);

  // Cycle management state
  const [editingCycleId, setEditingCycleId] = useState<string | 'new' | null>(null);
  const [cycleForm, setCycleForm] = useState<CycleFormState>({
    startedAt: '',
    completedAt: '',
    rating: null,
    notes: '',
  });

  // Streaming availability state
  const [watchProviders, setWatchProviders] = useState<WatchProvidersResult | null>(null);
  const [providersCountry, setProvidersCountry] = useState<string>('US');
  const [providersLoading, setProvidersLoading] = useState(false);

  // Anime filler guide state
  const [fillerMap, setFillerMap] = useState<AnimeFillerMap | null>(null);
  const [fillerFilter, setFillerFilter] = useState<'all' | 'canon_only'>('all');

  // Quotes state
  const [editingQuoteId, setEditingQuoteId] = useState<string | 'new' | null>(null);
  const [quoteForm, setQuoteForm] = useState<{
    text: string;
    speaker: string;
    citation: string;
    isFavorite: boolean;
  }>({
    text: '',
    speaker: '',
    citation: '',
    isFavorite: false,
  });
  const [copiedQuoteId, setCopiedQuoteId] = useState<string | null>(null);

  // Stable references for async callbacks and closures
  const itemRef = useRef<MediaEntry | null>(item);
  const onUpdateRef = useRef(onUpdate);

  // Title and notes draft state for debounced editing
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [titleError, setTitleError] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const titleDraftRef = useRef(titleDraft);
  const notesDraftRef = useRef(notesDraft);

  useEffect(() => {
    itemRef.current = item;
    onUpdateRef.current = onUpdate;
    titleDraftRef.current = titleDraft;
    notesDraftRef.current = notesDraft;
  });

  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);

  const runUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const currentItem = itemRef.current;
    if (!currentItem) return;
    try {
      setIsUpdating(true);
      await onUpdateRef.current(currentItem.id, updates);
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const coverUpload = useCoverUpload({
    onCoverChange: (coverImage) => {
      return runUpdate({ coverImage });
    },
  });

  const clearCoverError = coverUpload.clearError;

  // Reset detail state and drafts when switching entries
  useEffect(() => {
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset detail state when switching entries
    setActiveSeason(1);
    setFillerMap(null);
    setWatchProviders(null);
    setProvidersLoading(false);
    setFillerFilter('all');
    setProvidersCountry('US');
    setIsSelectingDroppedStatus(false);
    setIsDropReasonOpen(false);
    setIsEditingTitle(false);
    clearCoverError();

    if (item) {
      setTitleDraft(item.title);
      titleDraftRef.current = item.title;
      setNotesDraft(item.notes ?? '');
      notesDraftRef.current = item.notes ?? '';
      setTitleError('');
    } else {
      setTitleDraft('');
      titleDraftRef.current = '';
      setNotesDraft('');
      notesDraftRef.current = '';
      setTitleError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronize on item id switch
  }, [item?.id, clearCoverError]);

  useEffect(() => {
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  const saveTitle = useCallback(
    async (draft: string) => {
      const currentItem = itemRef.current;
      if (!currentItem) return;
      const trimmed = draft.trim();
      if (!trimmed) {
        setTitleError('Title is required');
        return;
      }
      setTitleError('');
      if (trimmed === currentItem.title) return;
      await runUpdate({ title: trimmed });
    },
    [runUpdate],
  );

  const handleTitleChange = useCallback(
    (val: string) => {
      const capped = val.slice(0, MAX_TITLE_LENGTH);
      setTitleDraft(capped);
      if (capped.trim()) {
        setTitleError('');
      }
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
      }
      titleTimerRef.current = setTimeout(() => {
        void saveTitle(capped);
      }, 500);
    },
    [saveTitle],
  );

  const handleTitleBlur = useCallback(() => {
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    void saveTitle(titleDraftRef.current);
  }, [saveTitle]);

  const saveNotes = useCallback(
    async (draft: string) => {
      const currentItem = itemRef.current;
      if (!currentItem) return;
      const currentNotes = currentItem.notes ?? '';
      if (draft === currentNotes) return;
      await runUpdate({ notes: draft.trim() ? draft : null });
    },
    [runUpdate],
  );

  const handleNotesChange = useCallback(
    (val: string) => {
      const capped = val.slice(0, MAX_NOTES_LENGTH);
      setNotesDraft(capped);
      if (notesTimerRef.current) {
        clearTimeout(notesTimerRef.current);
      }
      notesTimerRef.current = setTimeout(() => {
        void saveNotes(capped);
      }, 500);
    },
    [saveNotes],
  );

  const handleNotesBlur = useCallback(() => {
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }
    void saveNotes(notesDraftRef.current);
  }, [saveNotes]);

  const flushPendingText = useCallback(async () => {
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }
    const currentItem = itemRef.current;
    if (!currentItem) return;

    const patch: Record<string, unknown> = {};
    const trimmedTitle = titleDraftRef.current.trim();
    if (trimmedTitle && trimmedTitle !== currentItem.title) {
      patch.title = trimmedTitle;
    } else if (!trimmedTitle && titleDraftRef.current !== currentItem.title) {
      setTitleError('Title is required');
    }

    const currentNotes = currentItem.notes ?? '';
    const currentDraftNotes = notesDraftRef.current;
    if (currentDraftNotes !== currentNotes) {
      patch.notes = currentDraftNotes.trim() ? currentDraftNotes : null;
    }

    if (Object.keys(patch).length > 0) {
      await runUpdate(patch);
    }
  }, [runUpdate]);

  const handleClose = useCallback(() => {
    void (async () => {
      await flushPendingText();
      onClose();
    })();
  }, [flushPendingText, onClose]);

  useEffect(() => {
    if (!isOpen || !item) return;
    const cat = item.category || 'movie';
    if (cat === 'book' || cat === 'manga') return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading state before provider request
    setProvidersLoading(true);
    let isMounted = true;

    const params = new URLSearchParams({
      category: cat,
      title: item.title,
    });
    if (item.sourceId) params.set('sourceId', item.sourceId);

    fetch(`/api/media/providers?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setWatchProviders(data.providers ?? null);
        if (data.country) setProvidersCountry(data.country);
      })
      .catch(() => {
        if (isMounted) setWatchProviders(null);
      })
      .finally(() => {
        if (isMounted) setProvidersLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen || !item) return;
    const cat = item.category;
    if (cat !== 'anime') return;

    let isMounted = true;
    const params = new URLSearchParams({ title: item.title });
    if (item.sourceId) params.set('sourceId', item.sourceId);

    fetch(`/api/anime/filler?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setFillerMap(data.fillerMap ?? null);
      })
      .catch(() => {
        if (isMounted) setFillerMap(null);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const category = item.category || 'show';
  const isBookLike = category === 'book' || category === 'manga';
  const isMovie = category === 'movie';
  const status = item.status || 'in_progress';
  const rating = item.rating;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const genres = Array.isArray(item.genres) ? item.genres : [];
  const cycles: MediaCycle[] =
    Array.isArray(item.cycles) && item.cycles.length > 0
      ? item.cycles
      : [
          {
            id: 'initial',
            cycleNumber: 1,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            rating: item.rating,
            notes: null,
          },
        ];

  const primaryCurrent = item.primaryUnitCurrent ?? (isMovie ? 0 : 1);
  const primaryTotal = item.primaryUnitTotal ?? 1;
  const secondaryCurrent = item.secondaryUnitCurrent ?? 0;
  const secondaryTotal = item.secondaryUnitTotal ?? null;
  const structure = Array.isArray(item.structure) ? item.structure : [];

  const handleCategoryChange = async (nextCategory: MediaCategory) => {
    if (nextCategory === category) return;

    const getFamily = (cat: MediaCategory): 'show_anime' | 'book_manga' | 'movie' => {
      if (cat === 'show' || cat === 'anime') return 'show_anime';
      if (cat === 'book' || cat === 'manga') return 'book_manga';
      return 'movie';
    };

    const currentFamily = getFamily(category);
    const targetFamily = getFamily(nextCategory);

    if (currentFamily !== targetFamily) {
      const confirmed = window.confirm(
        'Switching category changes how progress is counted. Continue?',
      );
      if (!confirmed) return;
    }

    const isLeavingShowAnime = currentFamily === 'show_anime' && targetFamily !== 'show_anime';

    if (isLeavingShowAnime && structure.length > 0) {
      const confirmed = window.confirm('Season breakdown will be removed.');
      if (!confirmed) return;
    }

    const patch: Record<string, unknown> = {
      category: nextCategory,
    };

    if (targetFamily === 'movie') {
      patch.primaryUnitCurrent = item.rewatchCount ?? 0;
      if (item.secondaryUnitTotal != null) {
        // If old secondary is episode-scale, keep secondaryTotal as runtime only if it looks like minutes;
        // otherwise leave as-is if already a runtime. If secondaryUnitTotal missing, do not invent one.
        if (currentFamily === 'show_anime') {
          if (item.secondaryUnitTotal > 40) {
            patch.secondaryUnitTotal = item.secondaryUnitTotal;
          } else {
            patch.secondaryUnitTotal = null;
          }
        } else {
          patch.secondaryUnitTotal = item.secondaryUnitTotal;
        }
      }
    } else if (currentFamily === 'movie') {
      // Switching out of movie: runtime minutes (e.g. > 50) do not translate to
      // episode or chapter numbers, so reset secondaryUnitCurrent to 0.
      if ((item.secondaryUnitCurrent ?? 0) > 50) {
        patch.secondaryUnitCurrent = 0;
      }
      if ((item.primaryUnitCurrent ?? 0) < 1) {
        patch.primaryUnitCurrent = 1;
      }
    }

    if (isLeavingShowAnime) {
      patch.structure = [];
    }

    await runUpdate(patch);
  };

  const handleRatingChange = (nextRating: number) => {
    void runUpdate({ rating: rating === nextRating ? null : nextRating });
  };

  const handleStatusChange = (nextStatus: string) => {
    if (nextStatus === status) return;
    if (nextStatus === 'dropped') {
      setIsSelectingDroppedStatus(true);
      setIsDropReasonOpen(true);
      return;
    }
    void runUpdate({ status: nextStatus });
  };

  const openDropReason = () => {
    setIsSelectingDroppedStatus(false);
    setIsDropReasonOpen(true);
  };

  const handleStartRewatch = async () => {
    await runUpdate({
      rewatch: true,
    });
  };

  const handleOpenAddCycle = () => {
    setEditingCycleId('new');
    setCycleForm({
      startedAt: toDateInputVal(new Date().toISOString()),
      completedAt: toDateInputVal(new Date().toISOString()),
      rating: null,
      notes: '',
    });
  };

  const handleOpenEditCycle = (cycle: MediaCycle) => {
    setEditingCycleId(cycle.id);
    setCycleForm({
      startedAt: toDateInputVal(cycle.startedAt),
      completedAt: toDateInputVal(cycle.completedAt),
      rating: cycle.rating ?? null,
      notes: cycle.notes || '',
    });
  };

  const handleSaveCycle = async () => {
    const startIso = cycleForm.startedAt ? new Date(cycleForm.startedAt).toISOString() : null;
    const endIso = cycleForm.completedAt ? new Date(cycleForm.completedAt).toISOString() : null;

    if (editingCycleId === 'new') {
      const nextCycleNumber = cycles.length + 1;
      const newCycle: MediaCycle = {
        id: crypto.randomUUID(),
        cycleNumber: nextCycleNumber,
        startedAt: startIso,
        completedAt: endIso,
        rating: cycleForm.rating,
        notes: cycleForm.notes.trim() || null,
      };
      const nextCycles = [...cycles, newCycle];
      await runUpdate({
        cycles: nextCycles,
        rewatchCount: Math.max(0, nextCycles.length - 1),
      });
    } else {
      const nextCycles = cycles.map((c) => {
        if (c.id !== editingCycleId) return c;
        return {
          ...c,
          startedAt: startIso,
          completedAt: endIso,
          rating: cycleForm.rating,
          notes: cycleForm.notes.trim() || null,
        };
      });
      await runUpdate({
        cycles: nextCycles,
      });
    }
    setEditingCycleId(null);
  };

  const handleDeleteCycle = async (cycleId: string) => {
    const filtered = cycles.filter((c) => c.id !== cycleId);
    const renumbered = (
      filtered.length > 0
        ? filtered
        : [
            {
              id: crypto.randomUUID(),
              cycleNumber: 1,
              startedAt: item.startedAt,
              completedAt: item.completedAt,
              rating: null,
              notes: null,
            },
          ]
    ).map((c, i) => ({ ...c, cycleNumber: i + 1 }));

    await runUpdate({
      cycles: renumbered,
      rewatchCount: Math.max(0, renumbered.length - 1),
    });
    if (editingCycleId === cycleId) {
      setEditingCycleId(null);
    }
  };

  // Quotes handlers
  const handleOpenAddQuote = () => {
    setQuoteForm({ text: '', speaker: '', citation: '', isFavorite: false });
    setEditingQuoteId('new');
  };

  const handleOpenEditQuote = (quote: MediaQuote) => {
    setQuoteForm({
      text: quote.text,
      speaker: quote.speaker || '',
      citation: quote.citation || '',
      isFavorite: Boolean(quote.isFavorite),
    });
    setEditingQuoteId(quote.id);
  };

  const handleSaveQuote = async () => {
    if (!item || !quoteForm.text.trim()) return;
    setIsUpdating(true);
    try {
      if (editingQuoteId === 'new') {
        const updated = await addMediaQuote(item.id, quoteForm);
        await onUpdate(item.id, { quotes: updated.quotes });
      } else if (editingQuoteId) {
        const updated = await updateMediaQuote(item.id, editingQuoteId, quoteForm);
        await onUpdate(item.id, { quotes: updated.quotes });
      }
      setEditingQuoteId(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!item) return;
    setIsUpdating(true);
    try {
      const updated = await deleteMediaQuote(item.id, quoteId);
      await onUpdate(item.id, { quotes: updated.quotes });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyQuote = (quote: MediaQuote) => {
    const speakerPart = quote.speaker ? ` — ${quote.speaker}` : '';
    const titlePart = `, ${item?.title || ''}`;
    const citationPart = quote.citation ? ` (${quote.citation})` : '';
    const textToCopy = `“${quote.text}”${speakerPart}${titlePart}${citationPart}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedQuoteId(quote.id);
    setTimeout(() => setCopiedQuoteId(null), 2000);
  };

  const handleSetEpisode = async (epNumber: number, seasonNumber: number) => {
    const updates: Record<string, unknown> = {};
    if (seasonNumber && seasonNumber !== primaryCurrent) {
      updates.primaryUnitCurrent = seasonNumber;
      // Always reset the secondary total on season switches so a season
      // with an unknown total never inherits the previous season's count.
      updates.secondaryUnitTotal = seasonTotal(structure, seasonNumber);
    }
    updates.secondaryUnitCurrent = epNumber;
    await runUpdate(updates);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagInput.trim().toLowerCase();
    if (!clean || tags.includes(clean)) return;

    const nextTags = [...tags, clean];
    setNewTagInput('');
    await runUpdate({ tags: nextTags });
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    await runUpdate({ tags: nextTags });
  };

  // Determine episodes for current selected season
  const totalUnitsInSeason =
    seasonTotal(structure, activeSeason) ||
    (activeSeason === primaryCurrent ? secondaryTotal : null) ||
    24;
  const fillerCount = fillerMap
    ? Object.values(fillerMap.episodes).filter(
        (episode) => episode.type === 'filler' || episode.type === 'recap',
      ).length
    : 0;
  const hasFillerOrRecap = fillerCount > 0;

  const sectionLabel =
    'mb-2 flex items-center gap-1 border-b border-decorative pb-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.1em] text-ink';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      labelledBy="media-detail-title"
      ariaLabel="Media detail folio"
      contentClassName="relative max-w-[68rem] overflow-y-auto p-0"
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Close modal"
          onClick={handleClose}
          className="za-modal-close absolute right-[var(--za-space-4)] top-[var(--za-space-4)] z-10"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <div className="za-folio-spread">
          {/* Left Column */}
          <aside className="min-w-0 bg-canvas p-[var(--za-space-6)] md:border-r md:border-decorative">
            <FolioCover
              coverImage={item.coverImage}
              title={item.title}
              sourceId={item.sourceId}
              isCompressing={coverUpload.isCompressing}
              isUpdating={isUpdating}
              error={coverUpload.error}
              onOpenFilePicker={coverUpload.openFilePicker}
              onRemoveCover={coverUpload.handleImageRemove}
              fileInputProps={coverUpload.fileInputProps}
            />

            {/* Gold-foil rating selector */}
            <div
              className="mt-[var(--za-space-4)] rounded-small border border-decorative bg-surface p-2.5 shadow-raised"
              aria-label="Personal rating"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.08em] text-ink-muted">
                  Rating
                </span>
                <span className="font-[var(--za-font-mono)] text-xs font-[var(--za-weight-emphasis)] text-gold-dark">
                  {rating != null ? `${rating}/10★` : 'Unrated'}
                </span>
              </div>
              <div
                className="flex flex-wrap gap-0.5"
                role="radiogroup"
                aria-label="Rating from 1 to 10"
              >
                {Array.from({ length: 10 }, (_, index) => {
                  const score = index + 1;
                  const isRated = rating != null && score <= rating;
                  return (
                    <button
                      key={score}
                      type="button"
                      role="radio"
                      aria-checked={rating === score}
                      aria-label={`Rate ${score} out of 10`}
                      title={`Rate ${score} out of 10`}
                      onClick={() => handleRatingChange(score)}
                      disabled={isUpdating}
                      className={`flex h-7 w-6 cursor-pointer items-center justify-center rounded-small border text-gold transition-[all] duration-[var(--za-motion-fast)] hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed ${
                        isRated ? 'border-gold/50 bg-gold/10' : 'border-transparent'
                      }`}
                    >
                      <Star size={14} fill={isRated ? 'currentColor' : 'none'} strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status and priority */}
            <div className="mt-[var(--za-space-4)]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="detail-status"
                  className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-[var(--za-weight-heading)] uppercase tracking-[0.08em] text-ink-muted"
                >
                  Catalogue status
                </label>
                <StatusBadge status={status} label={getStatusLabel(status, category)} />
              </div>
              <select
                id="detail-status"
                value={status}
                onChange={(event) => handleStatusChange(event.target.value)}
                disabled={isUpdating}
                className="za-field"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-[var(--za-space-3)]">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const updated = await togglePriorityQueue(item.id);
                    await onUpdate(item.id, { priorityIndex: updated.priorityIndex });
                  } catch (err) {
                    console.error('Failed to toggle priority queue:', err);
                  }
                }}
                className={`za-button w-full text-xs ${
                  item.priorityIndex != null ? 'za-button--selected' : 'za-button--secondary'
                }`}
                title={
                  item.priorityIndex != null
                    ? `Rank #${item.priorityIndex} in Up Next (Click to remove)`
                    : 'Pin to Up Next Queue'
                }
              >
                {item.priorityIndex != null
                  ? `⚡ Up Next #${item.priorityIndex}`
                  : '+ Add to Up Next'}
              </button>
            </div>

            <ProviderAvailability
              isBookLike={isBookLike}
              providersCountry={providersCountry}
              providersLoading={providersLoading}
              watchProviders={watchProviders}
            />

            {/* Tags / Shelves */}
            <div className="mt-[var(--za-space-4)]">
              <div className={sectionLabel}>
                <Tag size={12} /> Tags & Shelves
              </div>
              <div className="mb-[0.4rem] flex flex-wrap gap-[0.3rem]">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-[3px] rounded-small border border-decorative bg-surface-subtle px-[0.4rem] py-[0.1rem] text-xs"
                  >
                    #{t}
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent p-0 text-ink-muted"
                      onClick={() => handleRemoveTag(t)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="flex gap-[0.3rem]">
                <input
                  type="text"
                  placeholder="Add tag (e.g. favorites)..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  className="za-field flex-1 text-xs"
                />
                <button
                  type="submit"
                  className="za-button za-button--secondary min-h-0 px-[0.5rem] py-[0.2rem] text-xs"
                >
                  +
                </button>
              </form>
            </div>

            {/* Privacy Plate (personal archives only) */}
            {!isGroup && (
              <div className="mt-[var(--za-space-4)] rounded-control border border-decorative bg-surface p-3">
                <label className="flex cursor-pointer items-center justify-between gap-2 text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink">
                  <span>Private Title (Hide from public profile & RSS)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(item.isPrivate)}
                    disabled={isUpdating}
                    onChange={(e) => void runUpdate({ isPrivate: e.target.checked })}
                    className="h-4 w-4 rounded accent-accent"
                  />
                </label>
                <p className="mt-1 text-[11px] text-ink-muted">
                  When checked, this entry is only visible to you on your private dashboard and
                  excluded from public showcases.
                </p>
              </div>
            )}
          </aside>

          {/* Right Column */}
          <section className="min-w-0 p-[var(--za-space-6)] md:p-[var(--za-space-8)]">
            <div className="mb-[var(--za-space-6)] border-b border-decorative pb-[var(--za-space-4)] pr-10">
              <div
                className="mb-2 flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="Media Category"
              >
                {CATEGORY_CHIPS.map(({ id, label, Icon }) => {
                  const active = category === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={isUpdating}
                      onClick={() => void handleCategoryChange(id)}
                      className={`za-button ${active ? 'za-button--selected' : 'za-button--secondary'} min-h-0 px-2 py-0.5 text-xs inline-flex items-center gap-1`}
                    >
                      <Icon size={12} strokeWidth={2} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {isEditingTitle ? (
                <input
                  id="media-detail-title"
                  type="text"
                  autoFocus
                  aria-label="Title"
                  value={titleDraft}
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder="e.g. Frieren: Beyond Journey's End"
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onBlur={() => {
                    handleTitleBlur();
                    setIsEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      setTitleDraft(item.title);
                      setTitleError('');
                      setIsEditingTitle(false);
                    }
                  }}
                  className="w-full rounded-small border border-accent bg-surface px-1.5 py-0.5 font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink outline-none"
                />
              ) : (
                <h2
                  id="media-detail-title"
                  tabIndex={0}
                  role="button"
                  onClick={() => setIsEditingTitle(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsEditingTitle(true);
                    }
                  }}
                  title="Click to edit title"
                  className="cursor-pointer rounded-small font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] text-ink transition-colors hover:bg-surface-subtle"
                >
                  {titleDraft.trim() || item.title}
                </h2>
              )}
              {titleError && (
                <div
                  className="mt-1 text-xs font-[var(--za-weight-emphasis)] text-danger"
                  role="alert"
                >
                  {titleError}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--za-text-fine)] text-ink-muted">
                {genres.length > 0 && <span>{genres.join(' · ')}</span>}
                <span>Added {formatDisplayDate(item.createdAt)}</span>
              </div>
            </div>

            {status === 'dropped' && (
              <div className="za-notice za-notice--error mb-[var(--za-space-5)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <BookmarkX size={16} className="mt-0.5 shrink-0 text-danger" />
                    <div>
                      <div className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-danger">
                        Dropped
                        {item.droppedAt ? ` on ${formatDisplayDate(item.droppedAt)}` : ''}
                        {(() => {
                          const pri = item.droppedProgressPrimary ?? primaryCurrent;
                          const sec = item.droppedProgressSecondary ?? secondaryCurrent;
                          if (category === 'movie') return '';
                          if (isBookLike) {
                            return sec != null && sec > 0
                              ? ` at Vol ${pri}, Ch ${sec}`
                              : ` at Vol ${pri}`;
                          }
                          return sec != null && sec > 0
                            ? ` at Season ${pri}, Ep ${sec}`
                            : ` at Season ${pri}`;
                        })()}
                      </div>
                      {item.dropReason && (
                        <p className="mt-1 text-[length:var(--za-text-fine)] text-ink italic">
                          Reason: &ldquo;{item.dropReason}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={openDropReason}
                      className="za-button za-button--secondary min-h-0 px-2 py-1 text-xs"
                    >
                      Edit Reason
                    </button>
                    <button
                      type="button"
                      onClick={() => void runUpdate({ status: 'in_progress' })}
                      className="za-button za-button--primary min-h-0 px-2 py-1 text-xs"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div>
            )}

            {item.synopsis && (
              <div className="mb-[var(--za-space-5)]">
                <div className={sectionLabel}>SYNOPSIS</div>
                <MarkdownNotes
                  content={item.synopsis}
                  className="text-[length:var(--za-text-fine)] leading-[var(--za-leading-body)] text-ink"
                />
              </div>
            )}

            {/* Progress Checklist */}
            <div>
              <div className={`${sectionLabel} mb-[var(--za-space-2)]`}>
                {isBookLike
                  ? 'READING PROGRESS & QUICK JUMP'
                  : isMovie
                    ? 'WATCH PROGRESS'
                    : 'EPISODE MATRIX'}
              </div>

              <FolioUnitTotals
                category={category}
                primaryUnitTotal={item.primaryUnitTotal ?? null}
                primaryUnitCurrent={primaryCurrent}
                secondaryUnitTotal={secondaryTotal}
                secondaryUnitCurrent={secondaryCurrent}
                structure={structure}
                activeSeason={activeSeason}
                isUpdating={isUpdating}
                onCommit={runUpdate}
              />

              {isMovie && (
                <div className="mb-3 rounded-small border border-decorative bg-surface-subtle p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-[var(--za-weight-emphasis)] text-ink">
                      Runtime watched
                    </span>
                    <span className="font-[var(--za-weight-emphasis)] text-accent">
                      {secondaryTotal != null
                        ? `${secondaryCurrent} of ${secondaryTotal} min`
                        : `${secondaryCurrent} min`}
                    </span>
                  </div>
                  {secondaryTotal != null && secondaryTotal > 0 && (
                    <input
                      type="range"
                      min={0}
                      max={secondaryTotal}
                      value={secondaryCurrent}
                      disabled={isUpdating}
                      aria-label="Minutes watched"
                      onChange={(event) => {
                        const minutes = parseInt(event.target.value, 10) || 0;
                        void runUpdate({ secondaryUnitCurrent: minutes });
                      }}
                      className="mt-2 w-full cursor-pointer accent-accent"
                    />
                  )}
                </div>
              )}

              {/* Book / Manga percentage and slider controls */}
              {isBookLike && secondaryTotal !== null && secondaryTotal > 0 && (
                <div className="mb-3 rounded-control border border-decorative bg-surface-subtle p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-[var(--za-weight-emphasis)] text-ink">
                      Page {secondaryCurrent} of {secondaryTotal}
                    </span>
                    <span className="font-[var(--za-weight-emphasis)] text-accent">
                      {pageToPercent(secondaryCurrent, secondaryTotal)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={secondaryTotal}
                    value={secondaryCurrent}
                    disabled={isUpdating}
                    onChange={(e) => {
                      const newPg = parseInt(e.target.value, 10) || 0;
                      void runUpdate({ secondaryUnitCurrent: newPg });
                    }}
                    className="mt-2 w-full accent-accent cursor-pointer"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Anime Filler / Canon Filter Bar */}
              {category === 'anime' && fillerMap && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-decorative bg-surface-subtle p-2.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-[var(--za-weight-emphasis)] text-ink-muted">
                      EPISODE GUIDE:
                    </span>
                    <button
                      type="button"
                      onClick={() => setFillerFilter('all')}
                      className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
                        fillerFilter === 'all'
                          ? 'border border-required bg-surface text-ink'
                          : 'border border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      All ({totalUnitsInSeason})
                    </button>
                    {hasFillerOrRecap && (
                      <button
                        type="button"
                        onClick={() => setFillerFilter('canon_only')}
                        className={`rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] transition-[all] ${
                          fillerFilter === 'canon_only'
                            ? 'border border-accent bg-accent/15 text-accent'
                            : 'border border-transparent text-ink-muted hover:text-ink'
                        }`}
                      >
                        Canon Only
                      </button>
                    )}
                  </div>
                  {hasFillerOrRecap && (
                    <span className="text-[11px] text-ink-muted">
                      ✦ {fillerCount} filler/recap episodes detected
                    </span>
                  )}
                </div>
              )}

              {!isMovie && structure.length > 1 && (
                <div className="mb-2 flex gap-[0.3rem] overflow-x-auto pb-[0.4rem]">
                  {structure.map((s) => (
                    <button
                      key={s.number}
                      type="button"
                      className={pillClass(activeSeason === s.number)}
                      onClick={() => setActiveSeason(s.number)}
                    >
                      {s.name || `Season ${s.number}`}
                    </button>
                  ))}
                </div>
              )}

              {!isMovie && (
                <div className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-[0.35rem] overflow-y-auto rounded-small border border-decorative bg-surface-subtle p-2">
                  {Array.from({ length: Math.min(100, Math.max(1, totalUnitsInSeason)) }).map(
                    (_, i) => {
                      const unitNum = i + 1;
                      const epInfo =
                        category === 'anime' && fillerMap ? fillerMap.episodes[unitNum] : null;
                      const isFiller = epInfo?.type === 'filler';
                      const isRecap = epInfo?.type === 'recap';

                      if (
                        category === 'anime' &&
                        fillerFilter === 'canon_only' &&
                        (isFiller || isRecap)
                      ) {
                        return null;
                      }

                      const isDone =
                        activeSeason < primaryCurrent ||
                        (activeSeason === primaryCurrent && unitNum <= secondaryCurrent);
                      const isCurrent =
                        activeSeason === primaryCurrent && unitNum === secondaryCurrent;

                      return (
                        <button
                          key={unitNum}
                          type="button"
                          onClick={() => handleSetEpisode(unitNum, activeSeason)}
                          disabled={isUpdating}
                          title={
                            epInfo
                              ? `Episode ${unitNum}${epInfo.title ? `: ${epInfo.title}` : ''} (${isFiller ? 'Filler' : isRecap ? 'Recap' : 'Canon'})`
                              : undefined
                          }
                          style={{
                            background: isCurrent
                              ? 'var(--za-color-accent)'
                              : isDone
                                ? 'rgba(46, 125, 50, 0.15)'
                                : isFiller
                                  ? 'rgba(234, 179, 8, 0.08)'
                                  : 'var(--za-color-surface)',
                            color: isCurrent
                              ? 'var(--za-color-on-accent)'
                              : isDone
                                ? '#2e7d32'
                                : isFiller
                                  ? '#b45309'
                                  : 'var(--za-color-text)',
                            borderColor: isCurrent
                              ? 'var(--za-color-accent)'
                              : isDone
                                ? 'rgba(46, 125, 50, 0.4)'
                                : isFiller
                                  ? 'rgba(234, 179, 8, 0.4)'
                                  : 'var(--za-color-border-decorative)',
                            borderStyle: isFiller ? 'dashed' : 'solid',
                            fontWeight: isCurrent ? 'bold' : 'normal',
                          }}
                          className="relative inline-flex h-[2.2rem] cursor-pointer items-center justify-center rounded-small border text-[length:var(--za-text-fine)]"
                        >
                          {unitNum}
                          {isFiller && (
                            <span
                              aria-hidden="true"
                              className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-[#b45309] text-[8px] font-bold text-white"
                            >
                              F
                            </span>
                          )}
                          {isRecap && (
                            <span
                              aria-hidden="true"
                              className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-slate-500 text-[8px] font-bold text-white"
                            >
                              R
                            </span>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>

            <CycleLedger
              cycles={cycles}
              isBookLike={isBookLike}
              editingCycleId={editingCycleId}
              cycleForm={cycleForm}
              isUpdating={isUpdating}
              onCycleFormChange={setCycleForm}
              onOpenAddCycle={handleOpenAddCycle}
              onOpenEditCycle={handleOpenEditCycle}
              onSaveCycle={handleSaveCycle}
              onCancelCycle={() => setEditingCycleId(null)}
              onDeleteCycle={handleDeleteCycle}
              onStartNewCycle={handleStartRewatch}
            />

            {/* Personal Notes */}
            <FolioNotes
              notesDraft={notesDraft}
              onNotesChange={handleNotesChange}
              onNotesBlur={handleNotesBlur}
              sectionLabelClass={sectionLabel}
              disabled={isUpdating}
            />

            {/* Quotes & Excerpts */}
            <div className="mt-[var(--za-space-4)]">
              <div className="mb-1.5 flex items-center justify-between">
                <div className={sectionLabel}>
                  <Quote size={12} /> QUOTES & EXCERPTS ({(item.quotes || []).length})
                </div>
                <div className="flex items-center gap-2">
                  {copiedQuoteId && (
                    <span
                      className="font-[var(--za-font-mono)] text-[10px] text-success"
                      role="status"
                    >
                      Copied
                    </span>
                  )}
                  {!editingQuoteId && (
                    <button
                      type="button"
                      onClick={handleOpenAddQuote}
                      className="za-button za-button--tertiary min-h-0 px-0 py-0 text-xs"
                    >
                      + Add Quote
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Quote Add/Edit Form */}
              {editingQuoteId && (
                <div className="mb-3 rounded-control border border-required bg-surface p-3 text-xs">
                  <div className="mb-2 font-[var(--za-weight-emphasis)] text-ink">
                    {editingQuoteId === 'new' ? 'Add Memorable Quote' : 'Edit Quote'}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink-muted">
                        Quote Text *
                      </label>
                      <textarea
                        rows={2}
                        placeholder="“Fear is the mind-killer...”"
                        className="za-field min-h-[4rem] text-xs"
                        value={quoteForm.text}
                        onChange={(e) => setQuoteForm((p) => ({ ...p, text: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] text-ink-muted">
                          Speaker / Character (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Paul Atreides"
                          className="za-field text-xs"
                          value={quoteForm.speaker}
                          onChange={(e) => setQuoteForm((p) => ({ ...p, speaker: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] text-ink-muted">
                          Citation / Page / Timestamp (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Chapter 1, p. 8"
                          className="za-field text-xs"
                          value={quoteForm.citation}
                          onChange={(e) =>
                            setQuoteForm((p) => ({ ...p, citation: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={quoteForm.isFavorite}
                          onChange={(e) =>
                            setQuoteForm((p) => ({ ...p, isFavorite: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 rounded border-decorative"
                        />
                        <span>Favorite Quote</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingQuoteId(null)}
                          className="za-button za-button--secondary px-2.5 py-1 text-xs"
                          disabled={isUpdating}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveQuote}
                          className="za-button za-button--primary px-2.5 py-1 text-xs"
                          disabled={isUpdating || !quoteForm.text.trim()}
                        >
                          Save Quote
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quotes List */}
              {(item.quotes || []).length > 0 ? (
                <div className="space-y-2">
                  {(item.quotes || []).map((q) => (
                    <div
                      key={q.id}
                      className="group relative rounded-control border border-decorative bg-surface-subtle p-3 text-xs transition-colors hover:border-required"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="italic leading-relaxed text-ink">&ldquo;{q.text}&rdquo;</p>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleCopyQuote(q)}
                            title="Copy formatted quote"
                            className="rounded-small border border-decorative bg-surface p-1 text-ink-muted hover:border-required hover:text-ink"
                          >
                            {copiedQuoteId === q.id ? (
                              <Check size={11} className="text-success" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditQuote(q)}
                            title="Edit quote"
                            className="rounded-small border border-decorative bg-surface p-1 text-ink-muted hover:border-required hover:text-ink"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuote(q.id)}
                            title="Delete quote"
                            className="rounded-small border border-decorative bg-surface p-1 text-ink-muted hover:border-danger hover:text-danger"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      {(q.speaker || q.citation) && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                          {q.isFavorite && <Star size={10} className="fill-accent text-accent" />}
                          <span>— {q.speaker || 'Unknown'}</span>
                          {q.citation && <span>· {q.citation}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : !editingQuoteId ? (
                <div className="rounded-control border border-dashed border-decorative p-3 text-center text-xs text-ink-muted">
                  No quotes saved yet. Click &ldquo;+ Add Quote&rdquo; to save memorable lines.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-[var(--za-space-3)] border-t border-decorative bg-surface-subtle px-[var(--za-space-6)] py-[var(--za-space-4)]">
          <button type="button" className="za-button za-button--primary" onClick={handleClose}>
            Done
          </button>
        </div>
      </div>

      <DropReasonModal
        isOpen={isDropReasonOpen}
        itemTitle={item.title}
        initialReason={item.dropReason}
        onConfirm={async (reason) => {
          setIsDropReasonOpen(false);
          const updates = isSelectingDroppedStatus
            ? { status: 'dropped', dropReason: reason }
            : { dropReason: reason };
          setIsSelectingDroppedStatus(false);
          await runUpdate(updates);
        }}
        onCancel={() => {
          setIsSelectingDroppedStatus(false);
          setIsDropReasonOpen(false);
        }}
      />
    </Modal>
  );
}
