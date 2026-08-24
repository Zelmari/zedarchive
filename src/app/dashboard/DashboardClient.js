'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/lib/auth-client';
import ShowCard from './ShowCard';
import BookCard from './BookCard';
import AddMediaModal from './AddMediaModal';
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
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleCreate = async (data) => {
    const newEntry = await createMediaEntry(data);
    if (newEntry) {
      setEntries((prev) => [newEntry, ...prev]);
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
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this item from your archive?')) {
      return;
    }

    const previousEntries = entries;
    setEntries((prev) => prev.filter((item) => item.id !== id));

    try {
      await deleteMediaEntry(id);
    } catch (err) {
      console.error('Failed to delete item:', err);
      // Revert if server call failed
      setEntries(previousEntries);
      alert('Failed to delete item. Please try again.');
    }
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
      {/* Top Navigation */}
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <Link href="/dashboard" className={styles.brandLink}>
            zedarchive
          </Link>
        </div>

        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.name || 'Archive User'}</span>
            <span className={styles.userEmail}>{user?.email}</span>
          </div>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={styles.main}>
        <div className={styles.headerControls}>
          {/* 3 Navigation Tabs */}
          <div className={styles.tabList} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'total'}
              className={`${styles.tabBtn} ${activeTab === 'total' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('total')}
            >
              Total View
              <span className={styles.tabCount}>{entries.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'shows'}
              className={`${styles.tabBtn} ${activeTab === 'shows' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('shows')}
            >
              Shows & Anime
              <span className={styles.tabCount}>{showEntries.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'books'}
              className={`${styles.tabBtn} ${activeTab === 'books' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('books')}
            >
              Books & Manga
              <span className={styles.tabCount}>{bookEntries.length}</span>
            </button>
          </div>

          {/* Action Button */}
          {activeTab !== 'total' && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setIsAddModalOpen(true)}
            >
              + Add {activeTab === 'shows' ? 'Show / Anime' : 'Book / Manga'}
            </button>
          )}
        </div>

        {/* Media Grid */}
        <div className={styles.mediaGrid}>
          {displayedEntries.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                {activeTab === 'shows' ? '🎬' : activeTab === 'books' ? '📖' : '📁'}
              </div>
              <h3 className={styles.emptyTitle}>
                {activeTab === 'shows'
                  ? 'No shows or anime in your archive'
                  : activeTab === 'books'
                  ? 'No books or manga in your archive'
                  : 'Your archive is empty'}
              </h3>
              <p className={styles.emptySubtitle}>
                {activeTab === 'total'
                  ? 'Switch to the Shows or Books tab to start tracking your media.'
                  : `Add your first ${activeTab === 'shows' ? 'show or anime' : 'book or manga'} to begin tracking your progress.`}
              </p>
              {activeTab !== 'total' && (
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => setIsAddModalOpen(true)}
                >
                  + Add {activeTab === 'shows' ? 'Show / Anime' : 'Book / Manga'}
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
                    onDelete={handleDelete}
                  />
                );
              }
              return (
                <ShowCard
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              );
            })
          )}
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
    </div>
  );
}
