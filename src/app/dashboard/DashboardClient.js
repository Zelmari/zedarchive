'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Layers,
  Tv,
  BookOpen,
  Plus,
  Keyboard,
  LogOut,
  Search,
  BarChart2,
  Database,
  ArrowUpDown,
} from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import ShowCard from './ShowCard';
import BookCard from './BookCard';
import AddMediaModal from './AddMediaModal';
import ConfirmModal from './ConfirmModal';
import ShortcutsModal from './ShortcutsModal';
import StatsModal from './StatsModal';
import DataBackupModal from './DataBackupModal';
import ToastContainer from './Toast';
import {
  getMediaEntries,
  createMediaEntry,
  updateMediaProgress,
  deleteMediaEntry,
} from './actions';
import styles from './dashboard.module.css';

export default function DashboardClient({ user, initialEntries = [] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [activeTab, setActiveTab] = useState('total'); // 'total' | 'shows' | 'books'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_progress' | 'completed' | 'planning' | 'on_hold' | 'dropped'
  const [sortBy, setSortBy] = useState('updated_desc'); // 'updated_desc' | 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc' | 'progress_desc' | 'rating_desc'

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const searchInputRef = useRef(null);

  // Custom Toast State
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Custom Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'primary',
    onConfirm: null,
  });

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Helper to check if focus is inside input
  const isInputFocused = () => {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    const tag = activeEl.tagName?.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      activeEl.isContentEditable
    );
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsAddModalOpen(true);
        return;
      }

      if (e.key === '/' && !isInputFocused() && !isAddModalOpen && !editingItem && !confirmModal.isOpen && !isShortcutsModalOpen && !isStatsModalOpen && !isDataModalOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isInputFocused() || isAddModalOpen || editingItem || confirmModal.isOpen || isShortcutsModalOpen || isStatsModalOpen || isDataModalOpen) {
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        setActiveTab('total');
        return;
      }

      if (e.key === '2') {
        e.preventDefault();
        setActiveTab('shows');
        return;
      }

      if (e.key === '3') {
        e.preventDefault();
        setActiveTab('books');
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsAddModalOpen(true);
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isAddModalOpen, editingItem, confirmModal.isOpen, isShortcutsModalOpen, isStatsModalOpen, isDataModalOpen]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
      addToast('Failed to sign out', 'error');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleCreate = async (data) => {
    try {
      const newEntry = await createMediaEntry(data);
      if (newEntry) {
        setEntries((prev) => [newEntry, ...prev]);
        addToast(`"${newEntry.title}" added to your archive`, 'success');
      }
    } catch (err) {
      console.error('Create entry error:', err);
      addToast(err.message || 'Failed to create entry', 'error');
    }
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
  };

  const handleSaveEdit = async (id, data) => {
    const previousEntry = entries.find((item) => item.id === id);

    setEntries((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...data,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    try {
      const updated = await updateMediaProgress(id, data);
      if (updated) {
        setEntries((prev) =>
          prev.map((item) => (item.id === id ? updated : item))
        );
        addToast(`"${updated.title}" updated`, 'success');
      }
    } catch (err) {
      console.error('Failed to update entry:', err);
      setEntries((prev) =>
        prev.map((item) => (item.id === id && previousEntry ? previousEntry : item))
      );
      addToast(err.message || 'Failed to update entry', 'error');
    }
  };

  const handleUpdate = async (id, updates, callServer = false) => {
    const previousEntry = entries.find((item) => item.id === id);

    setEntries((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    if (callServer) {
      try {
        await updateMediaProgress(id, updates);
      } catch (err) {
        console.error('Failed to sync update with server:', err);
        setEntries((prev) =>
          prev.map((item) => (item.id === id && previousEntry ? previousEntry : item))
        );
        addToast('Failed to sync update with server', 'error');
      }
    }
  };

  const handleDeleteClick = (id) => {
    const itemToDelete = entries.find((item) => item.id === id);
    const itemTitle = itemToDelete ? itemToDelete.title : 'this item';

    setConfirmModal({
      isOpen: true,
      title: 'Remove from Archive',
      message: `Are you sure you want to remove "${itemTitle}" from your archive? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        closeConfirmModal();
        const previousIndex = entries.findIndex((item) => item.id === id);
        const previousEntry = entries[previousIndex];
        setEntries((prev) => prev.filter((item) => item.id !== id));

        try {
          await deleteMediaEntry(id);
          addToast(`"${itemTitle}" removed from archive`, 'info');
        } catch (err) {
          console.error('Failed to delete item:', err);
          setEntries((prev) => {
            const next = prev.filter((item) => item.id !== id);
            next.splice(Math.min(previousIndex, next.length), 0, previousEntry);
            return next;
          });
          addToast('Failed to delete item. Please try again.', 'error');
        }
      },
    });
  };

  const showEntries = entries.filter(
    (item) => item.category === 'show' || item.category === 'anime' || item.type === 'show'
  );
  const bookEntries = entries.filter(
    (item) =>
      item.category === 'book' ||
      item.category === 'manga' ||
      item.type === 'book' ||
      item.type === 'novel'
  );

  const baseCategoryEntries = entries.filter((item) => {
    const isBook = item.category === 'book' || item.category === 'manga' || item.type === 'book' || item.type === 'novel';
    if (activeTab === 'shows') return !isBook;
    if (activeTab === 'books') return isBook;
    return true;
  });

  const countAll = baseCategoryEntries.length;
  const countInProgress = baseCategoryEntries.filter((e) => !e.status || e.status === 'in_progress').length;
  const countCompleted = baseCategoryEntries.filter((e) => e.status === 'completed').length;
  const countPlanning = baseCategoryEntries.filter((e) => e.status === 'planning').length;
  const countOnHold = baseCategoryEntries.filter((e) => e.status === 'on_hold').length;
  const countDropped = baseCategoryEntries.filter((e) => e.status === 'dropped').length;

  const filteredEntries = baseCategoryEntries.filter((item) => {
    // Status filter
    if (statusFilter !== 'all') {
      const itemStatus = item.status || 'in_progress';
      if (itemStatus !== statusFilter) return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = item.title?.toLowerCase().includes(q);
      const notesMatch = item.notes?.toLowerCase().includes(q);
      if (!titleMatch && !notesMatch) return false;
    }

    return true;
  });

  // Sorting
  const displayedEntries = [...filteredEntries].sort((a, b) => {
    switch (sortBy) {
      case 'title_asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'title_desc':
        return (b.title || '').localeCompare(a.title || '');
      case 'created_desc':
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      case 'created_asc':
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      case 'rating_desc':
        return (b.rating || 0) - (a.rating || 0);
      case 'progress_desc': {
        const pA = a.secondaryUnitTotal ? (a.secondaryUnitCurrent || 0) / a.secondaryUnitTotal : 0;
        const pB = b.secondaryUnitTotal ? (b.secondaryUnitCurrent || 0) / b.secondaryUnitTotal : 0;
        return pB - pA;
      }
      case 'updated_desc':
      default:
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }
  });

  return (
    <div className={styles.dashboardContainer}>
      {/* Site Header with Logo and Wordmark */}
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <Link href="/dashboard" className="za-wordmark za-link za-site-header__brand">
            <Image
              alt=""
              aria-hidden="true"
              className="za-wordmark__mark"
              height={48}
              src="/zedarchivelogo.png"
              width={72}
              unoptimized
            />
            <span className="za-wordmark__text">zedarchive</span>
          </Link>

          <nav aria-label="Primary" className="za-site-header__nav">
            <button
              type="button"
              className={`za-button ${activeTab === 'total' ? 'za-button--selected za-current-page' : 'za-button--secondary'}`}
              onClick={() => setActiveTab('total')}
              title="Total Archive View (Press 1)"
            >
              <Layers size={16} strokeWidth={1.75} />
              <span>Total ({entries.length})</span>
            </button>

            <button
              type="button"
              className={`za-button ${activeTab === 'shows' ? 'za-button--selected za-current-page' : 'za-button--secondary'}`}
              onClick={() => setActiveTab('shows')}
              title="Shows & Anime View (Press 2)"
            >
              <Tv size={16} strokeWidth={1.75} />
              <span>Shows ({showEntries.length})</span>
            </button>

            <button
              type="button"
              className={`za-button ${activeTab === 'books' ? 'za-button--selected za-current-page' : 'za-button--secondary'}`}
              onClick={() => setActiveTab('books')}
              title="Books & Manga View (Press 3)"
            >
              <BookOpen size={16} strokeWidth={1.75} />
              <span>Books ({bookEntries.length})</span>
            </button>
          </nav>

          <nav aria-label="Account" className="za-site-header__nav">
            <button
              type="button"
              className="za-button za-button--tertiary"
              onClick={() => setIsShortcutsModalOpen(true)}
              title="Keyboard shortcuts (Press ?)"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard size={16} strokeWidth={1.75} />
              <span className={styles.desktopOnly}>Shortcuts</span>
            </button>

            <span className="za-site-header__identity" style={{ fontSize: 'var(--za-text-supporting)', fontWeight: 'var(--za-weight-heading)' }}>
              @{user?.name?.toLowerCase()?.replace(/\s+/g, '') || 'user'}
            </span>

            <button
              type="button"
              className="za-button za-button--secondary"
              onClick={handleSignOut}
              disabled={isSigningOut}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={15} strokeWidth={1.75} />
              <span className={styles.desktopOnly}>Sign out</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className={styles.mainArea}>
        <div className="za-container">
          <div className={styles.pageMasthead}>
            <div className={styles.mastheadText}>
              <h1 className={styles.mastheadTitle}>
                {activeTab === 'total'
                  ? 'Your Media Archive'
                  : activeTab === 'shows'
                  ? 'Shows & Anime'
                  : 'Books & Manga'}
              </h1>
              <p className={styles.mastheadSubtitle}>
                {activeTab === 'total'
                  ? `Tracking ${entries.length} items across shows and reading lists`
                  : activeTab === 'shows'
                  ? `${showEntries.length} shows & anime in your collection`
                  : `${bookEntries.length} books and manga titles`}
              </p>
            </div>

            <div className={styles.mastheadActions}>
              <button
                type="button"
                className="za-button za-button--primary"
                onClick={() => setIsAddModalOpen(true)}
                title="Add media (Press N or ⌘K)"
              >
                <Plus size={16} strokeWidth={2.2} />
                <span>
                  Add {activeTab === 'shows' ? 'Show' : activeTab === 'books' ? 'Book' : 'Media'}
                </span>
              </button>
            </div>
          </div>

          {/* Dashboard Controls Toolbar (Search, Filter, Sort, Stats & Backup) */}
          <div className={styles.dashboardControlsBar}>
            <div className={styles.toolbarTopRow}>
              <div className={styles.searchAndSortGroup}>
                <div className={styles.archiveSearchWrapper}>
                  <Search size={14} className={styles.searchIconInside} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className={styles.archiveSearchInput}
                    placeholder="Search archive or notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search archive"
                  />
                  {!searchQuery && <span className={styles.searchKbdHint}>/</span>}
                </div>

                <select
                  className={styles.sortDropdownSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort archive"
                >
                  <option value="updated_desc">Recently Updated</option>
                  <option value="created_desc">Date Added (Newest)</option>
                  <option value="created_asc">Date Added (Oldest)</option>
                  <option value="title_asc">Title (A → Z)</option>
                  <option value="title_desc">Title (Z → A)</option>
                  <option value="progress_desc">Progress %</option>
                  <option value="rating_desc">Highest Rated</option>
                </select>
              </div>

              <div className={styles.toolbarActionsGroup}>
                <button
                  type="button"
                  className="za-button za-button--secondary"
                  onClick={() => setIsStatsModalOpen(true)}
                  title="View Archive Statistics"
                >
                  <BarChart2 size={15} strokeWidth={1.75} />
                  <span>Stats</span>
                </button>

                <button
                  type="button"
                  className="za-button za-button--secondary"
                  onClick={() => setIsDataModalOpen(true)}
                  title="Export or Import Backups"
                >
                  <Database size={15} strokeWidth={1.75} />
                  <span>Backup & Import</span>
                </button>
              </div>
            </div>

            {/* Status Filter Pills */}
            <div className={styles.statusFilterPills} role="radiogroup" aria-label="Status filter">
              {[
                { id: 'all', label: `All (${countAll})` },
                { id: 'in_progress', label: `In Progress (${countInProgress})` },
                { id: 'completed', label: `Completed (${countCompleted})` },
                { id: 'planning', label: `Planning (${countPlanning})` },
                { id: 'on_hold', label: `On Hold (${countOnHold})` },
                { id: 'dropped', label: `Dropped (${countDropped})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === pill.id}
                  className={`${styles.statusPillBtn} ${statusFilter === pill.id ? styles.statusPillActive : ''}`}
                  onClick={() => setStatusFilter(pill.id)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Media Grid */}
          <div className={styles.mediaGrid}>
            {displayedEntries.length === 0 ? (
              <div className={`za-card ${styles.emptyCard}`}>
                <div className={styles.emptyIconWrapper}>
                  {activeTab === 'shows' ? (
                    <Tv size={36} strokeWidth={1.5} />
                  ) : activeTab === 'books' ? (
                    <BookOpen size={36} strokeWidth={1.5} />
                  ) : (
                    <Layers size={36} strokeWidth={1.5} />
                  )}
                </div>
                <h2 className={styles.emptyTitle}>
                  {searchQuery || statusFilter !== 'all'
                    ? 'No matching entries found'
                    : activeTab === 'shows'
                    ? 'No shows or anime in your archive yet'
                    : activeTab === 'books'
                    ? 'No books or manga in your archive yet'
                    : 'Your archive is currently empty'}
                </h2>
                <p className={styles.emptySubtitle}>
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search terms or status filter.'
                    : activeTab === 'total'
                    ? 'Press [N] or click below to catalog your first media title.'
                    : `Press [N] or click below to add your first ${activeTab === 'shows' ? 'show' : 'book'}.`}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <button
                    type="button"
                    className="za-button za-button--primary"
                    onClick={() => setIsAddModalOpen(true)}
                  >
                    <Plus size={16} strokeWidth={2.2} />
                    <span>Add New Title</span>
                  </button>
                )}
              </div>
            ) : (
              displayedEntries.map((item) => {
                const isBookType =
                  item.category === 'book' ||
                  item.category === 'manga' ||
                  item.type === 'book' ||
                  item.type === 'novel';

                if (isBookType) {
                  return (
                    <BookCard
                      key={item.id}
                      item={item}
                      onUpdate={handleUpdate}
                      onDelete={handleDeleteClick}
                      onEdit={handleEditClick}
                    />
                  );
                }
                return (
                  <ShowCard
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdate}
                    onDelete={handleDeleteClick}
                    onEdit={handleEditClick}
                  />
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Add / Edit Item Modal */}
      <AddMediaModal
        isOpen={isAddModalOpen || !!editingItem}
        type={editingItem?.category === 'book' || editingItem?.category === 'manga' ? 'book' : activeTab === 'books' ? 'book' : 'show'}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
        }}
        onAdd={handleCreate}
        editItem={editingItem}
        onSave={handleSaveEdit}
      />

      {/* Archive Stats Modal */}
      <StatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        entries={entries}
      />

      {/* Data Backup & Import Modal */}
      <DataBackupModal
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
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

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {/* Floating Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
