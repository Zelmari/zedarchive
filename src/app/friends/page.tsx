import {
  getAcceptedFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
} from '@/server/queries/friends';
import { getUserProfileById } from '@/server/queries/user';
import { requireSession } from '@/server/internal';
import { Layers, MessageSquare } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import FriendsClient from './FriendsClient';

export const metadata = {
  title: 'Friends — zedarchive',
  description: 'Manage your friends, requests, and discover new collectors.',
};

export default async function FriendsPage() {
  const session = await requireSession();

  const [friends, incoming, outgoing, profile] = await Promise.all([
    getAcceptedFriends(session.id),
    getIncomingFriendRequests(session.id),
    getOutgoingFriendRequests(session.id),
    getUserProfileById(session.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Groups', href: '/groups', icon: MessageSquare },
        ]}
        actions={
          <span className="hidden font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.12em] text-ink-faint md:inline">
            Social ledger · {friends.length} companions
          </span>
        }
      />
      <main id="main-content" className="flex-1 py-10">
        <div className="za-container max-w-5xl">
          <div className="mb-8 border-b border-decorative pb-6">
            <p className="mb-2 font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.18em] text-accent">
              The social ledger · correspondence &amp; trust
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase tracking-[0.04em] text-ink">
                  Friends
                </h1>
                <p className="mt-2 max-w-xl font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] leading-[var(--za-leading-body)] text-ink-muted">
                  Keep company with fellow archivists. Requests, accepted companions, and new
                  discoveries are kept here in one quiet register.
                </p>
              </div>
              <div className="font-[var(--za-font-mono)] text-[length:var(--za-text-fine)] uppercase tracking-[0.08em] text-ink-faint">
                {incoming.length} incoming · {outgoing.length} outgoing
              </div>
            </div>
          </div>
          <FriendsClient
            initialFriends={friends}
            initialIncoming={incoming}
            initialOutgoing={outgoing}
            currentUsername={profile?.username ?? session.username ?? null}
          />
        </div>
      </main>
    </div>
  );
}
