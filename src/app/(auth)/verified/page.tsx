import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const metadata = {
  title: 'Email Verification',
  description: 'Email verification status for your ZedArchive account.',
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function VerifiedPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  const isError = Boolean(error);
  const isExpired = error === 'TOKEN_EXPIRED';

  return (
    <section className="za-bookplate relative grid gap-6 p-6 text-center sm:p-8">
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <div className="flex justify-center">
        {isError ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-surface text-danger">
            <AlertCircle size={32} />
          </div>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-surface text-success">
            <CheckCircle2 size={32} />
          </div>
        )}
      </div>

      <header className="grid gap-2">
        <h1 className="font-[var(--za-font-display)] text-[length:var(--za-text-heading-lg)] font-[var(--za-weight-heading)] uppercase leading-[var(--za-leading-compact)] tracking-[0.04em]">
          {isError
            ? isExpired
              ? 'Verification Link Expired'
              : 'Verification Failed'
            : 'Email Verified'}
        </h1>
        <p className="font-[var(--za-font-serif-body)] text-[length:var(--za-text-supporting)] italic leading-[var(--za-leading-body)] text-ink-muted">
          {isError
            ? isExpired
              ? 'This email verification link has expired. Please sign in to request a new link.'
              : 'We could not verify your email with this link. It may be invalid or already used.'
            : 'Your email address has been successfully verified. Your account is fully activated.'}
        </p>
      </header>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/dashboard" className="za-button za-button--primary">
          Open Dashboard
        </Link>
        <Link href="/login" className="za-button za-button--secondary">
          Sign In
        </Link>
      </div>
    </section>
  );
}
