'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Shield,
  Trash2,
  Check,
  AlertTriangle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import type { UserProfile, ThemeId } from '@/types/user';
import { MAX_NAME_LENGTH } from '@/lib/constants';
import { updateUserProfile, updateUserTheme } from '@/server/profile';
import { deleteAccount } from '@/server/account';
import { signOut } from '@/lib/auth-client';
import Modal from '@/components/ui/Modal';

interface SettingsClientProps {
  profile: UserProfile;
}

const THEMES: Array<{ id: ThemeId; label: string; bg: string; text: string }> = [
  { id: 'parchment', label: 'Parchment', bg: '#f7f5f0', text: '#242321' },
  { id: 'midnight', label: 'Midnight Slate', bg: '#121316', text: '#ededed' },
  { id: 'sepia', label: 'Vintage Sepia', bg: '#f4ebd9', text: '#382b1d' },
  { id: 'e-ink', label: 'E-Ink', bg: '#ffffff', text: '#000000' },
  { id: 'cyber', label: 'Phosphor Cyber', bg: '#090e09', text: '#22c55e' },
];

export default function SettingsClient({ profile }: SettingsClientProps) {
  const router = useRouter();

  // Profile Form State
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [isPublic, setIsPublic] = useState(Boolean(profile.isPublic));
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(profile.theme || 'parchment');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Delete Account Modal & State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess(false);

    try {
      await updateUserProfile({
        name,
        username: username.trim() || null,
        bio: bio.trim() || null,
        isPublic,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleThemeChange = async (themeId: ThemeId) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    try {
      localStorage.setItem('za-theme', themeId);
      await updateUserTheme(themeId);
    } catch (err) {
      console.warn('Failed to save theme preference:', err);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeleting(true);
    setDeleteError('');

    try {
      const res = await deleteAccount({
        password: deletePassword,
      });

      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete account.');
        setIsDeleting(false);
        return;
      }

      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-required bg-surface shadow-raised">
        <div className="za-container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="za-button za-button--secondary p-2 text-xs font-[var(--za-weight-heading)]"
            >
              <ArrowLeft size={14} className="mr-1" />
              <span>Dashboard</span>
            </Link>
            <h1 className="text-base font-[var(--za-weight-heading)] tracking-[-0.02em] text-ink">
              Settings & Account
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="pb-16 pt-8">
        <div className="za-container max-w-[42rem] space-y-8">
          {/* Profile Section */}
          <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
            <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
              <User size={18} className="text-ink-muted" />
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
                Profile Information
              </h2>
            </div>

            {profileSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-control bg-[rgba(46,125,50,0.1)] p-3 text-xs text-[#2e7d32]">
                <Check size={14} />
                <span>Profile changes saved successfully!</span>
              </div>
            )}

            {profileError && (
              <div className="mb-4 flex items-center gap-2 rounded-control bg-red-50 p-3 text-xs text-red-600">
                <AlertTriangle size={14} />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={MAX_NAME_LENGTH}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="za-field w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink">
                  Username (Handle)
                </label>
                <input
                  type="text"
                  placeholder="e.g. zelmari"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="za-field w-full"
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Used for your public archive URL at{' '}
                  <span className="font-mono">/u/{username || 'username'}</span>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink">
                  Bio / Description
                </label>
                <textarea
                  rows={2}
                  maxLength={160}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Brief note about your tastes or reading lists..."
                  className="za-field w-full resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-decorative"
                />
                <label htmlFor="isPublic" className="cursor-pointer text-xs text-ink">
                  Make my media archive publicly accessible
                </label>
              </div>

              {isPublic && username && (
                <div className="rounded-control bg-surface-subtle p-3 text-xs text-ink-muted">
                  Your public profile is active at:{' '}
                  <Link
                    href={`/u/${username}`}
                    target="_blank"
                    className="za-link inline-flex items-center gap-1 font-[var(--za-weight-emphasis)]"
                  >
                    /u/{username}
                    <ExternalLink size={12} />
                  </Link>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="za-button za-button--primary text-xs"
                >
                  {savingProfile ? 'Saving Changes...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </section>

          {/* Theme Section */}
          <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
            <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
              <Sparkles size={18} className="text-ink-muted" />
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
                Interface Theme
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleThemeChange(t.id)}
                  style={{ backgroundColor: t.bg, color: t.text }}
                  className={`flex flex-col items-center justify-center rounded-control border p-3 text-center transition-all ${
                    currentTheme === t.id
                      ? 'border-2 border-accent shadow-sm'
                      : 'border-decorative hover:border-required'
                  }`}
                >
                  <span className="text-xs font-[var(--za-weight-emphasis)]">{t.label}</span>
                  {currentTheme === t.id && (
                    <span className="mt-1 text-[10px] text-accent">Active</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Account & Security */}
          <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
            <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
              <Shield size={18} className="text-ink-muted" />
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
                Authentication & Sign-in
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-decorative pb-2">
                <span className="text-ink-muted">Account Email</span>
                <span className="font-[var(--za-weight-emphasis)] text-ink">{profile.email}</span>
              </div>
              <div className="flex items-center justify-between border-b border-decorative pb-2">
                <span className="text-ink-muted">Email Verification</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-[var(--za-weight-emphasis)] ${
                    profile.emailVerified
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {profile.emailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Sign-in Method</span>
                <span className="font-[var(--za-weight-emphasis)] text-ink">Email & Password</span>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="rounded-control border border-red-200 bg-red-50/40 p-6 shadow-raised dark:border-red-950 dark:bg-red-950/20">
            <div className="mb-3 flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-red-700 dark:text-red-400">
                Danger Zone
              </h2>
            </div>

            <p className="mb-4 text-xs text-ink-muted">
              Permanently delete your ZedArchive account and all your tracked media entries,
              progress, comments, and public profile data. This operation is immediately destructive
              and cannot be undone.
            </p>

            <button
              type="button"
              onClick={() => {
                setDeleteError('');
                setIsDeleteModalOpen(true);
              }}
              className="za-button border border-red-300 bg-red-600 text-xs text-white hover:bg-red-700 dark:border-red-800"
            >
              Delete My Account
            </button>
          </section>
        </div>
      </main>

      {/* Delete Account Modal */}
      {isDeleteModalOpen && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
          title="Confirm Account Deletion"
          labelledBy="delete-account-modal-title"
          contentClassName="max-w-[28rem]"
        >
          <form onSubmit={handleDeleteAccount} className="p-6">
            <div className="mb-4 flex items-center gap-3 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="text-sm font-[var(--za-weight-heading)]">
                Permanent Account Deletion
              </h3>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-ink-muted">
              You are about to permanently delete your account (<strong>{profile.email}</strong>).
              All media entries and activity records will be deleted immediately.
            </p>

            {deleteError && (
              <div className="mb-4 rounded-control bg-red-100 p-2.5 text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink">
                Enter your current password to confirm:
              </label>
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="za-field w-full"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="za-button za-button--secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeleting}
                className="za-button bg-red-600 text-xs text-white hover:bg-red-700"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
