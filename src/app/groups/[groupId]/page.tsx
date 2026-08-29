import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getGroupDetails, getGroupMessages } from '@/server/queries/groups';
import { getGroupMediaEntries } from '@/server/queries/media';
import GroupWorkspaceClient from './GroupWorkspaceClient';

export default async function GroupWorkspacePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect('/login');

  const details = await getGroupDetails(groupId, session.user.id);
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
    messages = await getGroupMessages(groupId, session.user.id);
  } catch {
    messages = [];
  }

  let mediaEntries: Awaited<ReturnType<typeof getGroupMediaEntries>> = [];
  try {
    mediaEntries = await getGroupMediaEntries(groupId, session.user.id);
  } catch {
    mediaEntries = [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="za-site-header">
        <div className="za-container za-container--wide za-site-header__inner">
          <Link href="/groups" className="za-wordmark za-link">
            ← Groups
          </Link>
          <span className="text-xs text-ink-muted">Shared Group Archive & Chat</span>
        </div>
      </header>
      <main className="flex-1 py-6">
        <div className="za-container max-w-5xl">
          <GroupWorkspaceClient
            group={details}
            initialMessages={messages}
            initialMedia={mediaEntries}
            currentUserId={session.user.id}
          />
        </div>
      </main>
    </div>
  );
}
