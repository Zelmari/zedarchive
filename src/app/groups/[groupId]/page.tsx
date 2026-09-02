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
        <div className="za-bookplate relative w-full max-w-md p-8 text-center">
          <span className="za-ribbon-bookmark" aria-hidden="true" />
          <p className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
            Group not found
          </p>
          <p className="mt-2 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
            This collective volume may have been withdrawn.
          </p>
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
        <div className="za-bookplate relative w-full max-w-md p-8 text-center">
          <span className="za-ribbon-bookmark" aria-hidden="true" />
          <p className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-md)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
            Members only
          </p>
          <p className="mt-2 font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic text-ink-muted">
            You are not a member of this collective volume.
          </p>
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
          <span className="hidden font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-ink-faint md:inline">
            Collective volume · correspondence
          </span>
        }
      />
      <main id="main-content" className="flex-1 py-8">
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
