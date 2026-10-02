import { getUserGroups } from '@/server/queries/groups';
import { requireSession } from '@/server/internal';
import { Layers } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import PageIntro from '@/components/ui/PageIntro';
import GroupsClient from './GroupsClient';

export const metadata = {
  title: 'Groups — zedarchive',
  description: 'Collaborate in group chats and shared archives.',
};

export default async function GroupsPage() {
  const session = await requireSession();

  const groups = await getUserGroups(session.id);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{ href: '/dashboard', label: 'Dashboard' }}
        navItems={[{ label: 'Dashboard', href: '/dashboard', icon: Layers }]}
      />
      <main id="main-content" className="flex-1 py-[var(--za-space-8)]">
        <div className="za-container max-w-5xl">
          <PageIntro
            kicker="Shared shelves"
            title="Groups"
            description="Assemble a small reading room for shared archives, brief notes, and conversations that know when to disappear."
            meta={`${groups.length} groups`}
          />
          <GroupsClient initialGroups={groups} />
        </div>
      </main>
    </div>
  );
}
