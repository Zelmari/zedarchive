import { getMyStacks } from '@/server/stacks';
import { getMediaEntries } from '@/server/media';
import { requireSession } from '@/server/internal';
import { Layers } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import StacksClient from './StacksClient';

export const metadata = {
  title: 'Curated Stacks — zedarchive',
  description: 'Manage your thematic anthologies and custom media stacks.',
};

export default async function StacksPage() {
  const session = await requireSession();

  const [initialStacks, initialMediaEntries] = await Promise.all([
    getMyStacks(),
    getMediaEntries(),
  ]);
  const username = session.username;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{ href: '/dashboard', label: 'Dashboard' }}
        breadcrumbs={[{ label: 'Curated Stacks' }]}
        navItems={[{ label: 'Dashboard', href: '/dashboard', icon: Layers }]}
      />
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container max-w-5xl">
          <div className="mb-10 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Curated collections
            </span>
            <h1 className="mt-2 font-[var(--za-font-display)] text-2xl font-semibold uppercase tracking-[0.08em] text-ink sm:text-3xl">
              Curated Stacks & Anthologies
            </h1>
            <p className="mx-auto mt-3 max-w-2xl font-[var(--za-font-editorial)] text-base italic leading-relaxed text-ink-muted sm:text-lg">
              Reading paths, thematic essays, and illuminated media stacks compiled by the curator.
            </p>
          </div>

          <StacksClient
            initialStacks={initialStacks}
            initialMediaEntries={initialMediaEntries}
            username={username || 'user'}
          />
        </div>
      </main>
    </div>
  );
}
