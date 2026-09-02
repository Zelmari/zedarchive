import { redirect } from 'next/navigation';
import { requireSession } from '@/server/internal';

export const metadata = {
  title: 'Your Year in Media — zedarchive Wrapped',
  description: 'Your personal yearly entertainment and reading archive summary.',
};

export default async function WrappedRedirectPage() {
  await requireSession();

  const currentYear = new Date().getFullYear();
  redirect(`/wrapped/${currentYear}`);
}
