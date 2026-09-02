import { redirectIfAuthenticated } from '@/server/internal';
import SignUpForm from './SignUpForm';

export const metadata = {
  title: 'Create Account',
  description: 'Create a quiet, personal media archive.',
};

export default async function SignUpPage() {
  await redirectIfAuthenticated();
  return <SignUpForm />;
}
