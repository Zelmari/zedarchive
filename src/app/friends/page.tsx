import {
  getAcceptedFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
} from '@/server/queries/friends';
import { getUserProfileById } from '@/server/queries/user';
import { requireSession } from '@/server/internal';
import { Layers, MessageSquare } from 'lucide-react';
import SubPageHeader from '@/components/navigation/SubPageHeader';
import PageIntro from '@/components/ui/PageIntro';
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
        backLink={{ href: '/dashboard', label: 'Dashboard' }}
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Groups', href: '/groups', icon: MessageSquare },
        ]}
      />
      <main id="main-content" className="flex-1 py-[var(--za-space-8)]">
        <div className="za-container max-w-5xl">
          <PageIntro
            kicker="Correspondence & trust"
            title="Friends"
            description="Keep company with fellow archivists. Requests, accepted companions, and new discoveries are kept here in one quiet register."
            meta={`${friends.length} companions · ${incoming.length} incoming · ${outgoing.length} outgoing`}
          />
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
