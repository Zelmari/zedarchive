'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Library, Settings, Users, Crown } from 'lucide-react';
import type { GroupDetails, GroupMessageItem } from '@/types/groups';
import type { MediaEntry } from '@/types/media';
import GroupChatView from './GroupChatView';
import DashboardClient from '@/app/dashboard/DashboardClient';
import GroupSettingsModal from './GroupSettingsModal';
import { getGroupMessagesAction, getEligibleFriendsToInviteAction } from '@/server/groups';

type Tab = 'chat' | 'archive' | 'members';

export default function GroupWorkspaceClient({
  group,
  initialMessages,
  initialMedia,
  currentUserId,
  currentUser,
}: {
  group: GroupDetails;
  initialMessages: GroupMessageItem[];
  initialMedia: MediaEntry[];
  currentUserId: string;
  currentUser: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    theme?: string | null;
    customTheme?: any;
    username?: string | null;
    isPublic?: boolean;
    bio?: string | null;
    readingGoals?: any;
    emailVerified?: boolean;
    verificationDismissedAt?: string | null;
  };
}) {
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState(initialMessages);
  const [showSettings, setShowSettings] = useState(false);
  const [eligibleFriends, setEligibleFriends] = useState<
    { id: string; name: string; username: string | null; image: string | null }[]
  >([]);

  // Polling for messages every 45s via server action + revalidate
  useEffect(() => {
    if (tab !== 'chat') return;
    const id = setInterval(async () => {
      try {
        const fresh = await getGroupMessagesAction(group.id);
        setMessages(fresh);
      } catch {}
    }, 45000);
    return () => clearInterval(id);
  }, [tab, group.id]);

  useEffect(() => {
    if (showSettings && group.isOwner) {
      (async () => {
        try {
          const friends = await getEligibleFriendsToInviteAction(group.id);
          setEligibleFriends(friends);
        } catch {
          setEligibleFriends([]);
        }
      })();
    }
  }, [showSettings, group.isOwner, group.id]);

  // Try to fetch via server helper if API route not exists: use direct import? Not possible in client. Keep empty fallback and allow manual refresh.
  // We will attempt to call a server action that we will add: getEligibleFriendsAction

  return (
    <div className="space-y-6">
      {/* Masthead Banner */}
      <div className="za-bookplate relative p-6 sm:p-7">
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-small border border-required bg-surface-subtle text-accent">
            {group.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <Users size={22} />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="mb-1 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.14em] text-accent">
              Collective volume
            </p>
            <h1 className="flex items-center gap-2 font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.03em] text-ink">
              {group.name}
              {group.isOwner && (
                <span className="inline-flex items-center gap-1 rounded-small border border-accent bg-accent-soft px-1.5 py-0.5 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-accent">
                  <Crown size={10} /> Owner
                </span>
              )}
            </h1>
            {group.description && (
              <p className="mt-2 max-w-2xl font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
                {group.description}
              </p>
            )}
            <div className="mt-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-faint">
              {group.memberCount} members · Created {new Date(group.createdAt).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="za-button za-button--secondary inline-flex items-center gap-1.5 text-xs"
          >
            <Settings size={14} /> Members & Settings
          </button>
        </div>
        <div className="mt-5 inline-flex items-center gap-1.5 border-t border-decorative pt-3 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.08em] text-accent">
          <Library size={12} /> Shared Group Archive · Collective
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-decorative pb-4">
        <button
          onClick={() => setTab('chat')}
          className={`inline-flex min-h-[var(--za-control-min-block-size)] items-center gap-1.5 rounded-full border px-3 py-1.5 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] transition-colors ${tab === 'chat' ? 'border-accent bg-accent text-on-accent shadow-sm' : 'border-decorative bg-surface text-ink-muted hover:border-required hover:bg-surface-subtle hover:text-ink'}`}
        >
          <MessageSquare size={14} /> Group Chat
        </button>
        <button
          onClick={() => setTab('archive')}
          className={`inline-flex min-h-[var(--za-control-min-block-size)] items-center gap-1.5 rounded-full border px-3 py-1.5 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] transition-colors ${tab === 'archive' ? 'border-accent bg-accent text-on-accent shadow-sm' : 'border-decorative bg-surface text-ink-muted hover:border-required hover:bg-surface-subtle hover:text-ink'}`}
        >
          <Library size={14} /> Group Archive
        </button>
        <button
          onClick={() => setTab('members')}
          className={`inline-flex min-h-[var(--za-control-min-block-size)] items-center gap-1.5 rounded-full border px-3 py-1.5 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] transition-colors ${tab === 'members' ? 'border-accent bg-accent text-on-accent shadow-sm' : 'border-decorative bg-surface text-ink-muted hover:border-required hover:bg-surface-subtle hover:text-ink'}`}
        >
          <Users size={14} /> Members ({group.members.length})
        </button>
      </div>

      {tab === 'chat' && (
        <GroupChatView
          groupId={group.id}
          initialMessages={messages}
          isOwner={group.isOwner}
          onUpdate={setMessages}
        />
      )}

      {tab === 'archive' && (
        <DashboardClient
          user={currentUser}
          initialEntries={initialMedia}
          groupId={group.id}
          groupName={group.name}
          isGroup
        />
      )}

      {tab === 'members' && (
        <div className="za-bookplate space-y-4 p-5">
          <div className="border-b border-decorative pb-3">
            <p className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-accent">
              The reading room
            </p>
            <h3 className="mt-1 font-[var(--za-font-editorial)] text-xl text-ink">Members</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-small border border-decorative bg-surface-subtle px-3 py-2.5"
              >
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.image}
                    alt={m.name}
                    className="h-9 w-9 rounded-small border border-required object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-small border border-required bg-surface font-[var(--za-font-display)] text-xs uppercase text-ink">
                    {m.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate font-[var(--za-font-editorial)] text-base text-ink">
                    {m.name}
                  </div>
                  <div className="truncate font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase text-ink-muted">
                    @{m.username} · {m.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="za-button za-button--secondary text-xs"
          >
            Manage Members
          </button>
        </div>
      )}

      {showSettings && (
        <GroupSettingsModal
          group={group}
          currentUserId={currentUserId}
          eligibleFriends={eligibleFriends}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
