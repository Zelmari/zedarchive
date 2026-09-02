import Link from 'next/link';
import { getGroupDetails, getGroupMessages } from '@/server/queries/groups';
import { getGroupMediaEntries } from '@/server/queries/media';
import { getUserProfileById } from '@/server/queries/user';
import { requireSession, toDashboardUser } from '@/server/internal';
import { Layers } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import GroupWorkspaceClient from './GroupWorkspaceClient';

export default async function GroupWorkspacePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const session = await requireSession(`/login?callbackUrl=/groups/${encodeURIComponent(groupId)}`);

  const details = await getGroupDetails(groupId, session.id);
  if (!details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
        <div className="za-card rounded-control border border-decorative bg-surface p-8 text-center">
          <p className="text-sm text-ink-muted">Group not found.</p>
          <Link href="/groups" className="za-button za-button--primary mt-4">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  if (!details.isMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
        <div className="za-card rounded-control border border-decorative bg-surface p-8 text-center">
          <p className="text-sm text-ink-muted">You are not a member of this group.</p>
          <Link href="/groups" className="za-button za-button--primary mt-4">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  let messages: Awaited<ReturnType<typeof getGroupMessages>> = [];
  try {
    messages = await getGroupMessages(groupId, session.id);
  } catch {
    messages = [];
  }

  let mediaEntries: Awaited<ReturnType<typeof getGroupMediaEntries>> = [];
  try {
    mediaEntries = await getGroupMediaEntries(groupId, session.id);
  } catch {
    mediaEntries = [];
  }

  const dbUser = await getUserProfileById(session.id);
  const currentUser = toDashboardUser(session, dbUser);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        backLink={{ href: '/groups', label: 'Groups' }}
        breadcrumbs={[{ label: details.name }]}
        navItems={[{ label: 'Dashboard', href: '/dashboard', icon: Layers }]}
        actions={
          <span className="text-xs text-ink-muted hidden md:inline">
            Shared Group Archive & Chat
          </span>
        }
      />
      <main id="main-content" className="flex-1 py-6">
        <div className="za-container max-w-5xl">
          <GroupWorkspaceClient
            group={details}
            initialMessages={messages}
            initialMedia={mediaEntries}
            currentUserId={session.id}
            currentUser={currentUser}
          />
        </div>
      </main>
    </div>
  );
}
