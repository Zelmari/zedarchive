'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Share2, Copy, Check, Globe, Lock, ExternalLink } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { getUserProfile, updateUserProfile } from '@/server/profile';
import { normalizeHandle } from '@/lib/handles';
import UserSearchCombobox from '@/components/search/UserSearchCombobox';

interface ShareProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (
    message: string,
    type?: 'success' | 'error' | 'warning' | 'info',
    duration?: number,
  ) => void;
}

export default function ShareProfileModal({ isOpen, onClose, onToast }: ShareProfileModalProps) {
  const router = useRouter();
  const [profile, setProfile] = useState({ username: '', isPublic: false, bio: '' });
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  // The profile loads async; once the user edits anything, a late fetch
  // resolution must NOT clobber their in-progress edits.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      dirtyRef.current = false;
      getUserProfile()
        .then((data) => {
          if (data && !dirtyRef.current) {
            setProfile({
              username: data.username || normalizeHandle(data.name) || '',
              isPublic: Boolean(data.isPublic),
              bio: data.bio || '',
            });
          }
        })
        .catch((err) => console.error('Failed to load profile:', err));
    }
  }, [isOpen]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  if (!isOpen) return null;

  const publicUrl =
    typeof window !== 'undefined' && profile.username
      ? `${window.location.origin}/u/${profile.username}`
      : '';

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    onToast?.('Public profile link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const cleanUsername = normalizeHandle(profile.username);
      if (profile.isPublic && !cleanUsername) {
        throw new Error('A username handle is required for a public profile');
      }

      await updateUserProfile({
        username: cleanUsername,
        isPublic: profile.isPublic,
        bio: profile.bio.trim(),
      });

      if (onToast) onToast('Profile settings updated successfully', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="share-profile-title"
      title="Share Your Archive"
      icon={<Share2 size={18} />}
      contentClassName="max-w-[38rem] rounded-small"
    >
      <div className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {/* Search & Discover Other Profiles */}
        <div className="mb-[var(--za-space-5)] rounded-small border border-decorative bg-surface-subtle p-4">
          <div className="mb-1 font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-accent">
            Discover
          </div>
          <label className="mb-1 block font-[var(--za-font-display)] text-[length:var(--za-text-heading-sm)] font-bold uppercase tracking-[0.04em] text-ink">
            Find Public Archives
          </label>
          <p className="mb-3 font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink-muted">
            Search usernames to explore other members&rsquo; public collections and guestbooks.
          </p>
          <UserSearchCombobox
            placeholder="Search by username or name (e.g. John Smith)…"
            onSelectUser={(username) => {
              onClose();
              router.push(`/u/${username}`);
            }}
            onFullSearch={(q) => {
              onClose();
              router.push(`/search?q=${encodeURIComponent(q)}`);
            }}
          />
        </div>

        <div className="relative my-[var(--za-space-5)] flex items-center">
          <div className="flex-grow border-t border-decorative" />
          <span className="mx-3 flex-shrink font-[var(--za-font-mono)] text-[0.62rem] uppercase tracking-[0.14em] text-ink-faint">
            Your Archive Link
          </span>
          <div className="flex-grow border-t border-decorative" />
        </div>

        <form onSubmit={handleSave}>
          {error && (
            <div className="mb-[var(--za-space-3)] rounded-small border border-danger bg-danger-surface px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-danger">
              {error}
            </div>
          )}

          <p className="mb-[var(--za-space-4)] font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
            Share a read-only showcase of your collection, ratings, and media stats with friends.
          </p>

          {/* Public toggle */}
          <div className="mb-[var(--za-space-4)] flex items-center justify-between rounded-small border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-[var(--za-space-3)]">
            <div className="flex items-center gap-2">
              {profile.isPublic ? (
                <Globe size={18} className="text-success" aria-hidden="true" />
              ) : (
                <Lock size={18} className="text-ink-muted" aria-hidden="true" />
              )}
              <div>
                <div className="font-[var(--za-font-display)] text-[length:var(--za-text-supporting)] font-bold uppercase tracking-[0.04em] text-ink">
                  {profile.isPublic ? 'Public Profile Enabled' : 'Private Profile'}
                </div>
                <div className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink-muted">
                  {profile.isPublic
                    ? 'Anyone with the link can view your archive'
                    : 'Your archive is private and only visible to you'}
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={profile.isPublic}
              onChange={(e) => {
                markDirty();
                setProfile((p) => ({ ...p, isPublic: e.target.checked }));
              }}
              className="h-5 w-5 cursor-pointer"
            />
          </div>

          {/* Username handle */}
          <div className="mb-[var(--za-space-3)]">
            <label
              htmlFor="profile-username"
              className="mb-[0.3rem] block font-[var(--za-font-mono)] text-[0.65rem] uppercase tracking-[0.1em] text-ink-muted"
            >
              Custom Handle / URL
            </label>
            <div className="flex items-center gap-[0.3rem]">
              <span className="shrink-0 font-[var(--za-font-mono)] text-[0.68rem] text-ink-muted">
                zedarchive.com/u/
              </span>
              <input
                id="profile-username"
                type="text"
                placeholder="username"
                value={profile.username}
                onChange={(e) => {
                  markDirty();
                  setProfile((p) => ({ ...p, username: e.target.value }));
                }}
                className="za-field min-w-0 flex-1 py-1 text-[length:var(--za-text-fine)]"
              />
            </div>
            <p className="mt-1 flex items-center gap-1 font-[var(--za-font-serif-body)] text-[length:var(--za-text-fine)] text-ink-muted">
              <ExternalLink size={11} aria-hidden="true" /> Lowercase letters, numbers, dashes only.
            </p>
          </div>

          {/* Bio */}
          <div className="mb-[var(--za-space-4)]">
            <label
              htmlFor="profile-bio"
              className="mb-[0.3rem] block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
            >
              Short Bio (Optional)
            </label>
            <textarea
              id="profile-bio"
              rows={2}
              placeholder="Avid reader, anime enthusiast..."
              value={profile.bio}
              onChange={(e) => {
                markDirty();
                setProfile((p) => ({ ...p, bio: e.target.value }));
              }}
              className="za-field min-h-16 w-full resize-y py-1 text-[length:var(--za-text-fine)]"
            />
          </div>

          {/* Link preview + copy */}
          {publicUrl ? (
            <div className="mb-[var(--za-space-4)] flex flex-col gap-2 rounded-small border border-required bg-surface px-[var(--za-space-3)] py-2 shadow-raised sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 [overflow-wrap:anywhere] font-[var(--za-font-mono)] text-[0.68rem] text-ink">
                {publicUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="za-button za-button--secondary shrink-0 gap-1 px-2 text-[0.68rem] text-accent"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : null}

          {/* Footer */}
          <div className="mt-[var(--za-space-5)] flex flex-wrap justify-end gap-[var(--za-space-3)]">
            <button type="button" className="za-button za-button--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="za-button za-button--primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
