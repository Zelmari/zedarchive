'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, Trash2, Lock } from 'lucide-react';
import { createProfileComment, deleteProfileComment } from '@/server/comments';
import { MAX_COMMENT_LENGTH, COMMENT_TTL_MS } from '@/lib/constants';
import { relativeTime } from '@/lib/format';

const MENTION_SPLIT = /(@[a-z0-9_-]{1,30})/gi;
const DAY_MS = 24 * 60 * 60 * 1000;

function expiryLabel(iso: string) {
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  const days = Math.ceil(remaining / DAY_MS);
  return days <= 1 ? 'expires soon' : `expires in ${days}d`;
}

function MentionText({
  body,
  viewerUsername,
}: {
  body: string;
  viewerUsername: string | null | undefined;
}) {
  const parts = String(body || '').split(MENTION_SPLIT);

  return (
    <p className="m-0 [overflow-wrap:anywhere] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink">
      {parts.map((part, index) => {
        const match = part.match(/^@([a-z0-9_-]{1,30})$/i);
        if (!match) {
          return <span key={index}>{part}</span>;
        }
        const handle = match[1]?.toLowerCase() ?? '';
        const isSelf = handle === viewerUsername;
        return (
          <Link
            key={index}
            href={`/u/${handle}`}
            className={`za-link${isSelf ? ` font-[var(--za-weight-emphasis)] underline decoration-accent-soft` : ''}`}
            title={isSelf ? 'You were mentioned' : `@${handle}'s archive`}
          >
            @{handle}
          </Link>
        );
      })}
    </p>
  );
}

interface ProfileCommentRow {
  id: string;
  authorUsername: string | null;
  profileUserId?: string;
  authorId?: string | null;
  authorName?: string | null;
  authorImage?: string | null;
  body: string;
  createdAt: string;
  expiresAt: string;
  _pending?: boolean;
}

interface ProfileCommentsProps {
  profileUser: { id: string; username: string | null; [key: string]: unknown };
  initialComments?: ProfileCommentRow[];
  viewer: {
    isLoggedIn: boolean;
    id: string | null;
    username: string | null;
    name?: string | null;
    image?: string | null;
    isPublic: boolean;
    [key: string]: unknown;
  };
}

