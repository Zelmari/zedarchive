'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle, X } from 'lucide-react';
import { signOut } from '@/lib/client/auth-client';
import { dismissVerificationNotice, resendVerificationEmailAction } from '@/server/profile';
import AddMediaModal from '@/components/modals/AddMediaModal';
import MediaDetailModal from '@/components/modals/MediaDetailModal';
import ThemeModal from '@/components/modals/ThemeModal';
import ActivityTimelineModal from '@/components/modals/ActivityTimelineModal';
import ShareProfileModal from '@/components/modals/ShareProfileModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import StatsModal from '@/components/modals/StatsModal';
import DataBackupModal from '@/components/modals/DataBackupModal';
import ReadingGoalModal from '@/components/modals/ReadingGoalModal';
import WeeklyCalendarModal from '@/components/modals/WeeklyCalendarModal';
import CommandPaletteModal from '@/components/modals/CommandPaletteModal';
import ToastContainer, { type Toast } from '@/components/ui/ToastContainer';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardToolbar from '@/components/dashboard/DashboardToolbar';
import MediaGrid from '@/components/dashboard/MediaGrid';
import { useMediaFilters, type DashboardTab } from '@/hooks/use-media-filters';
import { useModalManager } from '@/hooks/use-modal-manager';
import type { MediaEntry, NextAirMap } from '@/types/media';
import type { ReadingGoalConfig, CustomThemePalette, ThemeId } from '@/types/user';
import { applyTheme } from '@/lib/theme';
import { calculateReadingGoalProgress } from '@/lib/stats';
import {
  setReadingGoal as setReadingGoalAction,
  deleteReadingGoal as deleteReadingGoalAction,
} from '@/server/profile';
import {
  getMediaEntries,
  createMediaEntry,
  updateMediaProgress,
  deleteMediaEntry,
} from '@/server/media';
import { offlineAwareMutation } from '@/lib/offline/offlineAwareMutation';

type CardItem = MediaEntry;

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: 'primary' | 'destructive' | 'secondary';
  onConfirm: (() => Promise<void>) | null;
}

const CONFIRM_CLOSED: ConfirmState = {
  isOpen: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'primary',
  onConfirm: null,
};

interface DashboardClientProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    theme?: string | null;
    customTheme?: CustomThemePalette | null;
    username?: string | null;
    isPublic?: boolean;
    bio?: string | null;
    readingGoals?: Record<string, ReadingGoalConfig> | null;
    emailVerified?: boolean;
    verificationDismissedAt?: string | null;
  } | null;
  initialEntries?: MediaEntry[];
  /** Group mode: when set, archive is scoped to groupId and title shows groupName */
  groupId?: string | null;
  groupName?: string | null;
  isGroup?: boolean;
}

