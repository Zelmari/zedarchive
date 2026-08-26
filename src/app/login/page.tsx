import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    redirect('/dashboard');
  }
  return <LoginForm />;
}
