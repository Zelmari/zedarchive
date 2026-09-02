'use client';

import { useState, useTransition } from 'react';
import { Send, Clock, Trash2 } from 'lucide-react';
import type { GroupMessageItem } from '@/types/groups';
import { sendGroupMessageAction, deleteGroupMessageAction } from '@/server/groups';
import { renderInlineMarkdown } from '@/lib/markdown';

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${mins}m left`;
}

export default function GroupChatView({
  groupId,
  initialMessages,
  isOwner,
  onUpdate,
}: {
  groupId: string;
  initialMessages: GroupMessageItem[];
  isOwner: boolean;
  onUpdate: (msgs: GroupMessageItem[]) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSend = () => {
    if (!body.trim()) return;
    const text = body.trim();
    setError(null);
    startTransition(async () => {
      try {
        const newMsg = await sendGroupMessageAction({ groupId, body: text });
        const updated = [...messages, newMsg as GroupMessageItem];
        setMessages(updated);
        onUpdate(updated);
        setBody('');
      } catch (e: any) {
        setError(e.message || 'Failed to send');
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this message?')) return;
    startTransition(async () => {
      try {
        await deleteGroupMessageAction({ messageId: id });
        const updated = messages.filter((m) => m.id !== id);
        setMessages(updated);
        onUpdate(updated);
      } catch (e: any) {
        setError(e.message || 'Failed to delete');
      }
    });
  };

  // Sync when parent updates

  if (initialMessages !== messages && initialMessages.length !== messages.length) {
    // simple effect via render: update if parent has new poll data
    // We check by id set diff
    const ids = new Set(messages.map((m) => m.id));
    const hasNew = initialMessages.some((m) => !ids.has(m.id));
    if (hasNew) {
      setMessages(initialMessages);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="za-notice za-notice--error font-[var(--za-font-serif-body)] text-sm">
          {error}
        </div>
      )}

      <div className="za-bookplate min-h-[300px] max-h-[500px] space-y-4 overflow-y-auto p-5 sm:p-6">
        {messages.length === 0 ? (
          <div className="py-12 text-center font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
            No messages yet. Start the conversation — messages expire in 7 days.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] border-l-2 px-4 py-3 ${
                  msg.isOwn
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-decorative bg-surface-subtle text-ink'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--za-text-fine)] text-ink-muted">
                  {msg.senderImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.senderImage}
                      alt={msg.senderName}
                      className="h-6 w-6 rounded-small border border-required object-cover"
                    />
                  ) : null}
                  <span className="font-[var(--za-font-display)] font-bold uppercase tracking-[0.05em] text-ink">
                    @{msg.senderUsername || msg.senderName}
                  </span>
                  <time
                    dateTime={msg.createdAt}
                    className="font-[var(--za-font-mono)] uppercase tracking-[0.04em]"
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <span className="inline-flex items-center gap-1 font-[var(--za-font-mono)] uppercase tracking-[0.02em] text-ink-faint">
                    <Clock size={10} /> {timeLeft(msg.expiresAt)}
                  </span>
                  {(msg.isOwn || isOwner) && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="za-button za-button--tertiary ml-auto min-h-0 p-1"
                      title="Delete"
                      aria-label="Delete message"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <div className="break-words font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)]">
                  {/* Render markdown with spoiler support via shared markdown renderer */}
                  <span>{renderInlineMarkdown(msg.body)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          maxLength={2000}
          placeholder="Write a message… use ||spoiler|| for spoilers, **bold**, *italic*"
          className="za-field flex-1 font-[var(--za-font-serif-body)]"
          disabled={pending}
        />
        <button
          onClick={handleSend}
          disabled={pending || !body.trim()}
          className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
        >
          <Send size={14} /> Send
        </button>
      </div>
      <div className="flex flex-wrap justify-between gap-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.04em] text-ink-faint">
        <span>Messages auto-purge after 7 days.</span>
        <span>{body.length}/2000</span>
      </div>
    </div>
  );
}
