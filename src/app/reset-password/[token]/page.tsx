import ResetPasswordForm from './ResetPasswordForm';

export const metadata = {
  title: 'Reset Password — zedarchive',
  description: 'Choose a new password for your ZedArchive account.',
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}
