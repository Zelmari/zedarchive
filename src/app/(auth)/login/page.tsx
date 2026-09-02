import { redirectIfAuthenticated } from '@/server/internal';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your ZedArchive account.',
};

export default async function LoginPage() {
  await redirectIfAuthenticated();
  return <LoginForm />;
}
