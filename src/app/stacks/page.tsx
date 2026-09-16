import { getMyStacks } from '@/server/stacks';
import { getMediaEntries } from '@/server/media';
import { requireSession } from '@/server/internal';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import PageIntro from '@/components/ui/PageIntro';
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
      <SubPageHeader backLink={{ href: '/dashboard', label: 'Dashboard' }} />
      <main id="main-content" className="flex-1 py-[var(--za-space-8)]">
        <div className="za-container max-w-5xl">
          <PageIntro
            kicker="Curated collections"
            title="Curated Stacks"
            description="Reading paths, thematic essays, and illuminated media stacks compiled by the curator."
          />

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
