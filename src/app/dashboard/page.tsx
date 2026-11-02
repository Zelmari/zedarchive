import { withRequestDb } from '@/lib/db';
import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import { requireSession, toDashboardUser } from '@/server/internal';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Dashboard',
  description: 'Your quiet media collection.',
};

export default async function DashboardPage() {
  return withRequestDb(async () => {
    const session = await requireSession();

    // Fetch user profile and initial media entries via DAL queries
    const [dbUser, initialEntries] = await Promise.all([
      getUserProfileById(session.id),
      getMediaEntriesByUserId(session.id),
    ]);
    const user = toDashboardUser(session, dbUser);

    return <DashboardClient user={user} initialEntries={initialEntries} />;
  });
}
