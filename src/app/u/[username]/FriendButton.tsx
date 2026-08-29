'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Check, Clock, UserCheck, UserX } from 'lucide-react';
import {
  sendFriendRequestAction,
  acceptFriendRequestAction,
  rejectFriendRequestAction,
  cancelFriendRequestAction,
  removeFriendAction,
} from '@/server/friends';

type Props = {
  targetUserId: string;
  initialStatus: string | null;
  initialIsSender: boolean | null;
  initialRequestId: string | null;
};

export default function FriendButton({
  targetUserId,
  initialStatus,
  initialIsSender,
  initialRequestId,
}: Props) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [isSender, setIsSender] = useState<boolean | null>(initialIsSender);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleAdd = () => {
    startTransition(async () => {
      try {
        const res = await sendFriendRequestAction({ targetUserId });
        setStatus('pending');
        setIsSender(true);
        setRequestId(res.id);
      } catch (e: any) {
        setMessage(e.message || 'Failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const handleAccept = () => {
    if (!requestId) return;
    startTransition(async () => {
      try {
        await acceptFriendRequestAction({ requestId });
        setStatus('accepted');
      } catch (e: any) {
        setMessage(e.message || 'Failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const handleReject = () => {
    if (!requestId) return;
    startTransition(async () => {
      try {
        await rejectFriendRequestAction({ requestId });
        setStatus(null);
        setIsSender(null);
        setRequestId(null);
      } catch (e: any) {
        setMessage(e.message || 'Failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const handleCancel = () => {
    if (!requestId) return;
    startTransition(async () => {
      try {
        await cancelFriendRequestAction({ requestId });
        setStatus(null);
        setIsSender(null);
        setRequestId(null);
      } catch (e: any) {
        setMessage(e.message || 'Failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const handleUnfriend = () => {
    if (!confirm('Remove this friend?')) return;
    startTransition(async () => {
      try {
        await removeFriendAction({ friendUserId: targetUserId });
        setStatus(null);
        setIsSender(null);
        setRequestId(null);
      } catch (e: any) {
        setMessage(e.message || 'Failed');
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  if (message) {
    return <div className="text-xs text-ink-muted">{message}</div>;
  }

  if (!status) {
    return (
      <button
        onClick={handleAdd}
        disabled={pending}
        className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs"
      >
        <UserPlus size={13} /> Add Friend
      </button>
    );
  }

  if (status === 'pending' && isSender) {
    return (
      <button
        onClick={handleCancel}
        disabled={pending}
        className="za-button za-button--secondary inline-flex items-center gap-1.5 text-xs"
      >
        <Clock size={13} /> Request Pending · Cancel
      </button>
    );
  }

  if (status === 'pending' && isSender === false) {
    return (
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={pending}
          className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs"
        >
          <Check size={13} /> Accept Request
        </button>
        <button
          onClick={handleReject}
          disabled={pending}
          className="za-button za-button--secondary inline-flex items-center gap-1.5 text-xs"
        >
          <XIcon /> Reject
        </button>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-small border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success">
          <UserCheck size={13} /> Friends ✓
        </span>
        <button
          onClick={handleUnfriend}
          disabled={pending}
          className="za-button za-button--tertiary inline-flex items-center gap-1 text-xs"
          title="Unfriend"
        >
          <UserX size={13} /> Unfriend
        </button>
      </div>
    );
  }

  return null;
}

function XIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
