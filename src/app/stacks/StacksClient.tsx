'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Layers,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import ConfirmModal from '@/components/modals/ConfirmModal';
import MediaCover from '@/components/cards/MediaCover';
import {
  addStackItemAction,
  createStackAction,
  deleteStackAction,
  removeStackItemAction,
  reorderStackItemsAction,
  type StackWithItems,
  updateStackItemAnnotationAction,
} from '@/server/stacks';
import type { MediaEntry } from '@/types/media';

interface StacksClientProps {
  initialStacks: StackWithItems[];
  initialMediaEntries?: MediaEntry[];
  username: string;
}

type StackItem = StackWithItems['items'][number];

type ConfirmRequest =
  | { type: 'stack'; stackId: string; title: string }
  | { type: 'item'; stackId: string; itemId: string; title: string };

const CATEGORY_LABELS: Record<MediaEntry['category'], string> = {
  show: 'Television',
  movie: 'Film',
  book: 'Novel',
  anime: 'Anime',
  manga: 'Manga',
};

const STATUS_LABELS: Record<MediaEntry['status'], string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  planning: 'Planning',
  on_hold: 'On hold',
  dropped: 'Dropped',
};

function getMediaMeta(entry: MediaEntry | null): string {
  if (!entry) return 'Catalogue entry unavailable';

  const category = CATEGORY_LABELS[entry.category];
  const status = STATUS_LABELS[entry.status];
  const progress =
    entry.category === 'movie'
      ? entry.secondaryUnitTotal
        ? `${entry.secondaryUnitCurrent}/${entry.secondaryUnitTotal} min`
        : `${entry.secondaryUnitCurrent} min logged`
      : entry.category === 'book' || entry.category === 'manga'
        ? `Vol ${entry.primaryUnitCurrent} · ${entry.secondaryUnitCurrent}${entry.secondaryUnitTotal ? `/${entry.secondaryUnitTotal}` : ''} chapters`
        : `S${entry.primaryUnitCurrent} · ${entry.secondaryUnitCurrent}${entry.secondaryUnitTotal ? `/${entry.secondaryUnitTotal}` : ''} episodes`;

  return [category, status, progress, entry.rating ? `Rated ${entry.rating}/10` : null]
    .filter(Boolean)
    .join(' · ');
}

