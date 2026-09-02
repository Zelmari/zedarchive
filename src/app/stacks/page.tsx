import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getMyStacks } from '@/server/stacks';
import { Layers } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
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
  const username = (session.user as typeof session.user & { username?: string | null }).username;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{ href: '/dashboard', label: 'Dashboard' }}
        breadcrumbs={[{ label: 'Curated Stacks' }]}
        navItems={[{ label: 'Dashboard', href: '/dashboard', icon: Layers }]}
      />
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container max-w-4xl">
          <div className="mb-8">
            <h1 className="text-2xl font-[var(--za-weight-heading)] text-ink">
              Curated Stacks & Anthologies
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Thematic user-created collections (e.g. <em>&quot;Spooky Autumn Reads&quot;</em> or{' '}
              <em>&quot;Cyberpunk Anime Essentials&quot;</em>) with annotations and shareable cards.
            </p>
          </div>

          <StacksClient initialStacks={initialStacks} username={username || 'user'} />
        </div>
      </main>
    </div>
  );
}
