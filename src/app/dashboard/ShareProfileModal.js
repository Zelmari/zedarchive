'use client';

import { useState, useEffect } from 'react';
import { Share2, Copy, Check, Globe, Lock, ExternalLink } from 'lucide-react';
import ModalShell from './ModalShell';
import { getUserProfile, updateUserProfile } from '@/server/profile';
import { normalizeHandle } from '@/lib/handles';
import styles from './dashboard.module.css';

export default function ShareProfileModal({ isOpen, onClose, onToast }) {
  const [profile, setProfile] = useState({ username: '', isPublic: false, bio: '' });
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      getUserProfile()
        .then((data) => {
          if (data) {
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

  if (!isOpen) return null;

  const publicUrl = typeof window !== 'undefined' && profile.username
    ? `${window.location.origin}/u/${profile.username}`
    : '';

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    if (onToast) onToast('Public profile link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = async (e) => {
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
      setError(err.message || 'Failed to save profile settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="share-profile-title"
      title="Public Archive Profile"
      icon={<Share2 size={18} />}
      contentStyle={{ maxWidth: '34rem' }}
    >
      <form onSubmit={handleSave} style={{ padding: 'var(--za-space-4) var(--za-space-6)' }}>
          {error && <div className={styles.errorMessage} style={{ marginBottom: 'var(--za-space-3)' }}>{error}</div>}

          <p style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)', marginBottom: 'var(--za-space-4)' }}>
            Share a read-only showcase of your collection, ratings, and media stats with friends.
          </p>

          {/* Visibility Toggle */}
          <div style={{ padding: 'var(--za-space-3)', background: 'var(--za-color-surface-subtle)', borderRadius: 'var(--za-radius-control)', marginBottom: 'var(--za-space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {profile.isPublic ? <Globe size={18} style={{ color: '#2e7d32' }} /> : <Lock size={18} style={{ color: 'var(--za-color-text-muted)' }} />}
              <div>
                <div style={{ fontWeight: 'var(--za-weight-heading)', fontSize: 'var(--za-text-fine)' }}>
                  {profile.isPublic ? 'Public Profile Enabled' : 'Private Profile'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--za-color-text-muted)' }}>
                  {profile.isPublic ? 'Anyone with the link can view your archive' : 'Your archive is private and only visible to you'}
                </div>
              </div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={profile.isPublic}
                onChange={(e) => setProfile((p) => ({ ...p, isPublic: e.target.checked }))}
                style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Username handle */}
          <div className={styles.formGroup} style={{ marginBottom: 'var(--za-space-3)' }}>
            <label htmlFor="profile-username" className={styles.formLabel}>
              Custom Handle / URL
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ fontSize: 'var(--za-text-fine)', color: 'var(--za-color-text-muted)' }}>zedarchive.com/u/</span>
              <input
                id="profile-username"
                type="text"
                className={styles.formInput}
                placeholder="username"
                value={profile.username}
                onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Bio */}
          <div className={styles.formGroup} style={{ marginBottom: 'var(--za-space-4)' }}>
            <label htmlFor="profile-bio" className={styles.formLabel}>
              Short Bio (Optional)
            </label>
            <textarea
              id="profile-bio"
              className={styles.formInput}
              rows={2}
              placeholder="Avid reader, anime enthusiast..."
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Copy Public Link Row (if public) */}
          {profile.isPublic && publicUrl && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: 'var(--za-space-4)' }}>
              <input
                type="text"
                readOnly
                value={publicUrl}
                className={styles.formInput}
                style={{ flex: 1, fontSize: '0.75rem', color: 'var(--za-color-text-muted)' }}
              />
              <button
                type="button"
                className="za-button za-button--secondary"
                onClick={handleCopyLink}
                title="Copy Link"
              >
                {copied ? <Check size={14} style={{ color: '#2e7d32' }} /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
              <a
                href={`/u/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="za-button za-button--secondary"
                title="Open Public Profile"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--za-space-2)' }}>
            <button type="button" className="za-button za-button--secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="za-button za-button--primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
      </form>
    </ModalShell>
  );
}
