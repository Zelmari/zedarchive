'use client';

import DashboardClient from '@/app/dashboard/DashboardClient';
import type { MediaEntry } from '@/types/media';
import type { GroupDetails } from '@/types/groups';

interface Props {
  group: GroupDetails;
  initialMedia: MediaEntry[];
  currentUser: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    theme?: string | null;
    customTheme?: any;
    username?: string | null;
    isPublic?: boolean;
    bio?: string | null;
    readingGoals?: any;
    emailVerified?: boolean;
    verificationDismissedAt?: string | null;
  };
}

export default function GroupArchiveView({ group, initialMedia, currentUser }: Props) {
  return (
    <DashboardClient
      user={currentUser}
      initialEntries={initialMedia}
      groupId={group.id}
      groupName={group.name}
      isGroup
    />
  );
}