export default function ProfileComments({
  profileUser,
  initialComments = [],
  viewer,
}: ProfileCommentsProps) {
  const [comments, setComments] = useState<ProfileCommentRow[]>(initialComments);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLOListElement | null>(null);
  const [, setTick] = useState(0);

  // Keep relative timestamps and expiry countdowns fresh.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const scrollToListBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToListBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canComment = Boolean(viewer?.isLoggedIn && viewer?.isPublic);
  const isOwner = Boolean(viewer?.isLoggedIn && viewer?.id === profileUser.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ProfileCommentRow = {
      id: tempId,
      profileUserId: profileUser.id,
      authorId: viewer.id,
      authorUsername: viewer.username,
      authorName: viewer.name,
      authorImage: viewer.image || null,
      body,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + COMMENT_TTL_MS).toISOString(),
      _pending: true,
    };
    setComments((list) => [...list, optimistic]);
    setDraft('');
    requestAnimationFrame(scrollToListBottom);

    try {
      const saved = await createProfileComment(profileUser.id, body);
      setComments((list) => list.map((c) => (c.id === tempId ? saved : c)));
    } catch (err: unknown) {
      setComments((list) => list.filter((c) => c.id !== tempId));
      setDraft(body);
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const snapshot = comments;
    setComments((list) => list.filter((c) => c.id !== commentId));
    try {
      await deleteProfileComment(commentId);
    } catch (err: unknown) {
      setComments(snapshot);
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section
      className={`za-card rounded-layered border border-required bg-surface shadow-raised`}
      aria-label={`Guestbook for @${profileUser.username}`}
    >
      <header className="flex items-center justify-between border-b border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageCircle size={16} aria-hidden="true" />
          <h2 className="text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] text-ink">
            Guestbook
          </h2>
          <span className="text-[length:var(--za-text-fine)] text-ink-muted">
            {comments.length}
          </span>
        </div>
        <span className="text-[length:var(--za-text-fine)] text-ink-muted">
          comments disappear after 7 days
        </span>
      </header>

      {error && (
        <div
          className="rounded-small border border-danger bg-danger-surface px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-danger"
          role="alert"
          style={{ margin: '0 var(--za-space-4)' }}
        >
          {error}
        </div>
      )}

      {comments.length > 0 ? (
        <ol
          ref={listRef}
          className="m-0 flex max-h-96 list-none flex-col gap-[var(--za-space-3)] overflow-y-auto px-[var(--za-space-6)] py-[var(--za-space-4)]"
        >
          {comments.map((comment) => {
            const canDelete = isOwner || comment.authorId === viewer?.id;
            const initials = (comment.authorName || comment.authorUsername || '??')
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 2)
              .toUpperCase();

            return (
              <li key={comment.id} className="flex items-start gap-[var(--za-space-3)]">
                {comment.authorImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL / remote avatars, unoptimized by design
                  <img
                    src={comment.authorImage}
                    alt=""
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-small bg-[var(--za-color-title-tile)] text-xs font-bold text-[var(--za-color-title-tile-text)]"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-small bg-[var(--za-color-title-tile)] text-xs font-bold text-[var(--za-color-title-tile-text)]"
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-[0.15rem] flex flex-wrap items-baseline gap-2">
                    {comment.authorUsername ? (
                      <Link
                        href={`/u/${comment.authorUsername}`}
                        className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink hover:underline"
                      >
                        @{comment.authorUsername}
                      </Link>
                    ) : (
                      <span className="text-[length:var(--za-text-fine)] font-[var(--za-weight-emphasis)] text-ink">
                        {comment.authorName || 'Anonymous'}
                      </span>
                    )}
                    <span
                      className="text-[length:var(--za-text-fine)] text-ink-muted"
                      title={new Date(comment.createdAt).toLocaleString()}
                    >
                      {relativeTime(comment.createdAt)}
                    </span>
                    <span
                      className={`text-[length:var(--za-text-fine)] text-ink-muted opacity-80${comment._pending ? ` italic` : ''}`}
                      title={new Date(comment.expiresAt).toLocaleString()}
                    >
                      · {expiryLabel(comment.expiresAt)}
                    </span>
                  </div>
                  <MentionText body={comment.body} viewerUsername={viewer?.username} />
                </div>
                {canDelete && !comment._pending && (
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-small border-none bg-transparent p-1 text-ink-muted hover:text-danger"
                    onClick={() => handleDelete(comment.id)}
                    aria-label={`Delete comment by ${comment.authorUsername ? `@${comment.authorUsername}` : comment.authorName || 'Anonymous'}`}
                    title={
                      isOwner && comment.authorId !== viewer.id
                        ? 'Owner: remove comment'
                        : 'Delete comment'
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-[var(--za-space-6)] py-[var(--za-space-6)] text-center text-[length:var(--za-text-fine)] text-ink-muted">
          No comments yet. Break the silence.
        </p>
      )}

      <footer className="border-t border-decorative px-[var(--za-space-6)] py-[var(--za-space-4)]">
        {!viewer?.isLoggedIn ? (
          <p className="rounded-small border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-ink-muted">
            <Link href="/login" className="za-link">
              Log in
            </Link>{' '}
            to join the conversation.
          </p>
        ) : !viewer.isPublic ? (
          <p className="rounded-small border border-decorative bg-surface-subtle px-[var(--za-space-3)] py-2 text-[length:var(--za-text-fine)] text-ink-muted">
            <Lock size={13} aria-hidden="true" className="-mb-0.5 mr-1 inline-block" />
            Make your own archive{' '}
            <Link href="/dashboard" className="za-link">
              public in settings
            </Link>{' '}
            to comment here.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              className="w-full rounded-control border border-required bg-surface px-[var(--za-space-3)] py-2 text-[length:var(--za-text-supporting)] text-ink focus:border-accent focus:outline-none"
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder={`Leave a note for @${profileUser.username}… use @name to mention someone`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              aria-label="Write a comment"
            />
            <div className="flex items-center justify-between gap-[var(--za-space-3)]">
              <span className="text-[length:var(--za-text-fine)] text-ink-muted">
                {draft.length}/{MAX_COMMENT_LENGTH}
              </span>
              <span className="text-[length:var(--za-text-fine)] text-ink-muted">
                Enter to post · Shift+Enter for newline
              </span>
              <button
                type="submit"
                className="za-button za-button--primary"
                disabled={isSubmitting || !draft.trim()}
              >
                {isSubmitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        )}
      </footer>
    </section>
  );
}
