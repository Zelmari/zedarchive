'use client';

import { useState, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import ShowCard from './ShowCard';
import BookCard from './BookCard';
import AddMediaModal from './AddMediaModal';
import ConfirmModal from './ConfirmModal';
import ShortcutsModal from './ShortcutsModal';
import ToastContainer from './Toast';
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

      if (isInputFocused() || isAddModalOpen || confirmModal.isOpen || isShortcutsModalOpen) {
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
                  {activeTab === 'shows'
                    ? 'No shows or anime in your archive yet'
                    : activeTab === 'books'
                    ? 'No books or manga in your archive yet'
                    : 'Your archive is currently empty'}
                </h2>
                <p className={styles.emptySubtitle}>
                  {activeTab === 'total'
                    ? 'Press [N] or click below to catalog your first media title.'
                    : `Press [N] or click below to add your first ${activeTab === 'shows' ? 'show' : 'book'}.`}
                </p>
                <button
                  type="button"
                  className="za-button za-button--primary"
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Plus size={16} strokeWidth={2.2} />
                  <span>Add New Title</span>
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
        </div>
      </main>

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

      {/* Floating Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
