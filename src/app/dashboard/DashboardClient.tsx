'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Layers, Tv, BookOpen, Plus, AlertTriangle, X } from 'lucide-react';
import { signOut, authClient } from '@/lib/auth-client';
import { dismissVerificationNotice, resendVerificationEmailAction } from '@/server/profile';
import MediaCard from '@/components/cards/MediaCard';
import AddMediaModal from './AddMediaModal';
import MediaDetailModal from './MediaDetailModal';
import ThemeModal from './ThemeModal';
import ActivityTimelineModal from './ActivityTimelineModal';
import ShareProfileModal from './ShareProfileModal';
import ConfirmModal from './ConfirmModal';
import ShortcutsModal from './ShortcutsModal';
import StatsModal from './StatsModal';
import DataBackupModal from './DataBackupModal';
import ToastContainer from '@/components/ui/Toast';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardToolbar from '@/components/dashboard/DashboardToolbar';
import MediaGrid from '@/components/dashboard/MediaGrid';
import { useMediaFilters, useModalManager, type DashboardTab } from '@/components/dashboard/hooks';
import type { Toast } from '@/components/ui/Toast';
import type { MediaEntry, NextAirMap } from '@/types/media';
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

function isInputFocused(): boolean {
  const activeEl = document.activeElement as HTMLElement | null;
  if (!activeEl) return false;
  const tag = activeEl.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl.isContentEditable;
}

interface DashboardClientProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    theme?: string | null;
    username?: string | null;
    isPublic?: boolean;
    bio?: string | null;
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
  const [editingItem, setEditingItem] = useState<CardItem | null>(null);
  const [detailItem, setDetailItem] = useState<CardItem | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(CONFIRM_CLOSED);
  const [verificationDismissed, setVerificationDismissed] = useState(
    Boolean(user?.verificationDismissedAt),
  );
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [nextAirMap, setNextAirMap] = useState<NextAirMap>({});

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
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', currentTheme);
      try {
        localStorage.setItem('za-theme', currentTheme);
      } catch {
        // Storage unavailable (private mode etc.) — attribute is still set above.
      }
    }
  }, [currentTheme]);

  // Fetch upcoming episode airdates for in-progress shows
  useEffect(() => {
    const showSourceIds = entries
      .filter(
        (e) =>
          (e.category === 'show' || e.category === 'anime') &&
          (e.status === 'in_progress' || !e.status) &&
          e.sourceId &&
          e.sourceId.startsWith('tvmaze-'),
      )
      .map((e) => e.sourceId as string)
      .slice(0, 20);

    if (showSourceIds.length === 0) return;

    const url = `/api/shows/airdate?ids=${encodeURIComponent(showSourceIds.join(','))}`;
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        modals.open('add');
        return;
      }

      if (
        e.key === '/' &&
        !isInputFocused() &&
        !modals.anyOpen &&
        !editingItem &&
        !detailItem &&
        !confirmModal.isOpen
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isInputFocused() || modals.anyOpen || editingItem || detailItem || confirmModal.isOpen) {
        return;
      }

      switch (e.key) {
        case '1':
          e.preventDefault();
          setActiveTab('total');
          return;
        case '2':
          e.preventDefault();
          setActiveTab('shows');
          return;
        case '3':
          e.preventDefault();
          setActiveTab('books');
          return;
        case 'n':
        case 'N':
          e.preventDefault();
          modals.open('add');
          return;
        case '?':
          e.preventDefault();
          modals.open('shortcuts');
          return;
        case 's':
        case 'S':
          e.preventDefault();
          modals.open('stats');
          return;
        case 'b':
        case 'B':
          e.preventDefault();
          modals.open('data');
          return;
        case 't':
        case 'T':
          e.preventDefault();
          modals.open('theme');
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modals.anyOpen, editingItem, detailItem, confirmModal.isOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- modals object identity changes each render

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
        if (
          updates.primaryUnitCurrent !== undefined &&
          next.structure &&
          next.structure.length > 0
        ) {
          const seasonObj = next.structure.find((s) => s.number === updates.primaryUnitCurrent);
          if (seasonObj && seasonObj.total) {
            next.secondaryUnitTotal = seasonObj.total;
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
    activeTab === 'total' ? null : activeTab === 'shows' ? 'shows & anime' : 'books & manga';

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

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        total={entries.length}
        shows={filters.showEntries.length}
        books={filters.bookEntries.length}
        userName={user?.name ?? ''}
        onOpenTheme={() => modals.open('theme')}
        onOpenShortcuts={() => modals.open('shortcuts')}
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
                    : 'Books & Manga'}
              </h1>
              <p className="text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                {activeTab === 'total'
                  ? `Tracking ${entries.length} items across shows and reading lists`
                  : `Tracking ${tabNoun} in your collection`}
              </p>
            </div>

            <div className="flex items-center gap-[var(--za-space-3)]">
              <button
                type="button"
                className="za-button za-button--primary"
                onClick={() => modals.open('add')}
                title="Add media (Press N or ⌘K)"
              >
                <Plus size={16} strokeWidth={2.2} />
                <span>Add {activeTab === 'books' ? 'Book' : 'Media'}</span>
              </button>
            </div>
          </div>

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
          editingItem?.category === 'book' || editingItem?.category === 'manga'
            ? 'book'
            : activeTab === 'books'
              ? 'book'
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

      <ShortcutsModal isOpen={modals.isOpen('shortcuts')} onClose={modals.close} />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

// Re-exported for convenience in tests/storyless contexts.
export { MediaCard };
