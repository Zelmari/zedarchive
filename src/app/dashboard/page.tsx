import { getUserProfileById } from '@/server/queries/user';
import { getMediaEntriesByUserId } from '@/server/queries/media';
import { requireSession, toDashboardUser } from '@/server/internal';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Dashboard',
  description: 'Your quiet media collection.',
};

export default async function DashboardPage() {
  const session = await requireSession();

  // Fetch user profile and initial media entries via DAL queries
  const dbUser = await getUserProfileById(session.id);
  const initialEntries = await getMediaEntriesByUserId(session.id);
  const user = toDashboardUser(session, dbUser);

  return <DashboardClient user={user} initialEntries={initialEntries} />;
}
