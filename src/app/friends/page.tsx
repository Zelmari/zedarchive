import {
  getAcceptedFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
} from '@/server/queries/friends';
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

  const [friends, incoming, outgoing] = await Promise.all([
    getAcceptedFriends(session.id),
    getIncomingFriendRequests(session.id),
    getOutgoingFriendRequests(session.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <SubPageHeader
        navItems={[
          { label: 'Dashboard', href: '/dashboard', icon: Layers },
          { label: 'Groups', href: '/groups', icon: MessageSquare },
        ]}
      />
      <main id="main-content" className="flex-1 py-8">
        <div className="za-container max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-[var(--za-weight-heading)] text-ink">Friends</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Manage friendships and discover fellow archivists.
            </p>
          </div>
          <FriendsClient
            initialFriends={friends}
            initialIncoming={incoming}
            initialOutgoing={outgoing}
          />
        </div>
      </main>
    </div>
  );
}
