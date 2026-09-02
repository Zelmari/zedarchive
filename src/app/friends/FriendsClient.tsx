'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, UserPlus, Check, X, Users, Inbox, Send, Trash2 } from 'lucide-react';
import type { FriendshipItem } from '@/types/friends';
import type { FriendUserSummary } from '@/types/friends';
import {
  acceptFriendRequestAction,
  rejectFriendRequestAction,
  cancelFriendRequestAction,
  removeFriendAction,
  sendFriendRequestAction,
  searchUsersForDiscoveryAction,
} from '@/server/friends';

type Tab = 'friends' | 'incoming' | 'outgoing' | 'find';

interface Props {
  initialFriends: FriendshipItem[];
  initialIncoming: FriendshipItem[];
  initialOutgoing: FriendshipItem[];
}

export default function FriendsClient({ initialFriends, initialIncoming, initialOutgoing }: Props) {
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
        <div className="rounded-small border border-decorative bg-surface-subtle px-3 py-2 text-sm text-ink">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-decorative pb-3">
        {[
          { id: 'friends' as Tab, label: `Friends (${friends.length})`, icon: Users },
          { id: 'incoming' as Tab, label: `Incoming (${incoming.length})`, icon: Inbox },
          { id: 'outgoing' as Tab, label: `Outgoing (${outgoing.length})`, icon: Send },
          { id: 'find' as Tab, label: 'Find Friends', icon: Search },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-small border px-3 py-1.5 text-xs font-medium transition-colors ${tab === id ? 'bg-accent text-on-accent border-accent' : 'bg-surface border-decorative text-ink hover:bg-surface-subtle'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <div className="space-y-3">
          {friends.length === 0 ? (
            <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
              No friends yet. Find and add people from the Find Friends tab or via their public
              profiles.
            </div>
          ) : (
            friends.map((item) => (
              <div
                key={item.id}
                className="za-card flex items-center justify-between rounded-control border border-decorative bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-10 w-10 rounded-full object-cover border border-decorative"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle border border-decorative text-sm font-bold text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-ink">{item.friend.name}</div>
                    <div className="text-xs text-ink-muted">
                      @{item.friend.username || 'unknown'}{' '}
                      {item.friend.bio ? `· ${item.friend.bio.slice(0, 60)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.friend.username && (
                    <Link
                      href={`/u/${item.friend.username}`}
                      className="za-button za-button--tertiary text-xs"
                    >
                      View
                    </Link>
                  )}
                  <button
                    onClick={() => handleRemove(item.friend.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-small border border-decorative bg-surface px-2 py-1 text-xs text-ink-muted hover:text-ink hover:border-required"
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
            <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
              No incoming requests.
            </div>
          ) : (
            incoming.map((item) => (
              <div
                key={item.id}
                className="za-card flex items-center justify-between rounded-control border border-decorative bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-10 w-10 rounded-full object-cover border border-decorative"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle border border-decorative text-sm font-bold text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-ink">{item.friend.name}</div>
                    <div className="text-xs text-ink-muted">
                      @{item.friend.username} wants to be friends
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(item.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-small bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-small border border-decorative bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-50"
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
            <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
              No outgoing requests.
            </div>
          ) : (
            outgoing.map((item) => (
              <div
                key={item.id}
                className="za-card flex items-center justify-between rounded-control border border-decorative bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  {item.friend.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.friend.image}
                      alt={item.friend.name}
                      className="h-10 w-10 rounded-full object-cover border border-decorative"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle border border-decorative text-sm font-bold text-ink">
                      {item.friend.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-ink">{item.friend.name}</div>
                    <div className="text-xs text-ink-muted">@{item.friend.username} · pending</div>
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(item.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-small border border-decorative bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-50"
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'find' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-control border border-decorative bg-surface px-3 py-2">
            <Search size={16} className="text-ink-muted" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by username or name..."
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
            {searchLoading && <span className="text-xs text-ink-muted">Searching...</span>}
          </div>

          {searchQuery.trim().length < 2 ? (
            <div className="text-center text-sm text-ink-muted py-6">
              Type at least 2 characters to search.
            </div>
          ) : searchResults.length === 0 && !searchLoading ? (
            <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
              No users found for &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  className="za-card flex items-center justify-between rounded-control border border-decorative bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.image}
                        alt={u.name}
                        className="h-10 w-10 rounded-full object-cover border border-decorative"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle border border-decorative text-sm font-bold text-ink">
                        {u.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <div className="text-sm font-medium text-ink">{u.name}</div>
                      <div className="text-xs text-ink-muted">
                        @{u.username || 'unknown'} {u.bio ? `· ${u.bio.slice(0, 60)}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSend(u.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-small bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus size={14} /> Add Friend
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
