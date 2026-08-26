import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export const metadata = {
  title: 'Your Year in Media — zedarchive Wrapped',
  description: 'Your personal yearly entertainment and reading archive summary.',
};

export default async function WrappedRedirectPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/login');
  }

  const currentYear = new Date().getFullYear();
  redirect(`/wrapped/${currentYear}`);
}
