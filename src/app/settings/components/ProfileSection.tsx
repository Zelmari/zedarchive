'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import type { UserProfile } from '@/types/user';
import { MAX_NAME_LENGTH, STREAMING_COUNTRIES } from '@/lib/constants';
import { getInitials } from '@/lib/format';
import { compressImageFile } from '@/lib/client/image-utils';
import { updateUserProfile } from '@/server/profile';

function presetAvatarSvg(bg: string, glyph: string, fg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><text x="32" y="40" font-size="26" text-anchor="middle" fill="${fg}">${glyph}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PRESET_AVATARS: Array<{ id: string; label: string; url: string }> = [
  { id: 'film', label: 'Film reel', url: presetAvatarSvg('#e8d8b8', '🎬', '#5b4636') },
  { id: 'book', label: 'Book', url: presetAvatarSvg('#d9e6d4', '📖', '#2e4d33') },
  { id: 'sparkle', label: 'Sparkle', url: presetAvatarSvg('#e4d8ec', '✨', '#4c3a63') },
  { id: 'tv', label: 'Television', url: presetAvatarSvg('#d3e0ea', '📺', '#2e4258') },
];

interface ProfileSectionProps {
  profile: UserProfile;
}

export default function ProfileSection({ profile }: ProfileSectionProps) {
  const router = useRouter();

  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [countryCode, setCountryCode] = useState(profile.countryCode || 'US');
  const [isPublic, setIsPublic] = useState(Boolean(profile.isPublic));

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.image || null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess(false);

    if (isPublic && !username.trim()) {
      setProfileError('A username handle is required to make your archive public');
      setSavingProfile(false);
      return;
    }

    try {
      await updateUserProfile({
        name,
        username: username.trim() || null,
        bio: bio.trim() || null,
        countryCode,
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

  const applyAvatar = async (image: string | null) => {
    setAvatarBusy(true);
    setProfileError('');
    try {
      await updateUserProfile({ image });
      setAvatarPreview(image);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update avatar.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 256, 256, 0.85);
      await applyAvatar(dataUrl);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to compress avatar image.');
    }
  };

  const handleRemoveAvatar = () => void applyAvatar(null);

  return (
    <section className="za-card za-card--raised rounded-control border border-required bg-surface p-6 shadow-raised">
      <div className="mb-4 flex items-center gap-2 border-b border-decorative pb-3">
        <User size={18} className="text-ink-muted" />
        <h2 className="text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.05em] text-ink">
          Profile Information
        </h2>
      </div>

      {profileSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-control bg-success/10 p-3 text-xs text-success">
          <Check size={14} />
          <span>Profile changes saved successfully!</span>
        </div>
      )}

      {profileError && (
        <div className="mb-4 flex items-center gap-2 rounded-control bg-danger-surface p-3 text-xs text-danger">
          <AlertTriangle size={14} />
          <span>{profileError}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-4">
        {/* Avatar & Profile Picture */}
        <div className="mb-2 flex items-center gap-4 rounded-control border border-decorative bg-surface-subtle p-4">
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- compressed data URLs / presets, unoptimized by design
            <img
              src={avatarPreview}
              alt="Avatar preview"
              className="h-20 w-20 flex-none rounded-full border-2 border-accent object-cover"
            />
          ) : (
            <span
              className="flex h-20 w-20 flex-none items-center justify-center rounded-full border-2 border-decorative bg-[var(--za-color-title-tile)] text-lg font-[var(--za-weight-heading)] text-[var(--za-color-title-tile-text)]"
              aria-hidden="true"
            >
              {getInitials(name)}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`za-button za-button--secondary inline-flex cursor-pointer items-center text-xs ${avatarBusy ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {avatarBusy ? 'Working…' : avatarPreview ? 'Change Avatar' : 'Upload Avatar'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarFile}
                  disabled={avatarBusy}
                />
              </label>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarBusy}
                  className="za-button za-button--secondary text-xs"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">Presets:</span>
              {PRESET_AVATARS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => void applyAvatar(preset.url)}
                  title={preset.label}
                  aria-label={`Use ${preset.label} preset avatar`}
                  className="h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-decorative transition-transform hover:scale-105 disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG presets */}
                  <img src={preset.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-ink-muted">
              PNG, JPG or WebP — compressed to 256×256 on upload. Avatars show up on your public
              archive and guestbook comments.
            </p>
          </div>
        </div>

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

        <div>
          <label className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink">
            Streaming Region (Watch Providers)
          </label>
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="za-field w-full cursor-pointer"
          >
            {STREAMING_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-muted">
            Used to show legal where-to-watch and streaming availability badges on shows and movies.
          </p>
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
  );
}
