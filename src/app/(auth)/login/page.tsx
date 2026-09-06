import { redirectIfAuthenticated } from '@/server/internal';
import { Suspense } from 'react';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your ZedArchive account.',
};

export default async function LoginPage() {
  await redirectIfAuthenticated();
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