function getStackPath(username: string, slug: string): string {
  return `/u/${username}/stacks/${slug}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function StacksClient({
  initialStacks,
  initialMediaEntries = [],
  username,
}: StacksClientProps) {
  const [stacks, setStacks] = useState<StackWithItems[]>(initialStacks);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<Record<string, string>>({});
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [copiedStackId, setCopiedStackId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Give this anthology a title before saving.');
      return;
    }

    setPendingKey('create');
    setError(null);
    try {
      const created = await createStackAction({
        title: cleanTitle,
        description: description.trim() || null,
        isPublic,
      });
      setStacks((current) => [created, ...current]);
      setTitle('');
      setDescription('');
      setIsCreating(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create stack.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleDeleteStack = async (stackId: string) => {
    setPendingKey(`delete-stack-${stackId}`);
    setError(null);
    try {
      await deleteStackAction(stackId);
      setStacks((current) => current.filter((stack) => stack.id !== stackId));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete stack.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleAddItem = async (stack: StackWithItems) => {
    const mediaId = selectedMedia[stack.id];
    const media = initialMediaEntries.find((entry) => entry.id === mediaId);
    if (!mediaId || !media) {
      setError('Choose a title from your library first.');
      return;
    }

    setPendingKey(`add-${stack.id}`);
    setError(null);
    try {
      const inserted = await addStackItemAction({
        stackId: stack.id,
        mediaId,
      });
      const newItem: StackItem = {
        id: inserted.id,
        mediaId: inserted.mediaId,
        orderIndex: inserted.orderIndex,
        annotation: inserted.annotation,
        media,
      };
      setStacks((current) =>
        current.map((currentStack) =>
          currentStack.id === stack.id
            ? { ...currentStack, items: [...currentStack.items, newItem] }
            : currentStack,
        ),
      );
      setSelectedMedia((current) => ({ ...current, [stack.id]: '' }));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add title to stack.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleRemoveItem = async (stackId: string, itemId: string) => {
    setPendingKey(`remove-${itemId}`);
    setError(null);
    try {
      await removeStackItemAction({ stackId, itemId });
      setStacks((current) =>
        current.map((stack) =>
          stack.id === stackId
            ? { ...stack, items: stack.items.filter((item) => item.id !== itemId) }
            : stack,
        ),
      );
      setAnnotationDrafts((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to remove title from stack.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleMoveItem = async (stackId: string, itemId: string, direction: -1 | 1) => {
    const stack = stacks.find((candidate) => candidate.id === stackId);
    if (!stack) return;

    const itemIndex = stack.items.findIndex((item) => item.id === itemId);
    const nextIndex = itemIndex + direction;
    if (itemIndex < 0 || nextIndex < 0 || nextIndex >= stack.items.length) return;

    const reorderedItems = [...stack.items];
    const [item] = reorderedItems.splice(itemIndex, 1);
    if (!item) return;
    reorderedItems.splice(nextIndex, 0, item);
    const orderedItems = reorderedItems.map((orderedItem, index) => ({
      ...orderedItem,
      orderIndex: index,
    }));
    const orderedIds = orderedItems.map((orderedItem) => orderedItem.id);
    const pendingReorderKey = `reorder-${stackId}`;

    setStacks((current) =>
      current.map((currentStack) =>
        currentStack.id === stackId ? { ...currentStack, items: orderedItems } : currentStack,
      ),
    );
    setPendingKey(pendingReorderKey);
    setError(null);

    try {
      await reorderStackItemsAction({ stackId, orderedIds });
    } catch (err) {
      setStacks((current) =>
        current.map((currentStack) =>
          currentStack.id === stackId ? { ...currentStack, items: stack.items } : currentStack,
        ),
      );
      setError(getErrorMessage(err, 'Failed to reorder stack.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleSaveAnnotation = async (stackId: string, item: StackItem) => {
    const draft = annotationDrafts[item.id] ?? item.annotation ?? '';
    const annotation = draft.trim() || null;
    if (annotation === item.annotation) return;

    setPendingKey(`annotation-${item.id}`);
    setError(null);
    try {
      const updated = await updateStackItemAnnotationAction({
        stackId,
        itemId: item.id,
        annotation,
      });
      setStacks((current) =>
        current.map((stack) =>
          stack.id === stackId
            ? {
                ...stack,
                items: stack.items.map((currentItem) =>
                  currentItem.id === item.id
                    ? { ...currentItem, annotation: updated.annotation }
                    : currentItem,
                ),
              }
            : stack,
        ),
      );
      setAnnotationDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save curator note.'));
    } finally {
      setPendingKey(null);
    }
  };

  const handleCopyStackUrl = async (stack: StackWithItems) => {
    const path = getStackPath(username, stack.slug);
    const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;

    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(url);
      setCopiedStackId(stack.id);
      window.setTimeout(() => {
        setCopiedStackId((current) => (current === stack.id ? null : current));
      }, 2000);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not copy the public URL. You can copy it manually.'));
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-small border border-danger bg-danger-surface px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="za-button za-button--primary inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.04em]"
        >
          <Plus size={14} /> Create New Stack
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="za-bookplate border-2 border-required bg-surface p-5 shadow-raised sm:p-8"
        >
          <div className="mb-5 border-b border-decorative pb-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              New folio
            </span>
            <h2 className="mt-1 font-[var(--za-font-display)] text-lg font-semibold uppercase tracking-[0.05em] text-ink">
              New Anthology Stack
            </h2>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-ink" htmlFor="new-stack-title">
              Title
            </label>
            <input
              id="new-stack-title"
              type="text"
              placeholder="e.g. Autumn Mystery Essentials"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="za-input w-full text-xs"
              required
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Intro Essay / Description
            </label>
            <textarea
              placeholder="Why these titles belong together..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="za-input w-full text-xs"
            />
          </div>
          <div className="mb-5 flex items-start gap-2">
            <input
              type="checkbox"
              id="stack-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-accent"
            />
            <div>
              <label htmlFor="stack-public" className="text-xs font-medium text-ink">
                Publish this anthology
              </label>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Public editions hide private titles automatically.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="za-button za-button--secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pendingKey === 'create'}
              className="za-button za-button--primary text-xs"
            >
              {pendingKey === 'create' ? 'Creating…' : 'Create Stack'}
            </button>
          </div>
        </form>
      )}

      {stacks.length === 0 ? (
        <div className="za-bookplate border border-dashed border-decorative bg-surface-subtle p-12 text-center text-xs text-ink-muted">
          <Layers size={32} className="mx-auto mb-3 text-accent opacity-60" />
          <p className="font-[var(--za-font-display)] text-sm font-semibold uppercase tracking-[0.05em] text-ink">
            No stacks created yet
          </p>
          <p className="mt-1">
            Create a working anthology, then arrange the titles and write the notes that give it
            meaning.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {stacks.map((stack) => (
            <article
              key={stack.id}
              className="za-bookplate border-2 border-required bg-surface p-5 shadow-raised sm:p-8"
            >
              <header className="border-b border-decorative pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                      Anthology · {stack.items.length.toString().padStart(2, '0')} titles
                    </span>
                    <h2 className="mt-2 font-[var(--za-font-display)] text-xl font-semibold leading-tight tracking-[0.03em] text-ink sm:text-2xl">
                      {stack.title}
                    </h2>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-small border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      stack.isPublic
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-decorative bg-surface-subtle text-ink-muted'
                    }`}
                  >
                    {stack.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                    {stack.isPublic ? 'Public edition' : 'Private working copy'}
                  </span>
                </div>
                {stack.description && (
                  <div className="mt-5 max-w-3xl border-l-2 border-required pl-4 font-[var(--za-font-editorial)] text-base italic leading-relaxed text-ink sm:text-lg">
                    “{stack.description}”
                  </div>
                )}
              </header>

              <div className="my-5 rounded-control border border-decorative bg-surface-subtle p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`stack-library-${stack.id}`}
                      className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted"
                    >
                      Add from your library
                    </label>
                    <select
                      id={`stack-library-${stack.id}`}
                      aria-label={`Add a title to ${stack.title}`}
                      value={selectedMedia[stack.id] ?? ''}
                      onChange={(e) =>
                        setSelectedMedia((current) => ({
                          ...current,
                          [stack.id]: e.target.value,
                        }))
                      }
                      disabled={
                        initialMediaEntries.length === 0 ||
                        initialMediaEntries.every((entry) =>
                          stack.items.some((item) => item.mediaId === entry.id),
                        ) ||
                        pendingKey === `add-${stack.id}`
                      }
                      className="za-input w-full text-xs"
                    >
                      <option value="" disabled>
                        {initialMediaEntries.length === 0
                          ? 'No titles in your library'
                          : initialMediaEntries.every((entry) =>
                                stack.items.some((item) => item.mediaId === entry.id),
                              )
                            ? 'Every title is already included'
                            : 'Choose a title…'}
                      </option>
                      {initialMediaEntries
                        .filter((entry) => !stack.items.some((item) => item.mediaId === entry.id))
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.title} · {CATEGORY_LABELS[entry.category]}
                            {entry.isPrivate ? ' · Private' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddItem(stack)}
                    disabled={!selectedMedia[stack.id] || pendingKey === `add-${stack.id}`}
                    className="za-button za-button--secondary inline-flex shrink-0 items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={13} />
                    {pendingKey === `add-${stack.id}` ? 'Adding…' : 'Attach title'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] italic text-ink-muted">
                  Private titles may be included here; they disappear from the public edition.
                </p>
              </div>

              {stack.items.length === 0 ? (
                <div className="border-y border-dashed border-decorative py-8 text-center text-xs text-ink-muted">
                  Attach a title above to begin this anthology.
                </div>
              ) : (
                <ol aria-label={`${stack.title} titles`} className="space-y-6">
                  {stack.items.map((item, index) => {
                    const mediaTitle = item.media?.title ?? 'Unavailable catalogue entry';
                    const annotation = annotationDrafts[item.id] ?? item.annotation ?? '';
                    const annotationPending = pendingKey === `annotation-${item.id}`;
                    const reorderPending = pendingKey === `reorder-${stack.id}`;

                    return (
                      <li
                        key={item.id}
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b border-dashed border-decorative pb-6 last:border-b-0 last:pb-0 sm:grid-cols-[3rem_7rem_minmax(0,1fr)] sm:gap-6"
                      >
                        <div className="font-[var(--za-font-display)] text-2xl font-semibold leading-none text-[var(--za-color-border-required)] sm:text-3xl">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <div className="col-start-2 row-start-1 w-28 sm:col-start-2">
                          <MediaCover
                            title={mediaTitle}
                            coverImage={item.media?.coverImage}
                            category={item.media?.category ?? 'show'}
                          />
                        </div>
                        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                                {getMediaMeta(item.media)}
                              </span>
                              <h3 className="mt-1 break-words font-[var(--za-font-display)] text-base font-semibold leading-tight text-ink sm:text-lg">
                                {mediaTitle}
                              </h3>
                            </div>
                            <div className="flex shrink-0 items-center gap-[var(--za-space-2)]">
                              <button
                                type="button"
                                onClick={() => void handleMoveItem(stack.id, item.id, -1)}
                                disabled={index === 0 || reorderPending}
                                className="za-button za-button--tertiary za-icon-hit p-0 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${mediaTitle} up`}
                                title="Move up"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleMoveItem(stack.id, item.id, 1)}
                                disabled={index === stack.items.length - 1 || reorderPending}
                                className="za-button za-button--tertiary za-icon-hit p-0 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${mediaTitle} down`}
                                title="Move down"
                              >
                                <ArrowDown size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmRequest({
                                    type: 'item',
                                    stackId: stack.id,
                                    itemId: item.id,
                                    title: mediaTitle,
                                  })
                                }
                                disabled={pendingKey === `remove-${item.id}`}
                                className="za-button za-button--tertiary za-icon-hit p-0 text-danger hover:border-danger hover:bg-danger-surface disabled:opacity-30"
                                aria-label={`Remove ${mediaTitle} from ${stack.title}`}
                                title="Remove from anthology"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <label
                            htmlFor={`annotation-${item.id}`}
                            className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted"
                          >
                            Curator&apos;s note · saves on blur
                          </label>
                          <textarea
                            id={`annotation-${item.id}`}
                            value={annotation}
                            onChange={(e) =>
                              setAnnotationDrafts((current) => ({
                                ...current,
                                [item.id]: e.target.value,
                              }))
                            }
                            onBlur={() => void handleSaveAnnotation(stack.id, item)}
                            rows={3}
                            maxLength={2000}
                            placeholder="Why does this title belong in the anthology?"
                            className="za-input mt-1 w-full resize-y text-sm leading-relaxed"
                            disabled={annotationPending}
                          />
                          <div className="mt-1 flex justify-end text-[10px] text-ink-muted">
                            {annotationPending ? 'Saving…' : `${annotation.length}/2000`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <footer className="mt-7 flex flex-col gap-3 border-t border-decorative pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                {stack.isPublic ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <Link
                      href={getStackPath(username, stack.slug)}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      Read public edition <ExternalLink size={12} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleCopyStackUrl(stack)}
                      className="inline-flex items-center gap-1 text-ink-muted hover:text-ink"
                    >
                      {copiedStackId === stack.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedStackId === stack.id ? 'Copied!' : 'Copy URL'}
                    </button>
                    <code className="max-w-full truncate text-[10px] text-ink-muted">
                      {getStackPath(username, stack.slug)}
                    </code>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-ink-muted">
                    <Lock size={12} /> Private anthology · public URL disabled
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setConfirmRequest({ type: 'stack', stackId: stack.id, title: stack.title })
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-ink-muted hover:text-danger"
                  disabled={pendingKey === `delete-stack-${stack.id}`}
                >
                  <Trash2 size={13} /> Delete stack
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(confirmRequest)}
        title={confirmRequest?.type === 'stack' ? 'Delete this anthology?' : 'Remove this title?'}
        message={
          confirmRequest?.type === 'stack'
            ? `“${confirmRequest.title}” and its curator notes will be permanently deleted.`
            : `Remove “${confirmRequest?.title ?? ''}” from this anthology?`
        }
        confirmText={confirmRequest?.type === 'stack' ? 'Delete Stack' : 'Remove Title'}
        cancelText="Keep It"
        variant="destructive"
        onConfirm={() => {
          if (!confirmRequest) return;
          const request = confirmRequest;
          setConfirmRequest(null);
          if (request.type === 'stack') {
            void handleDeleteStack(request.stackId);
          } else {
            void handleRemoveItem(request.stackId, request.itemId);
          }
        }}
        onCancel={() => setConfirmRequest(null)}
      />
    </div>
  );
}
