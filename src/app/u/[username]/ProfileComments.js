'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, Trash2, Lock } from 'lucide-react';
import { createProfileComment, deleteProfileComment } from '@/app/dashboard/actions';
import { MAX_COMMENT_LENGTH, COMMENT_TTL_MS } from '@/lib/constants';
import { relativeTime } from '@/lib/format';
import styles from '@/app/dashboard/dashboard.module.css';

const MENTION_SPLIT = /(@[a-z0-9_-]{1,30})/gi;
const DAY_MS = 24 * 60 * 60 * 1000;

function expiryLabel(iso) {
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  const days = Math.ceil(remaining / DAY_MS);
  return days <= 1 ? 'expires soon' : `expires in ${days}d`;
}

function MentionText({ body, viewerUsername }) {
  const parts = String(body || '').split(MENTION_SPLIT);

  return (
    <p className={styles.commentBody}>
      {parts.map((part, index) => {
        const match = part.match(/^@([a-z0-9_-]{1,30})$/i);
        if (!match) {
          return <span key={index}>{part}</span>;
        }
        const handle = match[1].toLowerCase();
        const isSelf = handle === viewerUsername;
        return (
          <Link
            key={index}
            href={`/u/${handle}`}
            className={`${styles.mentionLink}${isSelf ? ` ${styles.mentionSelf}` : ''}`}
            title={isSelf ? 'You were mentioned' : `@${handle}'s archive`}
          >
            @{handle}
          </Link>
        );
      })}
    </p>
  );
}

export default function ProfileComments({ profileUser, initialComments = [], viewer }) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
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
    } catch (err) {
      setComments((list) => list.filter((c) => c.id !== tempId));
      setDraft(body);
      setError(err.message || 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    const snapshot = comments;
    setComments((list) => list.filter((c) => c.id !== commentId));
    try {
      await deleteProfileComment(commentId);
    } catch (err) {
      setComments(snapshot);
      setError(err.message || 'Failed to delete comment');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section className={`za-card ${styles.guestbookCard}`} aria-label={`Guestbook for @${profileUser.username}`}>
      <header className={styles.guestbookHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageCircle size={16} aria-hidden="true" />
          <h2 className={styles.guestbookTitle}>Guestbook</h2>
          <span className={styles.guestbookCount}>{comments.length}</span>
        </div>
        <span className={styles.guestbookHint}>comments disappear after 7 days</span>
      </header>

      {error && (
        <div className={styles.errorMessage} role="alert" style={{ margin: '0 var(--za-space-4)' }}>
          {error}
        </div>
      )}

      {comments.length > 0 ? (
        <ol ref={listRef} className={styles.commentList}>
          {comments.map((comment) => {
            const canDelete = isOwner || comment.authorId === viewer?.id;
            const initials = (comment.authorName || comment.authorUsername || '??')
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 2)
              .toUpperCase();

            return (
              <li key={comment.id} className={styles.commentRow}>
                {comment.authorImage ? (
                  <img src={comment.authorImage} alt="" className={styles.commentAvatar} loading="lazy" />
                ) : (
                  <span className={styles.commentAvatar} aria-hidden="true">{initials}</span>
                )}
                <div className={styles.commentMain}>
                  <div className={styles.commentMetaRow}>
                    <Link href={`/u/${comment.authorUsername}`} className={styles.commentAuthor}>
                      @{comment.authorUsername}
                    </Link>
                    <span className={styles.commentTime} title={new Date(comment.createdAt).toLocaleString()}>
                      {relativeTime(comment.createdAt)}
                    </span>
                    <span
                      className={`${styles.commentExpiry}${comment._pending ? ` ${styles.commentPending}` : ''}`}
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
                    className={styles.commentDeleteBtn}
                    onClick={() => handleDelete(comment.id)}
                    aria-label={`Delete comment by @${comment.authorUsername}`}
                    title={isOwner && comment.authorId !== viewer.id ? 'Owner: remove comment' : 'Delete comment'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.guestbookEmpty}>No comments yet. Break the silence.</p>
      )}

      <footer className={styles.guestbookComposerZone}>
        {!viewer?.isLoggedIn ? (
          <p className={styles.guestbookNotice}>
            <Link href="/login" className="za-link">Log in</Link> to join the conversation.
          </p>
        ) : !viewer.isPublic ? (
          <p className={styles.guestbookNotice}>
            <Lock size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
            Make your own archive{' '}
            <Link href="/dashboard" className="za-link">public in settings</Link>{' '}
            to comment here.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className={styles.commentForm}>
            <textarea
              className={styles.commentInput}
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder={`Leave a note for @${profileUser.username}… use @name to mention someone`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              aria-label="Write a comment"
            />
            <div className={styles.commentFormFooter}>
              <span className={styles.charCounter}>{draft.length}/{MAX_COMMENT_LENGTH}</span>
              <span className={styles.composerHint}>Enter to post · Shift+Enter for newline</span>
              <button type="submit" className="za-button za-button--primary" disabled={isSubmitting || !draft.trim()}>
                {isSubmitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        )}
      </footer>
    </section>
  );
}
