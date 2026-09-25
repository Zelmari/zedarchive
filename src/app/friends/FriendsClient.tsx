'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, UserPlus, Check, X, Users, Inbox, Send, Trash2 } from 'lucide-react';
import type { FriendshipItem } from '@/types/friends';
import type { FriendUserSummary } from '@/types/friends';
import SegmentButton from '@/components/ui/SegmentButton';
import EmptyLedger from '@/components/ui/EmptyLedger';
import {
  acceptFriendRequestAction,
  rejectFriendRequestAction,
  cancelFriendRequestAction,
  removeFriendAction,
  sendFriendRequestAction,
  searchUsersForDiscoveryAction,
} from '@/server/friends';

type Tab = 'friends' | 'incoming' | 'outgoing' | 'find';

const personRowClass =
  'za-bookplate relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between';
const personIdentityClass = 'flex min-w-0 flex-1 items-center gap-3';
const personNameClass =
  'break-words font-[family-name:var(--za-font-editorial)] text-lg leading-tight text-ink';
const personHandleClass =
  'break-words font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted';
const personActionsClass = 'flex flex-wrap items-center gap-2 sm:shrink-0';

interface Props {
  initialFriends: FriendshipItem[];
  initialIncoming: FriendshipItem[];
  initialOutgoing: FriendshipItem[];
  currentUsername?: string | null;
}

