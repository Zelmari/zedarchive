'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Layers,
  Tv,
  BookOpen,
  Plus,
  Keyboard,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import ShowCard from './ShowCard';
import BookCard from './BookCard';
import AddMediaModal from './AddMediaModal';
import ConfirmModal from './ConfirmModal';
import ShortcutsModal from './ShortcutsModal';
import ToastContainer from './Toast';
import ThemeToggle from './ThemeToggle';
import {
  createMediaEntry,
  updateMediaProgress,
  deleteMediaEntry,
} from './actions';
import styles from './dashboard.module.css';

export default function DashboardClient({ user, initialEntries = [] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [activeTab, setActiveTab] = useState('total'); // 'total' | 'shows' | 'books'
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  // Helper to check if focus is currently inside an input/textarea/editable
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
      // Cmd + K or Ctrl + K opens Add Media dialog from anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsAddModalOpen(true);
        return;
      }

      // If an input is focused or a modal is open, ignore single-key shortcuts
      if (isInputFocused() || isAddModalOpen || confirmModal.isOpen || isShortcutsModalOpen) {
        return;
      }

      // Single-key tab switching
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

      // Single-key N opens Add modal
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsAddModalOpen(true);
        return;
      }

      // ? or Shift + / opens shortcut cheat sheet
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isAddModalOpen, confirmModal.isOpen, isShortcutsModalOpen]);

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

  const handleUpdate = async (id, updates, callServer = false) => {
    // Optimistic local state update
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
        const previousEntries = entries;
        setEntries((prev) => prev.filter((item) => item.id !== id));

        try {
          await deleteMediaEntry(id);
          addToast(`"${itemTitle}" removed from archive`, 'info');
        } catch (err) {
          console.error('Failed to delete item:', err);
          setEntries(previousEntries);
          addToast('Failed to delete item. Please try again.', 'error');
        }
      },
    });
  };

  // Filter entries according to active tab
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

  let displayedEntries = entries;
  if (activeTab === 'shows') displayedEntries = showEntries;
  if (activeTab === 'books') displayedEntries = bookEntries;

  return (
    <div className={styles.container}>
      {/* ====================================================================
          DESKTOP SIDEBAR
          ==================================================================== */}
      <aside className={styles.sidebar} aria-label="Main Sidebar Navigation">
        <div className={styles.sidebarTop}>
          <div className={styles.brand}>
            <div className={styles.brandLogo}>
              <Sparkles size={18} strokeWidth={2} />
            </div>
            <Link href="/dashboard" className={styles.brandLink}>
              zedarchive
            </Link>
          </div>

          <nav className={styles.navList} role="tablist" aria-label="Archive navigation">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'total'}
              className={`${styles.navItem} ${activeTab === 'total' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('total')}
              title="Total Archive View (Press 1)"
            >
              <div className={styles.navItemLabelGroup}>
                <span className={styles.navItemIcon}>
                  <Layers size={17} strokeWidth={1.75} />
                </span>
                <span>Total View</span>
              </div>
              <div className={styles.navItemMeta}>
                <span className={styles.shortcutBadge}>1</span>
                <span className={styles.countBadge}>{entries.length}</span>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'shows'}
              className={`${styles.navItem} ${activeTab === 'shows' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('shows')}
              title="Shows & Anime View (Press 2)"
            >
              <div className={styles.navItemLabelGroup}>
                <span className={styles.navItemIcon}>
                  <Tv size={17} strokeWidth={1.75} />
                </span>
                <span>Shows & Anime</span>
              </div>
              <div className={styles.navItemMeta}>
                <span className={styles.shortcutBadge}>2</span>
                <span className={styles.countBadge}>{showEntries.length}</span>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'books'}
              className={`${styles.navItem} ${activeTab === 'books' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('books')}
              title="Books & Manga View (Press 3)"
            >
              <div className={styles.navItemLabelGroup}>
                <span className={styles.navItemIcon}>
                  <BookOpen size={17} strokeWidth={1.75} />
                </span>
                <span>Books & Manga</span>
              </div>
              <div className={styles.navItemMeta}>
                <span className={styles.shortcutBadge}>3</span>
                <span className={styles.countBadge}>{bookEntries.length}</span>
              </div>
            </button>
          </nav>

          <button
            type="button"
            className={styles.sidebarAddBtn}
            onClick={() => setIsAddModalOpen(true)}
            title="Add Media to Archive (Press N or ⌘K)"
          >
            <div className={styles.sidebarAddBtnGroup}>
              <Plus size={16} strokeWidth={2.2} />
              <span>Add Media</span>
            </div>
            <span className={styles.sidebarAddBtnBadge}>N</span>
          </button>
        </div>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.shortcutTriggerBtn}
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Keyboard Shortcuts (Press ?)"
            aria-label="Keyboard Shortcuts"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Keyboard size={15} strokeWidth={1.75} />
              <span>Shortcuts</span>
            </div>
            <span className={styles.shortcutBadge}>?</span>
          </button>

          <div className={styles.userCard}>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.name || 'Archive User'}</span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={handleSignOut}
              disabled={isSigningOut}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          MOBILE TOP BAR
          ==================================================================== */}
      <div className={styles.mobileTopBar}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <Sparkles size={16} strokeWidth={2} />
          </div>
          <Link href="/dashboard" className={styles.brandLink}>
            zedarchive
          </Link>
        </div>

        <div className={styles.mobileTopRight}>
          <button
            type="button"
            className={styles.shortcutTriggerBtn}
            style={{ width: 'auto', padding: '0.4rem 0.6rem' }}
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={isSigningOut}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ====================================================================
          MAIN CONTENT AREA
          ==================================================================== */}
      <main className={styles.main}>
        <header className={styles.headerBar}>
          <div className={styles.headerInfo}>
            <h1 className={styles.pageTitle}>
              {activeTab === 'total'
                ? 'Archive Overview'
                : activeTab === 'shows'
                ? 'Shows & Anime'
                : 'Books & Manga'}
            </h1>
            <p className={styles.pageSubtitle}>
              {activeTab === 'total'
                ? `Tracking ${entries.length} media items across shows and reading lists`
                : activeTab === 'shows'
                ? `${showEntries.length} shows & anime in your collection`
                : `${bookEntries.length} books, manga & novels in your collection`}
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerAddBtn}
              onClick={() => setIsAddModalOpen(true)}
              title="Add media (N)"
            >
              <Plus size={16} strokeWidth={2.2} />
              <span>
                Add {activeTab === 'shows' ? 'Show / Anime' : activeTab === 'books' ? 'Book / Manga' : 'Media'}
              </span>
            </button>
          </div>
        </header>

        {/* Media Grid */}
        <div className={styles.mediaGrid}>
          {displayedEntries.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                {activeTab === 'shows' ? (
                  <Tv size={36} strokeWidth={1.75} />
                ) : activeTab === 'books' ? (
                  <BookOpen size={36} strokeWidth={1.75} />
                ) : (
                  <Layers size={36} strokeWidth={1.75} />
                )}
              </div>
              <h3 className={styles.emptyTitle}>
                {activeTab === 'shows'
                  ? 'No shows or anime in archive yet'
                  : activeTab === 'books'
                  ? 'No books or manga in archive yet'
                  : 'Your archive is empty'}
              </h3>
              <p className={styles.emptySubtitle}>
                {activeTab === 'total'
                  ? 'Switch to the Shows or Books tab or press [N] to add your first title.'
                  : `Press [N] or click below to add your first ${activeTab === 'shows' ? 'show or anime' : 'book or manga'}.`}
              </p>
              <button
                type="button"
                className={styles.headerAddBtn}
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus size={16} strokeWidth={2.2} />
                <span>
                  Add {activeTab === 'shows' ? 'Show / Anime' : activeTab === 'books' ? 'Book / Manga' : 'Media'}
                </span>
              </button>
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
                  />
                );
              }
              return (
                <ShowCard
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdate}
                  onDelete={handleDeleteClick}
                />
              );
            })
          )}
        </div>
      </main>

      {/* ====================================================================
          MOBILE FIXED BOTTOM NAV
          ==================================================================== */}
      <nav className={styles.bottomNav} aria-label="Mobile Bottom Navigation">
        <div className={styles.bottomNavList} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'total'}
            className={`${styles.bottomNavItem} ${activeTab === 'total' ? styles.bottomNavItemActive : ''}`}
            onClick={() => setActiveTab('total')}
          >
            <Layers size={18} strokeWidth={activeTab === 'total' ? 2.2 : 1.75} />
            <span>Total ({entries.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shows'}
            className={`${styles.bottomNavItem} ${activeTab === 'shows' ? styles.bottomNavItemActive : ''}`}
            onClick={() => setActiveTab('shows')}
          >
            <Tv size={18} strokeWidth={activeTab === 'shows' ? 2.2 : 1.75} />
            <span>Shows ({showEntries.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'books'}
            className={`${styles.bottomNavItem} ${activeTab === 'books' ? styles.bottomNavItemActive : ''}`}
            onClick={() => setActiveTab('books')}
          >
            <BookOpen size={18} strokeWidth={activeTab === 'books' ? 2.2 : 1.75} />
            <span>Books ({bookEntries.length})</span>
          </button>

          <button
            type="button"
            className={`${styles.bottomNavItem} ${styles.bottomNavAddBtn}`}
            onClick={() => setIsAddModalOpen(true)}
            aria-label="Add Media"
          >
            <div className={styles.bottomNavAddIconWrapper}>
              <Plus size={18} strokeWidth={2.5} />
            </div>
          </button>
        </div>
      </nav>

      {/* Floating Bottom-Right Theme Toggle */}
      <ThemeToggle />

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <AddMediaModal
          isOpen={isAddModalOpen}
          type={activeTab === 'books' ? 'book' : 'show'}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleCreate}
        />
      )}

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

      {/* Floating Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
