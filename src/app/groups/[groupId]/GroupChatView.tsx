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
        <div className="rounded-small border border-decorative bg-surface-subtle px-3 py-2 text-xs text-ink">
          {error}
        </div>
      )}

      <div className="za-card rounded-control border border-decorative bg-surface p-4 min-h-[300px] max-h-[500px] overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">
            No messages yet. Start the conversation — messages expire in 7 days.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-control border px-3 py-2 text-sm shadow-xs ${
                  msg.isOwn
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-surface-subtle border-decorative text-ink'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-75">
                  {msg.senderImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.senderImage}
                      alt={msg.senderName}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : null}
                  <span className="font-medium">@{msg.senderUsername || msg.senderName}</span>
                  <span>
                    ·{' '}
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={10} /> {timeLeft(msg.expiresAt)}
                  </span>
                  {(msg.isOwn || isOwner) && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="ml-1 p-0.5 rounded hover:bg-current/10 transition-colors"
                      title="Delete"
                      aria-label="Delete message"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <div className="leading-relaxed text-xs break-words">
                  {/* Render markdown with spoiler support via shared markdown renderer */}
                  <span>{renderInlineMarkdown(msg.body)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
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
          className="flex-1 rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          disabled={pending}
        />
        <button
          onClick={handleSend}
          disabled={pending || !body.trim()}
          className="za-button za-button--primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send size={14} /> Send
        </button>
      </div>
      <div className="text-[11px] text-ink-muted">
        Messages auto-purge after 7 days. {body.length}/2000
      </div>
    </div>
  );
}
