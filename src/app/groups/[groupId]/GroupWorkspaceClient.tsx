'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Library, Settings, Users, Crown } from 'lucide-react';
import type { GroupDetails, GroupMessageItem } from '@/types/groups';
import type { MediaEntry } from '@/types/media';
import GroupChatView from './GroupChatView';
import GroupArchiveView from './GroupArchiveView';
import GroupSettingsModal from './GroupSettingsModal';
import { getGroupMessagesAction, getEligibleFriendsToInviteAction } from '@/server/groups';

type Tab = 'chat' | 'archive' | 'members';

export default function GroupWorkspaceClient({
  group,
  initialMessages,
  initialMedia,
  currentUserId,
}: {
  group: GroupDetails;
  initialMessages: GroupMessageItem[];
  initialMedia: MediaEntry[];
  currentUserId: string;
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
      <div className="rounded-control border-2 border-accent bg-surface p-6 shadow-raised">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent">
            <Users size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-[var(--za-weight-heading)] text-ink flex items-center gap-2">
              {group.name}
              {group.isOwner && (
                <span className="inline-flex items-center gap-1 rounded-small bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">
                  <Crown size={10} /> Owner
                </span>
              )}
            </h1>
            {group.description && (
              <p className="mt-1 text-sm text-ink-muted">{group.description}</p>
            )}
            <div className="mt-1 text-xs text-ink-muted">
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
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-small border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
          <Library size={12} /> Shared Group Archive · Collective
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-decorative pb-3">
        <button
          onClick={() => setTab('chat')}
          className={`inline-flex items-center gap-1.5 rounded-small border px-3 py-1.5 text-xs font-medium ${tab === 'chat' ? 'bg-accent text-on-accent border-accent' : 'bg-surface border-decorative text-ink hover:bg-surface-subtle'}`}
        >
          <MessageSquare size={14} /> Group Chat
        </button>
        <button
          onClick={() => setTab('archive')}
          className={`inline-flex items-center gap-1.5 rounded-small border px-3 py-1.5 text-xs font-medium ${tab === 'archive' ? 'bg-accent text-on-accent border-accent' : 'bg-surface border-decorative text-ink hover:bg-surface-subtle'}`}
        >
          <Library size={14} /> Group Archive
        </button>
        <button
          onClick={() => setTab('members')}
          className={`inline-flex items-center gap-1.5 rounded-small border px-3 py-1.5 text-xs font-medium ${tab === 'members' ? 'bg-accent text-on-accent border-accent' : 'bg-surface border-decorative text-ink hover:bg-surface-subtle'}`}
        >
          <Users size={14} /> Members ({group.members.length})
        </button>
      </div>

      {tab === 'chat' && (
        <GroupChatView
          groupId={group.id}
          initialMessages={messages}
          currentUserId={currentUserId}
          isOwner={group.isOwner}
          onUpdate={setMessages}
        />
      )}

      {tab === 'archive' && (
        <GroupArchiveView group={group} initialMedia={initialMedia} currentUserId={currentUserId} />
      )}

      {tab === 'members' && (
        <div className="za-card rounded-control border border-decorative bg-surface p-4 space-y-3">
          <h3 className="text-sm font-medium text-ink">Members</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-small border border-decorative bg-surface-subtle px-3 py-2"
              >
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt={m.name} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-decorative text-xs">
                    {m.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink truncate">{m.name}</div>
                  <div className="text-[11px] text-ink-muted truncate">
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