export default function FriendsClient({
  initialFriends,
  initialIncoming,
  initialOutgoing,
  currentUsername,
}: Props) {
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState(initialFriends);
  const [incoming, setIncoming] = useState(initialIncoming);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [pending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUserSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAccept = (id: string) => {
    startTransition(async () => {
      try {
        await acceptFriendRequestAction({ requestId: id });
        const item = incoming.find((r) => r.id === id);
        setIncoming((prev) => prev.filter((r) => r.id !== id));
        if (item) setFriends((prev) => [...prev, { ...item, status: 'accepted' }]);
        showMessage('Friend request accepted');
      } catch (e: any) {
        showMessage(e.message || 'Failed to accept');
      }
    });
  };

  const handleReject = (id: string) => {
    startTransition(async () => {
      try {
        await rejectFriendRequestAction({ requestId: id });
        setIncoming((prev) => prev.filter((r) => r.id !== id));
        showMessage('Request rejected');
      } catch (e: any) {
        showMessage(e.message || 'Failed to reject');
      }
    });
  };

  const handleCancel = (id: string) => {
    startTransition(async () => {
      try {
        await cancelFriendRequestAction({ requestId: id });
        setOutgoing((prev) => prev.filter((r) => r.id !== id));
        showMessage('Request cancelled');
      } catch (e: any) {
        showMessage(e.message || 'Failed to cancel');
      }
    });
  };

  const handleRemove = (friendUserId: string) => {
    if (!confirm('Remove this friend?')) return;
    startTransition(async () => {
      try {
        await removeFriendAction({ friendUserId });
        setFriends((prev) => prev.filter((f) => f.friend.id !== friendUserId));
        showMessage('Friend removed');
      } catch (e: any) {
        showMessage(e.message || 'Failed to remove');
      }
    });
  };

  const handleSend = (targetUserId: string) => {
    startTransition(async () => {
      try {
        await sendFriendRequestAction({ targetUserId });
        showMessage('Friend request sent');
        // Optimistically remove from search results or update?
        setSearchResults((prev) => prev.filter((u) => u.id !== targetUserId));
        // Refresh outgoing locally - would need to fetch, but we can add placeholder
        // For simplicity, show message and keep UI; user can switch tab to see outgoing after refresh
      } catch (e: any) {
        showMessage(e.message || 'Failed to send request');
      }
    });
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchUsersForDiscoveryAction(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`za-notice font-[family-name:var(--za-font-serif-body)] text-sm ${
            /fail|error/i.test(message) ? 'za-notice--error' : 'za-notice--success'
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-decorative pb-4">
        {[
          { id: 'friends' as Tab, label: `Friends (${friends.length})`, icon: Users },
          { id: 'incoming' as Tab, label: `Incoming (${incoming.length})`, icon: Inbox },
          { id: 'outgoing' as Tab, label: `Outgoing (${outgoing.length})`, icon: Send },
          { id: 'find' as Tab, label: 'Find Friends', icon: Search },
        ].map(({ id, label, icon }) => (
          <SegmentButton key={id} active={tab === id} onClick={() => setTab(id)} icon={icon}>
            {label}
          </SegmentButton>
        ))}
      </div>

      {tab === 'friends' && (
        <div className="space-y-3">
          {friends.length === 0 ? (
            <EmptyLedger
              title="No companions yet"
              description="Find and add people from the Find Friends tab, or from a public profile."
              action={
                <button
                  type="button"
                  className="za-button za-button--primary"
                  onClick={() => setTab('find')}
                >
                  Find Friends
                </button>
              }
            />
          ) : (
            friends.map((item) => (
              <div key={item.id} className={personRowClass}>
                <div className={personIdentityClass}>
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-11 w-11 shrink-0 rounded-small border border-required object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-small border border-required bg-surface-subtle font-[family-name:var(--za-font-display)] text-sm font-bold uppercase text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={personNameClass}>{item.friend.name}</div>
                    <div className={personHandleClass}>@{item.friend.username || 'unknown'} </div>
                    {item.friend.bio && (
                      <p className="mt-1 max-w-xl break-words font-[family-name:var(--za-font-serif-body)] text-sm italic text-ink-muted">
                        {item.friend.bio.slice(0, 100)}
                      </p>
                    )}
                  </div>
                </div>
                <div className={personActionsClass}>
                  {item.friend.username && (
                    <Link
                      href={`/u/${item.friend.username}`}
                      className="za-button za-button--secondary"
                    >
                      View
                    </Link>
                  )}
                  {currentUsername && item.friend.username && (
                    <Link
                      href={`/u/${encodeURIComponent(currentUsername)}/compare/${encodeURIComponent(item.friend.username)}`}
                      className="za-button za-button--tertiary"
                    >
                      Compare
                    </Link>
                  )}
                  <button
                    onClick={() => handleRemove(item.friend.id)}
                    disabled={pending}
                    className="za-button za-button--tertiary"
                    title="Remove friend"
                  >
                    <Trash2 size={12} /> Unfriend
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'incoming' && (
        <div className="space-y-3">
          {incoming.length === 0 ? (
            <EmptyLedger
              title="No incoming requests"
              description="When someone asks to connect, it will appear here."
            />
          ) : (
            incoming.map((item) => (
              <div key={item.id} className={personRowClass}>
                <div className={personIdentityClass}>
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-11 w-11 shrink-0 rounded-small border border-required object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-small border border-required bg-surface-subtle font-[family-name:var(--za-font-display)] text-sm font-bold uppercase text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={personNameClass}>{item.friend.name}</div>
                    <div className={personHandleClass}>
                      @{item.friend.username} wants to be friends
                    </div>
                  </div>
                </div>
                <div className={personActionsClass}>
                  <button
                    onClick={() => handleAccept(item.id)}
                    disabled={pending}
                    className="za-button za-button--primary disabled:opacity-50"
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    disabled={pending}
                    className="za-button za-button--secondary disabled:opacity-50"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'outgoing' && (
        <div className="space-y-3">
          {outgoing.length === 0 ? (
            <EmptyLedger
              title="No outgoing requests"
              description="Sent requests wait here until they are accepted or cancelled."
            />
          ) : (
            outgoing.map((item) => (
              <div key={item.id} className={personRowClass}>
                <div className={personIdentityClass}>
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-11 w-11 shrink-0 rounded-small border border-required object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-small border border-required bg-surface-subtle font-[family-name:var(--za-font-display)] text-sm font-bold uppercase text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={personNameClass}>{item.friend.name}</div>
                    <div className={personHandleClass}>@{item.friend.username} · pending</div>
                  </div>
                </div>
                <div className={personActionsClass}>
                  <button
                    onClick={() => handleCancel(item.id)}
                    disabled={pending}
                    className="za-button za-button--secondary disabled:opacity-50"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'find' && (
        <div className="space-y-4">
          <div className="za-bookplate flex min-w-0 items-center gap-2 p-3">
            <Search size={16} className="shrink-0 text-ink-muted" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by username or name..."
              aria-label="Find friends by username or name"
              className="za-field min-w-0 flex-1 border-0 bg-transparent py-1 shadow-none"
            />
            {searchLoading && (
              <span className="shrink-0 whitespace-nowrap text-xs text-ink-muted">Searching…</span>
            )}
          </div>

          {searchQuery.trim().length < 2 ? (
            <p className="py-8 text-center font-[family-name:var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
              Type at least two characters to search the register.
            </p>
          ) : searchResults.length === 0 && !searchLoading ? (
            <EmptyLedger
              title="No matching archivists"
              description={`No users found for “${searchQuery}”.`}
            />
          ) : (
            <div className="space-y-3">
              {searchResults.map((u) => (
                <div key={u.id} className={personRowClass}>
                  <div className={personIdentityClass}>
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.image}
                        alt={u.name}
                        className="h-11 w-11 shrink-0 rounded-small border border-required object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-small border border-required bg-surface-subtle font-[family-name:var(--za-font-display)] text-sm font-bold uppercase text-ink">
                        {u.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={personNameClass}>{u.name}</div>
                      <div className={personHandleClass}>@{u.username || 'unknown'}</div>
                      {u.bio && (
                        <p className="mt-1 break-words font-[family-name:var(--za-font-serif-body)] text-sm italic text-ink-muted">
                          {u.bio.slice(0, 100)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={personActionsClass}>
                    <button
                      onClick={() => handleSend(u.id)}
                      disabled={pending}
                      className="za-button za-button--primary disabled:opacity-50"
                    >
                      <UserPlus size={14} /> Add Friend
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