export default function DashboardClient({
  user,
  initialEntries = [],
  groupId = null,
  groupName = null,
  isGroup = false,
}: DashboardClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<MediaEntry[]>(initialEntries);
  const [activeTab, setActiveTab] = useState<DashboardTab>('total');
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(
    (user?.theme as ThemeId | null | undefined) || 'parchment',
  );
  const [customTheme, setCustomTheme] = useState<CustomThemePalette | null>(
    user?.customTheme || null,
  );
  const [readingGoals, setReadingGoals] = useState<Record<string, ReadingGoalConfig>>(
    user?.readingGoals || {},
  );
  const [editingItem, setEditingItem] = useState<CardItem | null>(null);
  const [detailItem, setDetailItem] = useState<CardItem | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [verificationDismissed, setVerificationDismissed] = useState(
    Boolean(user?.verificationDismissedAt),
  );
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [nextAirMap, setNextAirMap] = useState<NextAirMap>({});

  const modals = useModalManager();

  // Global Cmd+K / Ctrl+K keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (modals.openModal === 'palette') {
          modals.close();
          return;
        }
        // Don't open command palette if another modal is already open
        if (detailItem || editingItem || confirmModal.isOpen || modals.anyOpen) {
          return;
        }
        modals.open('palette');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailItem, editingItem, confirmModal.isOpen, modals]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filters = useMediaFilters(entries, activeTab);
  const { searchQuery, setSearchQuery, statusFilter, selectedTag, displayedEntries } = filters;

  const closeAddModal = () => {
    modals.close();
    setEditingItem(null);
  };

  // Theme synchronization on mount and when theme changes
  useEffect(() => {
    applyTheme(currentTheme, currentTheme === 'custom' ? customTheme : null);
  }, [currentTheme, customTheme]);

  // Fetch upcoming episode airdates for in-progress and planning shows and anime
  useEffect(() => {
    const tracked = entries.filter(
      (e) =>
        (e.category === 'show' || e.category === 'anime') &&
        (e.status === 'in_progress' || e.status === 'planning' || !e.status) &&
        e.sourceId &&
        /^(tvmaze|anilist|mal)-\d+$/.test(e.sourceId),
    );

    if (tracked.length === 0) return;

    // Batch requests in chunks of 30 items
    const CHUNK_SIZE = 30;
    for (let i = 0; i < tracked.length; i += CHUNK_SIZE) {
      const chunk = tracked.slice(i, i + CHUNK_SIZE);
      const ids = chunk.map((e) => e.sourceId as string);
      const titles = chunk.map((e) => e.title);
      const url = `/api/shows/airdate?ids=${encodeURIComponent(ids.join(','))}&titles=${encodeURIComponent(JSON.stringify(titles))}`;

      fetch(url)
        .then((res) => (res.ok ? res.json() : {}))
        .then((data: NextAirMap) => {
          if (data && typeof data === 'object') {
            setNextAirMap((prev) => ({ ...prev, ...data }));
          }
        })
        .catch((err) => {
          console.warn('[airdate] Fetch failed:', err);
        });
    }
  }, [entries]);

  // Derive active detail item dynamically from latest entries state
  const activeDetailItem = detailItem
    ? entries.find((e) => e.id === detailItem.id) || detailItem
    : null;

  const handleSignOut = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your ZedArchive account?',
      confirmText: 'Sign Out',
      cancelText: 'Stay Logged In',
      variant: 'secondary',
      onConfirm: async () => {
        setIsSigningOut(true);
        try {
          await signOut({
            fetchOptions: {
              onSuccess: () => {
                router.push('/login');
              },
            },
          });
        } catch (error) {
          console.error('Sign out error:', error);
          setIsSigningOut(false);
          addToast('Failed to sign out. Please try again.', 'error');
        }
      },
    });
  };

  // Optimistic UI updates — inject groupId when in group mode
  const withGroup = (payload: Record<string, unknown>) =>
    isGroup && groupId ? { ...payload, groupId } : payload;

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const previousEntries = [...entries];
    const existingItem = entries.find((e) => e.id === id);

    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next: MediaEntry = { ...item, ...updates, updatedAt: new Date().toISOString() };
        if (updates.primaryUnitCurrent !== undefined) {
          if (next.structure && next.structure.length > 0) {
            const seasonObj = next.structure.find((s) => s.number === updates.primaryUnitCurrent);
            next.secondaryUnitTotal = seasonObj?.total ?? null;
          }
        }
        return next;
      }),
    );

    try {
      const updated = await offlineAwareMutation(
        'UPDATE_PROGRESS',
        id,
        withGroup(updates),
        () => updateMediaProgress(id, withGroup(updates)),
        existingItem?.updatedAt,
      );
      if (updated) {
        setEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
      } else {
        addToast('Offline: progress update queued for sync', 'info');
      }
    } catch (err) {
      console.error('Update failed:', err);
      setEntries(previousEntries);
      addToast(
        err instanceof Error && err.message ? err.message : 'Failed to update progress',
        'error',
      );
    }
  };

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const payload = withGroup(data);
      const newEntry = await offlineAwareMutation(
        'CREATE_ENTRY',
        (data.id as string) || crypto.randomUUID(),
        payload,
        () => createMediaEntry(payload),
      );
      if (newEntry) {
        setEntries((prev) => [newEntry, ...prev]);
        addToast(`Added "${newEntry.title}" to ${isGroup ? 'group' : ''} archive`, 'success');
        return newEntry;
      } else {
        addToast('Offline: new title queued for creation', 'info');
        return null as any;
      }
    } catch (err) {
      console.error('Creation failed:', err);
      addToast(
        err instanceof Error && err.message ? err.message : 'Failed to create entry',
        'error',
      );
      throw err;
    }
  };

  const handleSaveEdit = async (id: string, updates: Record<string, unknown>) => {
    const existingItem = entries.find((e) => e.id === id);
    try {
      const payload = withGroup(updates);
      const updated = await offlineAwareMutation(
        'UPDATE_PROGRESS',
        id,
        payload,
        () => updateMediaProgress(id, payload),
        existingItem?.updatedAt,
      );
      if (updated) {
        setEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
        addToast(`Updated "${updated.title}"`, 'success');
      } else {
        addToast('Offline: changes queued for sync', 'info');
      }
      setEditingItem(null);
      return updated;
    } catch (err) {
      console.error('Edit save failed:', err);
      addToast(
        err instanceof Error && err.message ? err.message : 'Failed to save changes',
        'error',
      );
      throw err;
    }
  };

  const handleDeleteClick = (id: string) => {
    const itemToDelete = entries.find((e) => e.id === id);
    const itemTitle = itemToDelete ? itemToDelete.title : 'this item';

    setConfirmModal({
      isOpen: true,
      title: 'Remove Media Entry',
      message: `Are you sure you want to remove "${itemTitle}" from your archive? This action cannot be undone.`,
      confirmText: 'Remove Entry',
      cancelText: 'Keep Entry',
      variant: 'destructive',
      onConfirm: async () => {
        const previousEntries = [...entries];
        setEntries((prev) => prev.filter((item) => item.id !== id));

        try {
          await offlineAwareMutation('DELETE_ENTRY', id, {}, () => deleteMediaEntry(id));
          addToast(`Removed "${itemTitle}" from archive`, 'info');
        } catch (err) {
          console.error('Delete failed:', err);
          setEntries(previousEntries);
          addToast(
            err instanceof Error && err.message ? err.message : 'Failed to delete entry',
            'error',
          );
        }
      },
    });
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || statusFilter !== 'all' || selectedTag !== 'all';
  const tabNoun =
    activeTab === 'total'
      ? null
      : activeTab === 'shows'
        ? 'shows & anime'
        : activeTab === 'movies'
          ? 'movies & films'
          : 'books & manga';

  const cardHandlers = {
    onUpdate: handleUpdate,
    onDelete: handleDeleteClick,
    onEdit: (item: CardItem) => setEditingItem(item),
    onOpenDetail: (itemToOpen: CardItem) => setDetailItem(itemToOpen),
  };

  const handleResendVerification = async () => {
    if (!user?.email) return;
    try {
      setIsSendingVerification(true);
      const res = await resendVerificationEmailAction();
      if (!res.ok) {
        addToast(res.error || 'Failed to send verification email. Try again later.', 'error');
        return;
      }
      addToast('Verification email sent! Please check your inbox.', 'success');
    } catch (err) {
      console.error('Failed to send verification email:', err);
      addToast('Failed to send verification email. Try again later.', 'error');
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleDismissVerification = async () => {
    setVerificationDismissed(true);
    try {
      await dismissVerificationNotice();
    } catch (err) {
      console.error('Failed to dismiss verification notice on server:', err);
    }
  };

  const currentYear = new Date().getFullYear();
  const activeGoal = readingGoals[String(currentYear)] || null;
  const goalProgress = activeGoal ? calculateReadingGoalProgress(entries, activeGoal) : null;

  const handleSaveGoal = async (year: number, annualTarget: number, isPublic: boolean) => {
    await setReadingGoalAction(year, annualTarget, isPublic);
    setReadingGoals((prev) => ({
      ...prev,
      [String(year)]: { year, annualTarget, isPublic },
    }));
    addToast(`Saved ${year} reading challenge (${annualTarget} books)!`, 'success');
  };

  const handleDeleteGoal = async (year: number) => {
    await deleteReadingGoalAction(year);
    setReadingGoals((prev) => {
      const copy = { ...prev };
      delete copy[String(year)];
      return copy;
    });
    addToast(`Removed ${year} reading challenge`, 'info');
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        total={entries.length}
        shows={filters.showEntries.length}
        movies={filters.movieEntries.length}
        books={filters.bookEntries.length}
        userName={user?.name ?? ''}
        username={user?.username ?? null}
        onOpenTheme={() => modals.open('theme')}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
      />

      <main id="main-content" className="flex-1 pb-[var(--za-space-12)] pt-[var(--za-space-6)]">
        <div className="za-container">
          {/* Email verification nudge — hidden in group mode */}
          {!isGroup && user?.emailVerified === false && !verificationDismissed && (
            <div className="mb-[var(--za-space-4)] flex flex-wrap items-center justify-between gap-3 rounded-control border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.12)] px-[var(--za-space-4)] py-[var(--za-space-3)] text-[length:var(--za-text-supporting)] text-[#b45309]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>
                  Your email address is unverified. Verify your email to ensure account recovery.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isSendingVerification}
                  onClick={handleResendVerification}
                  className="cursor-pointer font-[var(--za-weight-emphasis)] underline hover:no-underline disabled:opacity-50"
                >
                  {isSendingVerification ? 'Sending…' : 'Resend link'}
                </button>
                <button
                  type="button"
                  onClick={handleDismissVerification}
                  className="cursor-pointer text-ink-muted hover:text-ink"
                  aria-label="Dismiss verification notice"
                  title="Dismiss notice"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Masthead — group name when in group mode */}
          <div className="mb-[var(--za-space-6)] flex flex-wrap items-end justify-between gap-[var(--za-space-4)] rounded-control border border-required bg-surface px-[var(--za-space-6)] py-[var(--za-space-4)] shadow-raised">
            <div className="flex flex-col gap-[var(--za-space-1)]">
              <h1 className="text-[length:var(--za-text-heading-xl)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] tracking-[-0.025em] text-ink">
                {isGroup && groupName
                  ? groupName
                  : activeTab === 'total'
                    ? 'Your Media Archive'
                    : activeTab === 'shows'
                      ? 'Shows & Anime'
                      : activeTab === 'movies'
                        ? 'Movies & Films'
                        : 'Books & Manga'}
              </h1>
              <p className="text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                {isGroup && groupName
                  ? `Shared archive · ${entries.length} titles · collaborative`
                  : activeTab === 'total'
                    ? `Tracking ${entries.length} items across shows, movies, and books`
                    : `Tracking ${tabNoun} in your collection`}
              </p>
            </div>

            <div className="flex items-center gap-[var(--za-space-3)]">
              <button
                type="button"
                className="za-button za-button--primary"
                onClick={() => modals.open('add')}
                title="Add media"
              >
                <Plus size={16} strokeWidth={2.2} />
                <span>Add {activeTab === 'books' ? 'Book' : 'Media'}</span>
              </button>
            </div>
          </div>

          {/* Reading Goal Banner (shown when on Books tab or when goal exists) */}
          {(activeTab === 'books' || goalProgress) && (
            <div className="mb-[var(--za-space-4)] rounded-control border border-required bg-surface p-4 shadow-raised">
              {goalProgress ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📖</span>
                      <div>
                        <span className="font-[var(--za-weight-heading)] text-sm text-ink">
                          {currentYear} Reading Challenge:
                        </span>
                        <span className="ml-1.5 text-xs text-ink-muted">
                          {goalProgress.completedCount} of {goalProgress.annualTarget} books
                          completed ({goalProgress.percentage}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-small px-2 py-0.5 text-xs font-[var(--za-weight-emphasis)] ${
                          goalProgress.status === 'ahead'
                            ? 'bg-success/15 text-success'
                            : goalProgress.status === 'behind'
                              ? 'bg-[rgba(234,179,8,0.15)] text-[#b45309]'
                              : 'bg-surface-subtle text-ink-muted'
                        }`}
                      >
                        {goalProgress.status === 'ahead'
                          ? `✦ ${goalProgress.paceDiff} ${goalProgress.paceDiff === 1 ? 'book' : 'books'} ahead of schedule!`
                          : goalProgress.status === 'behind'
                            ? `○ ${Math.abs(goalProgress.paceDiff)} ${Math.abs(goalProgress.paceDiff) === 1 ? 'book' : 'books'} behind pace`
                            : '✓ Right on track!'}
                      </span>
                      <button
                        type="button"
                        onClick={() => modals.open('goal')}
                        className="za-button za-button--secondary px-2 py-1 text-xs"
                      >
                        Edit Goal
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className="h-full bg-accent transition-[width] duration-300"
                      style={{ width: `${goalProgress.percentage}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="text-base">📖</span>
                    <span>Set your {currentYear} Reading Challenge to track targets & pacing!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => modals.open('goal')}
                    className="za-button za-button--secondary px-2.5 py-1 text-xs font-[var(--za-weight-emphasis)] text-accent"
                  >
                    Set Reading Goal
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Controls toolbar */}
          <DashboardToolbar
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={filters.sortBy}
            onSortChange={filters.setSortBy}
            statusFilter={statusFilter}
            onStatusFilterChange={filters.setStatusFilter}
            selectedTag={selectedTag}
            onTagChange={filters.setSelectedTag}
            tags={filters.allTags}
            counts={filters.counts}
            onOpenModal={(m) => modals.open(m)}
          />

          {/* Media grid */}
          <div className="grid grid-cols-1 gap-[var(--za-space-6)] md:grid-cols-2 lg:grid-cols-3">
            <MediaGrid
              entries={displayedEntries}
              activeTab={activeTab}
              hasActiveFilters={hasActiveFilters}
              onAddClick={() => modals.open('add')}
              nextAirMap={nextAirMap}
              {...cardHandlers}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      <AddMediaModal
        isOpen={modals.isOpen('add') || !!editingItem}
        type={
          editingItem?.category
            ? (editingItem.category as import('@/types/media').MediaCategory)
            : activeTab === 'books'
              ? 'book'
              : activeTab === 'movies'
                ? 'movie'
                : 'show'
        }
        onClose={closeAddModal}
        onAdd={handleCreate}
        editItem={editingItem}
        onSave={handleSaveEdit}
      />

      <MediaDetailModal
        isOpen={!!activeDetailItem}
        item={activeDetailItem}
        onClose={() => setDetailItem(null)}
        onUpdate={handleUpdate}
        onEdit={(itemToEdit: CardItem) => {
          setDetailItem(null);
          setEditingItem(itemToEdit);
        }}
      />

      <ThemeModal
        isOpen={modals.isOpen('theme')}
        onClose={modals.close}
        currentTheme={currentTheme}
        customTheme={customTheme}
        onThemeChange={(newTheme, nextCustomTheme) => {
          setCurrentTheme(newTheme);
          if (nextCustomTheme) {
            setCustomTheme(nextCustomTheme);
          }
        }}
      />

      <ActivityTimelineModal isOpen={modals.isOpen('activity')} onClose={modals.close} />

      <ShareProfileModal
        isOpen={modals.isOpen('share')}
        onClose={modals.close}
        onToast={addToast}
      />

      <StatsModal isOpen={modals.isOpen('stats')} onClose={modals.close} entries={entries} />

      <DataBackupModal
        isOpen={modals.isOpen('data')}
        onClose={modals.close}
        entries={entries}
        onImportSuccess={async () => {
          try {
            const fresh = await getMediaEntries();
            setEntries(fresh);
            addToast('Archive refreshed with imported items', 'success');
          } catch (e) {
            console.error('Failed to reload entries:', e);
          }
        }}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        variant={confirmModal.variant}
        onConfirm={() => confirmModal.onConfirm?.().finally(() => setConfirmModal(CONFIRM_CLOSED))}
        onCancel={() => setConfirmModal(CONFIRM_CLOSED)}
      />

      <ReadingGoalModal
        isOpen={modals.isOpen('goal')}
        year={currentYear}
        currentGoal={activeGoal}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
        onClose={modals.close}
      />

      <WeeklyCalendarModal
        isOpen={modals.isOpen('calendar')}
        onClose={modals.close}
        entries={entries}
        nextAirMap={nextAirMap}
        onUpdateProgress={handleUpdate}
        onOpenDetail={(item) => setDetailItem(item)}
      />

      <CommandPaletteModal
        isOpen={modals.isOpen('palette')}
        onClose={modals.close}
        entries={entries}
        onOpenAddModal={() => modals.open('add')}
        onOpenStatsModal={() => modals.open('stats')}
        onOpenThemeModal={() => modals.open('theme')}
        onSelectEntry={(item) => setDetailItem(item)}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
