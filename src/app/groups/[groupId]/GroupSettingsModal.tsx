'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, UserMinus, LogOut, Trash2, UserPlus } from 'lucide-react';
import type { GroupDetails } from '@/types/groups';
import {
  addGroupMembersAction,
  kickGroupMemberAction,
  transferGroupOwnershipAction,
  leaveGroupAction,
  deleteGroupAction,
  updateGroupAction,
} from '@/server/groups';

export default function GroupSettingsModal({
  group,
  currentUserId,
  eligibleFriends,
  onClose,
}: {
  group: GroupDetails;
  currentUserId: string;
  eligibleFriends: { id: string; name: string; username: string | null; image: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isOwner = group.isOwner;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
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

  const handleAddMembers = () => {
    if (selectedToAdd.length === 0) return;
    startTransition(async () => {
      try {
        await addGroupMembersAction({ groupId: group.id, userIds: selectedToAdd });
        setMsg('Members added');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-control border border-required bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-[var(--za-weight-heading)] text-ink">Group Settings</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>

        {msg && (
          <div className="mb-3 rounded-small border border-decorative bg-surface-subtle px-3 py-2 text-xs text-ink">
            {msg}
          </div>
        )}

        <div className="space-y-6">
          {isOwner && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink">Group Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
                <label className="text-xs font-medium text-ink mt-2 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
                <button
                  onClick={handleUpdate}
                  disabled={pending}
                  className="za-button za-button--primary text-xs disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>

              <div>
                <h3 className="text-sm font-medium text-ink flex items-center gap-1.5">
                  <UserPlus size={14} /> Add Members (friends only)
                </h3>
                {eligibleFriends.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">No eligible friends to invite.</p>
                ) : (
                  <>
                    <div className="mt-2 max-h-32 overflow-y-auto rounded-small border border-decorative bg-surface-subtle p-2 space-y-1">
                      {eligibleFriends.map((f) => (
                        <label
                          key={f.id}
                          className="flex items-center gap-2 px-2 py-1 rounded-small hover:bg-surface cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedToAdd.includes(f.id)}
                            onChange={(e) => {
                              setSelectedToAdd((prev) =>
                                e.target.checked ? [...prev, f.id] : prev.filter((x) => x !== f.id),
                              );
                            }}
                          />
                          <span className="text-xs text-ink">
                            {f.name} <span className="text-ink-muted">@{f.username}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={handleAddMembers}
                      disabled={pending || selectedToAdd.length === 0}
                      className="za-button za-button--primary mt-2 text-xs disabled:opacity-50"
                    >
                      Add Selected
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div>
            <h3 className="text-sm font-medium text-ink">Members ({group.members.length})</h3>
            <div className="mt-2 space-y-2">
              {group.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-small border border-decorative bg-surface-subtle px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image}
                        alt={m.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface border border-decorative text-xs">
                        {m.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="text-xs text-ink">
                      {m.name} <span className="text-ink-muted">@{m.username}</span>
                    </span>
                    {m.role === 'owner' && (
                      <span className="inline-flex items-center gap-1 rounded-small bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">
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
                          className="rounded-small border border-decorative px-2 py-1 text-[11px] text-ink hover:bg-surface disabled:opacity-50"
                          title="Transfer ownership"
                        >
                          Transfer
                        </button>
                        <button
                          onClick={() => handleKick(m.userId)}
                          disabled={pending}
                          className="rounded-small border border-decorative px-2 py-1 text-[11px] text-ink hover:bg-surface disabled:opacity-50"
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

          <div className="border-t border-decorative pt-4 space-y-2">
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
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-small bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete Group
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
