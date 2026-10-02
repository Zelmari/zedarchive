'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, UserMinus, LogOut, Trash2, X } from 'lucide-react';
import type { GroupDetails } from '@/types/groups';
import {
  kickGroupMemberAction,
  transferGroupOwnershipAction,
  leaveGroupAction,
  deleteGroupAction,
  updateGroupAction,
} from '@/server/groups';
import Modal from '@/components/ui/Modal';

export default function GroupSettingsModal({
  group,
  currentUserId,
  onClose,
}: {
  group: GroupDetails;
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const isOwner = group.isOwner;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const handleUpdate = () => {
    startTransition(async () => {
      try {
        await updateGroupAction({
          groupId: group.id,
          name: name.trim(),
          description: description.trim() || null,
        });
        setMsg('Group updated');
        setTimeout(() => router.refresh(), 500);
      } catch (e: any) {
        setMsg(e.message || 'Failed');
      }
    });
  };

  const handleKick = (userId: string) => {
    if (!confirm('Kick this member?')) return;
    startTransition(async () => {
      try {
        await kickGroupMemberAction({ groupId: group.id, memberUserId: userId });
        setMsg('Member kicked');
        setTimeout(() => router.refresh(), 500);
      } catch (e: any) {
        setMsg(e.message || 'Failed');
      }
    });
  };

  const handleTransfer = (newOwnerId: string) => {
    if (!confirm('Transfer ownership to this member? You will become a regular member.')) return;
    startTransition(async () => {
      try {
        await transferGroupOwnershipAction({ groupId: group.id, newOwnerUserId: newOwnerId });
        setMsg('Ownership transferred');
        setTimeout(() => router.refresh(), 500);
      } catch (e: any) {
        setMsg(e.message || 'Failed');
      }
    });
  };

  const handleLeave = () => {
    if (!confirm('Leave this group?')) return;
    startTransition(async () => {
      try {
        await leaveGroupAction({ groupId: group.id });
        router.push('/groups');
      } catch (e: any) {
        setMsg(e.message || 'Failed');
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        'Delete this group permanently? This will delete all messages and group archive entries.',
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteGroupAction({ groupId: group.id });
        router.push('/groups');
      } catch (e: any) {
        setMsg(e.message || 'Failed');
      }
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Group Settings"
      hideClose
      closeLabel="Close group settings"
      contentClassName="max-h-[90vh] max-w-xl overflow-y-auto p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-decorative pb-4">
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-accent">
            Volume administration
          </p>
          <h2 className="mt-1 break-words font-[family-name:var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
            Group Settings
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="za-modal-close shrink-0"
          aria-label="Close group settings"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {msg && (
        <div
          className={`za-notice mb-4 font-[family-name:var(--za-font-serif-body)] text-sm ${
            /fail|error/i.test(msg) ? 'za-notice--error' : 'za-notice--success'
          }`}
        >
          {msg}
        </div>
      )}

      <div className="space-y-6">
        {isOwner && (
          <>
            <div className="space-y-2">
              <label className="font-[family-name:var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Group Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="za-field font-[family-name:var(--za-font-serif-body)]"
              />
              <label className="mt-3 block font-[family-name:var(--za-font-display)] text-[length:var(--za-text-fine)] font-bold uppercase tracking-[0.06em] text-ink">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="za-field min-h-24 resize-y font-[family-name:var(--za-font-serif-body)]"
              />
              <button
                onClick={handleUpdate}
                disabled={pending}
                className="za-button za-button--primary text-xs disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </>
        )}

        <div>
          <h3 className="font-[family-name:var(--za-font-editorial)] text-xl text-ink">
            Members ({group.members.length})
          </h3>
          <div className="mt-2 space-y-2">
            {group.members.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-3 rounded-small border border-decorative bg-surface-subtle px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image}
                      alt={m.name}
                      className="h-8 w-8 shrink-0 rounded-small border border-required object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-small border border-required bg-surface font-[family-name:var(--za-font-display)] text-xs uppercase text-ink">
                      {m.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 break-words font-[family-name:var(--za-font-serif-body)] text-sm text-ink">
                    {m.name}{' '}
                    <span className="font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] text-ink-muted">
                      @{m.username}
                    </span>
                  </span>
                  {m.role === 'owner' && (
                    <span className="inline-flex items-center gap-1 rounded-small border border-accent bg-accent-soft px-1.5 py-0.5 font-[family-name:var(--za-font-mono)] text-[length:var(--za-text-fine)] font-bold uppercase text-accent">
                      <Crown size={10} /> Owner
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {isOwner && m.userId !== currentUserId && (
                    <>
                      <button
                        onClick={() => handleTransfer(m.userId)}
                        disabled={pending}
                        className="za-button za-button--tertiary text-[length:var(--za-text-fine)] disabled:opacity-50"
                        title="Transfer ownership"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => handleKick(m.userId)}
                        disabled={pending}
                        className="za-button za-button--tertiary text-[length:var(--za-text-fine)] disabled:opacity-50"
                        title="Kick member"
                      >
                        <UserMinus size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-decorative pt-4">
          {!isOwner ? (
            <button
              onClick={handleLeave}
              disabled={pending}
              className="za-button za-button--secondary w-full inline-flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
            >
              <LogOut size={14} /> Leave Group
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={pending}
              className="za-button za-button--destructive w-full text-xs disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete Group
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
