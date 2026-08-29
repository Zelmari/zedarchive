'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Layers, Tv, BookOpen, Plus, AlertTriangle, X } from 'lucide-react';
import { signOut, authClient } from '@/lib/client/auth-client';
import { dismissVerificationNotice, resendVerificationEmailAction } from '@/server/profile';
import MediaCard from '@/components/cards/MediaCard';
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
import type { ReadingGoalConfig, CustomThemePalette } from '@/types/user';
import { applyCustomThemeTokens } from '@/lib/theme';
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
}

export default function DashboardClient({ user, initialEntries = [] }: DashboardClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<MediaEntry[]>(initialEntries);
  const [activeTab, setActiveTab] = useState<DashboardTab>('total');
  const [currentTheme, setCurrentTheme] = useState(user?.theme || 'parchment');
  const [readingGoals, setReadingGoals] = useState<Record<string, ReadingGoalConfig>>(
    user?.readingGoals || {},
  );
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CardItem | null>(null);
  const [detailItem, setDetailItem] = useState<CardItem | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [verificationDismissed, setVerificationDismissed] = useState(
    Boolean(user?.verificationDismissedAt),
  );
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [nextAirMap, setNextAirMap] = useState<NextAirMap>({});
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Cmd+K / Ctrl+K keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const modals = useModalManager();
  const filters = useMediaFilters(entries, activeTab);
  const { searchQuery, setSearchQuery, statusFilter, selectedTag, displayedEntries, counts } =
    filters;

  const closeAddModal = () => {
    modals.close();
    setEditingItem(null);
  };

  // Theme synchronization on mount and when theme changes
  useEffect(() => {
    if (currentTheme === 'custom' && user?.customTheme) {
      applyCustomThemeTokens(user.customTheme);
    } else if (typeof document !== 'undefined') {
      applyCustomThemeTokens(null);
      document.documentElement.setAttribute('data-theme', currentTheme);
      try {
        localStorage.setItem('za-theme', currentTheme);
      } catch {
        // Storage unavailable (private mode etc.) — attribute is still set above.
      }
    }
  }, [currentTheme, user?.customTheme]);

  // Fetch upcoming episode airdates for in-progress shows and anime
  useEffect(() => {
    const tracked = entries
      .filter(
        (e) =>
          (e.category === 'show' || e.category === 'anime') &&
          (e.status === 'in_progress' || !e.status) &&
          e.sourceId &&
          /^(tvmaze|anilist|mal)-\d+$/.test(e.sourceId),
      )
      .slice(0, 20);

    if (tracked.length === 0) return;

    const ids = tracked.map((e) => e.sourceId as string);
    const titles = tracked.map((e) => e.title);
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

  // Optimistic UI updates
  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const previousEntries = [...entries];

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
      const updated = await updateMediaProgress(id, updates);
      setEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
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
      const newEntry = await createMediaEntry(data);
      setEntries((prev) => [newEntry, ...prev]);
      addToast(`Added "${newEntry.title}" to archive`, 'success');
      return newEntry;
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
    try {
      const updated = await updateMediaProgress(id, updates);
      setEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
      setEditingItem(null);
      addToast(`Updated "${updated.title}"`, 'success');
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
          await deleteMediaEntry(id);
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
          {/* Email verification nudge */}
          {user?.emailVerified === false && !verificationDismissed && (
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

          {/* Masthead */}
          <div className="mb-[var(--za-space-6)] flex flex-wrap items-end justify-between gap-[var(--za-space-4)] rounded-control border border-required bg-surface px-[var(--za-space-6)] py-[var(--za-space-4)] shadow-raised">
            <div className="flex flex-col gap-[var(--za-space-1)]">
              <h1 className="text-[length:var(--za-text-heading-xl)] font-[var(--za-weight-heading)] leading-[var(--za-leading-compact)] tracking-[-0.025em] text-ink">
                {activeTab === 'total'
                  ? 'Your Media Archive'
                  : activeTab === 'shows'
                    ? 'Shows & Anime'
                    : activeTab === 'movies'
                      ? 'Movies & Films'
                      : 'Books & Manga'}
              </h1>
              <p className="text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                {activeTab === 'total'
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
                        onClick={() => setIsGoalModalOpen(true)}
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
                    onClick={() => setIsGoalModalOpen(true)}
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
            counts={{
              all: counts.all,
              in_progress: counts.in_progress,
              completed: counts.completed,
              planning: counts.planning,
              on_hold: counts.on_hold,
              dropped: counts.dropped,
            }}
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
        customTheme={user?.customTheme}
        onThemeChange={(newTheme: string) => setCurrentTheme(newTheme)}
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
        isOpen={isGoalModalOpen}
        year={currentYear}
        currentGoal={activeGoal}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
        onClose={() => setIsGoalModalOpen(false)}
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
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
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
