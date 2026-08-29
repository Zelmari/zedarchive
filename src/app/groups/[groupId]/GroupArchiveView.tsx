'use client';

import { useState, useTransition } from 'react';
import { Plus, Star } from 'lucide-react';
import type { MediaEntry } from '@/types/media';
import { createMediaEntry, updateMediaProgress, deleteMediaEntry } from '@/server/media';
import { getTileInitials } from '@/lib/format';
import { MarkdownNotes } from '@/lib/markdown';
import type { GroupDetails } from '@/types/groups';

export default function GroupArchiveView({
  group,
  initialMedia,
  currentUserId,
}: {
  group: GroupDetails;
  initialMedia: MediaEntry[];
  currentUserId: string;
}) {
  const [entries, setEntries] = useState(initialMedia);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'show' | 'movie' | 'book' | 'anime' | 'manga'>('show');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const handleAdd = () => {
    if (!title.trim()) {
      setMsg('Title is required');
      return;
    }
    startTransition(async () => {
      try {
        const created = await createMediaEntry({
          title: title.trim(),
          category,
          status: 'planning',
          groupId: group.id,
        });
        setEntries((prev) => [created, ...prev]);
        setTitle('');
        setShowAdd(false);
        setMsg('Added to group archive');
        setTimeout(() => setMsg(null), 2000);
      } catch (e: any) {
        setMsg(e.message || 'Failed to add');
      }
    });
  };

  const handleStep = (entry: MediaEntry, delta: number) => {
    const next = Math.max(0, (entry.secondaryUnitCurrent || 0) + delta);
    startTransition(async () => {
      try {
        const updated = await updateMediaProgress(entry.id, {
          secondaryUnitCurrent: next,
          groupId: group.id,
        });
        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } catch (e: any) {
        setMsg(e.message || 'Failed to update');
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this entry from group archive?')) return;
    startTransition(async () => {
      try {
        await deleteMediaEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } catch (e: any) {
        setMsg(e.message || 'Failed to delete');
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-control border-2 border-accent bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-small bg-accent px-2 py-1 text-xs font-bold text-on-accent">
            Shared Group Archive
          </span>
          <span className="text-sm font-medium text-ink">{group.name}</span>
          <span className="text-xs text-ink-muted">· {entries.length} titles · Collective</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          This is a shared archive. All members can add, step, rate, and annotate. Attribution chips
          show who contributed.
        </p>
      </div>

      {msg && (
        <div className="rounded-small border border-decorative bg-surface-subtle px-3 py-2 text-xs text-ink">
          {msg}
        </div>
      )}

      <div className="flex justify-between">
        <h3 className="text-sm font-medium text-ink">Group Catalog</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="za-button za-button--primary inline-flex items-center gap-1 text-xs"
        >
          <Plus size={14} /> Add Title
        </button>
      </div>

      {showAdd && (
        <div className="za-card rounded-control border border-decorative bg-surface p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Frieren, Dune)"
            className="w-full rounded-small border border-decorative bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="rounded-small border border-decorative bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="show">Show</option>
            <option value="anime">Anime</option>
            <option value="movie">Movie</option>
            <option value="book">Book</option>
            <option value="manga">Manga</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={pending}
            className="za-button za-button--primary text-xs disabled:opacity-50"
          >
            Add to Group
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="za-card rounded-control border border-dashed border-decorative bg-surface-subtle p-8 text-center text-sm text-ink-muted">
          Group archive is empty. Add titles via search or manually.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((item) => (
            <article
              key={item.id}
              className="za-card flex flex-col gap-3 rounded-control border border-decorative bg-surface p-4"
            >
              <div className="flex gap-3">
                <div className="relative h-20 w-14 flex-none overflow-hidden rounded-small border border-decorative bg-[var(--za-color-title-tile)]">
                  {item.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="za-title-tile flex h-full w-full items-center justify-center text-xs font-bold">
                      <span>{getTileInitials(item.title)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="truncate text-sm font-medium text-ink" title={item.title}>
                    {item.title}
                  </h4>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-small border border-decorative bg-surface-subtle px-1.5 py-0.5 text-[11px] text-ink-muted capitalize">
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.rating != null && (
                      <span className="inline-flex items-center gap-0.5 rounded-small border border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.12)] px-1.5 py-0.5 text-[11px] text-[#b45309]">
                        <Star size={10} fill="currentColor" /> {item.rating}/10
                      </span>
                    )}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-small bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent border border-accent/20">
                    Added by @{item.userId.slice(0, 6)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-decorative pt-2">
                <span className="text-xs text-ink-muted">
                  {item.category === 'movie'
                    ? `${item.secondaryUnitCurrent || 0}m`
                    : `Ep ${item.secondaryUnitCurrent || 0}${item.secondaryUnitTotal ? ` / ${item.secondaryUnitTotal}` : ''}`}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleStep(item, -1)}
                    className="rounded-small border border-decorative px-2 py-1 text-xs hover:bg-surface-subtle"
                  >
                    −
                  </button>
                  <button
                    onClick={() => handleStep(item, 1)}
                    className="rounded-small border border-decorative px-2 py-1 text-xs hover:bg-surface-subtle"
                  >
                    +
                  </button>
                </div>
              </div>
              {item.notes && (
                <div className="text-xs text-ink-muted">
                  <MarkdownNotes content={item.notes} />
                </div>
              )}
              <button
                onClick={() => handleDelete(item.id)}
                className="text-[11px] text-ink-muted hover:text-ink text-left"
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
