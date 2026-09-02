import { getUserGroups } from '@/server/queries/groups';
import { getAcceptedFriends } from '@/server/queries/friends';
import { requireSession } from '@/server/internal';
import { Layers, Users } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import GroupsClient from './GroupsClient';

export const metadata = {
  title: 'Groups — zedarchive',
  description: 'Collaborate in group chats and shared archives.',
};

export default async function GroupsPage() {
  const session = await requireSession();

  const [groups, friends] = await Promise.all([
    getUserGroups(session.id),
    getAcceptedFriends(session.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Friends', href: '/friends', icon: Users },
        ]}
        actions={
          <span className="hidden font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-ink-faint md:inline">
            Collective index · {groups.length} volumes
          </span>
        }
      />
      <main id="main-content" className="flex-1 py-10">
        <div className="za-container max-w-5xl">
          <div className="mb-8 border-b border-decorative pb-6">
            <p className="mb-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.18em] text-accent">
              The collective index · shared shelves &amp; correspondence
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                  Groups
                </h1>
                <p className="mt-2 max-w-xl font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                  Assemble a small reading room for shared archives, brief notes, and conversations
                  that know when to disappear.
                </p>
              </div>
              <div className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.08em] text-ink-faint">
                {friends.length} eligible companions
              </div>
            </div>
          </div>
          <GroupsClient initialGroups={groups} friends={friends.map((f) => f.friend)} />
        </div>
      </main>
    </div>
  );
}
