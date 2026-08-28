import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getMyStacks } from '@/server/stacks';
import { Layers, Plus, ArrowLeft, Globe, Lock, BookOpen } from 'lucide-react';
import StacksClient from './StacksClient';

export const metadata = {
  title: 'Curated Stacks — zedarchive',
  description: 'Manage your thematic anthologies and custom media stacks.',
};

export default async function StacksPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const initialStacks = await getMyStacks();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-[var(--za-weight-heading)] text-ink">
            Curated Stacks & Anthologies
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            Thematic user-created collections (e.g. <em>&quot;Spooky Autumn Reads&quot;</em> or{' '}
            <em>&quot;Cyberpunk Anime Essentials&quot;</em>) with annotations and shareable cards.
          </p>
        </div>

        <StacksClient initialStacks={initialStacks} username={session.user.name || 'user'} />
      </div>
    </div>
  );
}
