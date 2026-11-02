import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/auth/AuthCardSkeleton';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your ZedArchive account.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
