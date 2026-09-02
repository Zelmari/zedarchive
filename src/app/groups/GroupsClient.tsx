'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Plus, X } from 'lucide-react';
import type { GroupSummary } from '@/types/groups';
import type { FriendUserSummary } from '@/types/friends';
import { createGroupAction } from '@/server/groups';
import Modal from '@/components/ui/Modal';

export default function GroupsClient({
  initialGroups,
  friends,
}: {
  initialGroups: GroupSummary[];
  friends: FriendUserSummary[];
}) {
  const router = useRouter();
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
        router.push(`/groups/${res.id}`);
      } catch (e: any) {
        setMsg(e.message || 'Failed to create group');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-decorative pb-4">
        <div>
          <p className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-ink-faint">
            Anthology shelves
          </p>
          <div className="mt-1 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> Create Group
        </button>
      </div>

      {msg && (
        <div className="za-notice za-notice--info font-[var(--za-font-serif-body)] text-sm">
          {msg}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="za-bookplate relative p-10 text-center">
          <span className="za-ribbon-bookmark" aria-hidden="true" />
          <p className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
            No volumes yet
          </p>
          <p className="mx-auto mt-2 max-w-lg font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
            Create a reading room and invite your friends. Only accepted companions can be added to
            a collective shelf.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, index) => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="za-bookplate relative flex min-h-56 flex-col justify-between p-5 transition-transform hover:-translate-y-0.5 hover:border-accent"
            >
              <span className="za-ribbon-bookmark" aria-hidden="true" />
              <div>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="font-[var(--za-font-mono)] text-xs tracking-[0.12em] text-ink-faint">
                    VOL. {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-small border border-decorative bg-surface-subtle px-2 py-1 font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    <Users size={12} /> {g.role}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-small border border-required bg-surface-subtle text-accent">
                    {g.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Users size={18} />
                    )}
                  </span>
                  <h3 className="truncate font-[var(--za-font-editorial)] text-xl leading-tight text-ink">
                    {g.name}
                  </h3>
                </div>
              </div>
              {g.description && (
                <p className="mt-4 line-clamp-3 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
                  {g.description}
                </p>
              )}
              <div className="mt-5 flex justify-between border-t border-decorative pt-3 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-muted">
                <span>{g.memberCount} members</span>
                <span>{new Date(g.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          ariaLabel="Create Group"
          contentClassName="max-h-[90vh] max-w-lg overflow-y-auto p-6"
        >
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-decorative pb-4">
            <div>
              <p className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-accent">
                New collective volume
              </p>
              <h2 className="mt-1 font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                Create Group
              </h2>
            </div>
            <button
              onClick={() => setShowCreate(false)}
              className="za-button za-button--tertiary p-2"
              aria-label="Close create group dialog"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Group Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Roshar Reading Society"
                className="za-field mt-1 font-[var(--za-font-serif-body)]"
              />
            </div>
            <div>
              <label className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="What is this group about?"
                className="za-field mt-1 min-h-24 resize-y font-[var(--za-font-serif-body)]"
              />
            </div>

            <div>
              <label className="font-[var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Invite Friends (owner&apos;s friends only)
              </label>
              {friends.length === 0 ? (
                <p className="mt-1 font-[var(--za-font-serif-body)] text-sm italic text-ink-muted">
                  You have no friends to invite yet. Add friends first.
                </p>
              ) : (
                <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto border-y border-decorative py-3">
                  {friends.map((f) => (
                    <label
                      key={f.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-small border px-2 py-1.5 transition-colors ${
                        selected.includes(f.id)
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-decorative bg-surface-subtle text-ink-muted hover:border-required hover:text-ink'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(f.id)}
                        onChange={() => toggleSelect(f.id)}
                        className="accent-accent"
                      />
                      <span className="min-w-0 truncate font-[var(--za-font-serif-body)] text-sm">
                        {f.name}{' '}
                        <span className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-faint">
                          @{f.username}
                        </span>
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
        </Modal>
      )}
    </div>
  );
}
