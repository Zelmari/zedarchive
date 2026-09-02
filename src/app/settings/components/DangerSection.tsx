'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { deleteAccount } from '@/server/account';
import { signOut } from '@/lib/client/auth-client';

interface DangerSectionProps {
  email: string;
}

export default function DangerSection({ email }: DangerSectionProps) {
  const router = useRouter();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeleting(true);
    setDeleteError('');

    try {
      const res = await deleteAccount({
        password: deletePassword,
      });

      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete account.');
        setIsDeleting(false);
        return;
      }

      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <section className="za-bookplate relative p-6 sm:p-8">
        <span className="za-ribbon-bookmark" aria-hidden="true" />
        <div className="mb-3 flex items-center gap-2">
          <Trash2 size={18} className="text-danger" />
          <h2 className="font-[var(--za-font-display)] text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.06em] text-danger">
            Danger Zone
          </h2>
        </div>

        <p className="mb-4 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
          Permanently delete your ZedArchive account and all your tracked media entries, progress,
          comments, and public profile data. This operation is immediately destructive and cannot be
          undone.
        </p>

        <button
          type="button"
          onClick={() => {
            setDeleteError('');
            setIsDeleteModalOpen(true);
          }}
          className="za-button za-button--destructive text-xs"
        >
          Delete My Account
        </button>
      </section>

      {isDeleteModalOpen && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
          title="Confirm Account Deletion"
          labelledBy="delete-account-modal-title"
          contentClassName="max-w-[28rem]"
        >
          <form onSubmit={handleDeleteAccount} className="p-6">
            <div className="mb-4 flex items-center gap-3 text-danger">
              <AlertTriangle size={24} />
              <h3 className="text-sm font-[var(--za-weight-heading)]">
                Permanent Account Deletion
              </h3>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-ink-muted">
              You are about to permanently delete your account (<strong>{email}</strong>). All media
              entries and activity records will be deleted immediately.
            </p>

            {deleteError && (
              <div className="za-notice za-notice--error mb-4 text-xs" role="alert">
                {deleteError}
              </div>
            )}

            <div className="mb-4">
              <label
                htmlFor="delete-account-password"
                className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink"
              >
                Enter your current password to confirm:
              </label>
              <input
                id="delete-account-password"
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="za-field w-full"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="za-button za-button--secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeleting}
                className="za-button za-button--destructive text-xs"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
