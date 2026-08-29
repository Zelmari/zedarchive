'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Globe, Lock, Layers, ExternalLink } from 'lucide-react';
import { createStackAction, deleteStackAction, type StackWithItems } from '@/server/stacks';

interface StacksClientProps {
  initialStacks: StackWithItems[];
  username: string;
}

export default function StacksClient({ initialStacks, username }: StacksClientProps) {
  const [stacks, setStacks] = useState<StackWithItems[]>(initialStacks);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      const created = await createStackAction({
        title,
        description,
        isPublic,
      });
      setStacks([created, ...stacks]);
      setTitle('');
      setDescription('');
      setIsCreating(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create stack');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stack?')) return;
    try {
      await deleteStackAction(id);
      setStacks(stacks.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete stack');
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="za-button za-button--primary flex items-center gap-1.5 text-xs"
        >
          <Plus size={14} /> Create New Stack
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-control border border-required bg-surface p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-ink">New Anthology Stack</h2>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-muted">Title</label>
            <input
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
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="stack-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <label htmlFor="stack-public" className="text-xs text-ink">
              Public Anthology (Shareable via URL)
            </label>
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
              disabled={isLoading}
              className="za-button za-button--primary text-xs"
            >
              {isLoading ? 'Creating...' : 'Create Stack'}
            </button>
          </div>
        </form>
      )}

      {stacks.length === 0 ? (
        <div className="rounded-control border border-dashed border-decorative bg-surface-subtle p-12 text-center text-xs text-ink-muted">
          <Layers size={32} className="mx-auto mb-2 opacity-50" />
          <p className="font-medium text-ink">No stacks created yet</p>
          <p className="mt-1">
            Group your favorite anime, series, and books into curated anthologies.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {stacks.map((stack) => (
            <div
              key={stack.id}
              className="za-card flex flex-col justify-between rounded-control border border-decorative bg-surface p-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink text-sm">{stack.title}</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    {stack.isPublic ? (
                      <span className="flex items-center gap-1 text-accent">
                        <Globe size={11} /> Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock size={11} /> Private
                      </span>
                    )}
                  </div>
                </div>
                {stack.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-ink-muted leading-relaxed">
                    {stack.description}
                  </p>
                )}
                <div className="mt-3 text-[11px] text-ink-muted">
                  {stack.items?.length || 0} title(s) in this stack
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-decorative/40 pt-3">
                {stack.isPublic ? (
                  <Link
                    href={`/u/${username}/stacks/${stack.slug}`}
                    target="_blank"
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    View Public Page <ExternalLink size={12} />
                  </Link>
                ) : (
                  <span className="text-xs text-ink-muted">Private</span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(stack.id)}
                  className="cursor-pointer text-ink-muted hover:text-red-500"
                  title="Delete Stack"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
