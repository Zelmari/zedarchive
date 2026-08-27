'use client';

import { useState, useEffect, useRef } from 'react';
import { Share2, Copy, Check, Globe, Lock, ExternalLink } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { getUserProfile, updateUserProfile } from '@/server/profile';
import { normalizeHandle } from '@/lib/handles';

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
      contentStyle={{ maxWidth: '34rem' }}
    >
      <form onSubmit={handleSave} className="px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {error && (
          <div className="mb-[var(--za-space-3)] rounded-small border border-danger bg-danger-surface px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-danger">
            {error}
          </div>
        )}

        <p className="mb-[var(--za-space-4)] text-[length:var(--za-text-fine)] text-ink-muted">
          Share a read-only showcase of your collection, ratings, and media stats with friends.
        </p>

        {/* Public toggle */}
        <div className="mb-[var(--za-space-4)] flex items-center justify-between rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-[var(--za-space-3)]">
          <div className="flex items-center gap-2">
            {profile.isPublic ? (
              <Globe size={18} className="text-success" />
            ) : (
              <Lock size={18} className="text-ink-muted" />
            )}
            <div>
              <div className="text-[length:var(--za-text-supporting)] font-[var(--za-weight-emphasis)] text-ink">
                {profile.isPublic ? 'Public Profile Enabled' : 'Private Profile'}
              </div>
              <div className="text-[length:var(--za-text-fine)] text-ink-muted">
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
            className="mb-[0.3rem] block text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink-muted"
          >
            Custom Handle / URL
          </label>
          <div className="flex items-center gap-[0.3rem]">
            <span className="text-[length:var(--za-text-fine)] text-ink-muted">
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
              className="min-w-0 flex-1 rounded-small border border-required bg-surface px-2 py-1 text-[length:var(--za-text-fine)] text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[length:var(--za-text-fine)] text-ink-muted">
            <ExternalLink size={11} /> Lowercase letters, numbers, dashes only.
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
            className="w-full resize-y rounded-small border border-required bg-surface px-2 py-1 text-[length:var(--za-text-fine)] text-ink focus:border-accent focus:outline-none"
          />
        </div>

        {/* Link preview + copy */}
        {publicUrl ? (
          <div className="mb-[var(--za-space-4)] flex items-center justify-between rounded-control border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-2">
            <span className="truncate text-[length:var(--za-text-fine)] text-ink-muted">
              {publicUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="ml-2 inline-flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[length:var(--za-text-fine)] text-accent hover:underline"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-[var(--za-space-5)] flex justify-end gap-[var(--za-space-3)]">
          <button type="button" className="za-button za-button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="za-button za-button--primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
