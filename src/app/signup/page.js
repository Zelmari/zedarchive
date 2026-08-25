import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import SignUpForm from './SignUpForm';

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    redirect('/dashboard');
  }
  return <SignUpForm />;
}
