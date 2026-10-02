'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Plus } from 'lucide-react';
import type { GroupSummary } from '@/types/groups';
import { createGroupAction } from '@/server/groups';
import Modal from '@/components/ui/Modal';
import EmptyLedger from '@/components/ui/EmptyLedger';

export default function GroupsClient({ initialGroups }: { initialGroups: GroupSummary[] }) {
  const router = useRouter();
  const [groups] = useState(initialGroups);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

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
      {groups.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="za-button za-button--primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Create Group
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`za-notice font-[family-name:var(--za-font-serif-body)] text-sm ${
            msg && /fail|required|error/i.test(msg) ? 'za-notice--error' : 'za-notice--success'
          }`}
        >
          {msg}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyLedger
          icon={<Users size={32} strokeWidth={1.5} />}
          title="No groups yet"
          description="Create a reading room for shared archives and ephemeral group conversations."
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="za-button za-button--primary inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Create Group
            </button>
          }
        />
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
                  <span className="font-[family-name:var(--za-font-mono)] text-xs tracking-[0.12em] text-ink-faint">
                    VOL. {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-small border border-decorative bg-surface-subtle px-2 py-1 font-[family-name:var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    <Users size={12} /> {g.role}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-small border border-required bg-surface-subtle text-accent">
                    {g.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Users size={18} />
                    )}
                  </span>
                  <h3 className="min-w-0 break-words font-[family-name:var(--za-font-editorial)] text-xl leading-tight text-ink">
                    {g.name}
                  </h3>
                </div>
              </div>
              {g.description && (
                <p className="mt-4 line-clamp-3 font-[family-name:var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
                  {g.description}
                </p>
              )}
              <div className="mt-5 flex justify-between border-t border-decorative pt-3 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-muted">
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
          title="Create Group"
          labelledBy="create-group-title"
          contentClassName="max-h-[90vh] max-w-lg overflow-y-auto"
        >
          <div className="space-y-4 p-6">
            <div>
              <label className="font-[family-name:var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Group Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Roshar Reading Society"
                className="za-field mt-1 font-[family-name:var(--za-font-serif-body)]"
              />
            </div>
            <div>
              <label className="font-[family-name:var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="What is this group about?"
                className="za-field mt-1 min-h-24 resize-y font-[family-name:var(--za-font-serif-body)]"
              />
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
