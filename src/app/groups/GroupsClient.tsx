'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Users, Plus, X } from 'lucide-react';
import type { GroupSummary } from '@/types/groups';
import type { FriendUserSummary } from '@/types/friends';
import { createGroupAction } from '@/server/groups';

export default function GroupsClient({
  initialGroups,
  friends,
}: {
  initialGroups: GroupSummary[];
  friends: FriendUserSummary[];
}) {
  const [groups] = useState(initialGroups);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setMsg('Group name is required');
      return;
    }
    startTransition(async () => {
      try {
        const res = await createGroupAction({
          name: name.trim(),
          description: description.trim() || undefined,
          memberUserIds: selected,
        });
        setMsg('Group created');
        window.location.href = `/groups/${res.id}`;
      } catch (e: any) {
        setMsg(e.message || 'Failed to create group');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-ink-muted">
          {groups.length} group{groups.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> Create Group
        </button>
      </div>

      {msg && (
        <div className="rounded-small border border-decorative bg-surface-subtle px-3 py-2 text-sm text-ink">
          {msg}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
          No groups yet. Create one and invite your friends. Only your accepted friends can be
          invited.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="za-card rounded-control border border-decorative bg-surface p-4 hover:border-accent transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Users size={16} />
                </span>
                <h3 className="text-sm font-medium text-ink truncate">{g.name}</h3>
              </div>
              {g.description && (
                <p className="text-xs text-ink-muted line-clamp-2 mb-2">{g.description}</p>
              )}
              <div className="flex justify-between text-xs text-ink-muted mt-2">
                <span>{g.memberCount} members</span>
                <span className="capitalize">{g.role}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-control border border-required bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-[var(--za-weight-heading)] text-ink">Create Group</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-ink-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-ink">Group Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="Roshar Reading Society"
                  className="mt-1 w-full rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What is this group about?"
                  className="mt-1 w-full rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-ink">
                  Invite Friends (owner&apos;s friends only)
                </label>
                {friends.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    You have no friends to invite yet. Add friends first.
                  </p>
                ) : (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-small border border-decorative bg-surface-subtle p-2 space-y-1">
                    {friends.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-small hover:bg-surface cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(f.id)}
                          onChange={() => toggleSelect(f.id)}
                          className="accent-accent"
                        />
                        <span className="text-sm text-ink truncate">
                          {f.name} <span className="text-xs text-ink-muted">@{f.username}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleCreate}
                disabled={pending || !name.trim()}
                className="za-button za-button--primary w-full disabled:opacity-50"
              >
                {pending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
