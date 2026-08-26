import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const metadata = {
  title: 'Email Verification — zedarchive',
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
    <main id="main-content" tabIndex={-1} style={{ paddingBlock: 'var(--za-space-8)' }}>
      <div className="za-container za-container--narrow">
        <section
          className="za-card za-card--raised"
          style={{ display: 'grid', gap: 'var(--za-space-6)', textAlign: 'center' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {isError ? (
              <div
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(185, 28, 28, 0.1)',
                  color: '#b91c1c',
                }}
              >
                <AlertCircle size={32} />
              </div>
            ) : (
              <div
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(46, 125, 50, 0.1)',
                  color: '#2e7d32',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
            )}
          </div>

          <header style={{ display: 'grid', gap: 'var(--za-space-2)' }}>
            <h1
              style={{
                fontSize: 'var(--za-text-heading-lg)',
                fontWeight: 'var(--za-weight-heading)',
                lineHeight: 'var(--za-leading-compact)',
              }}
            >
              {isError
                ? isExpired
                  ? 'Verification Link Expired'
                  : 'Verification Failed'
                : 'Email Verified'}
            </h1>
            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
              }}
            >
              {isError
                ? isExpired
                  ? 'This email verification link has expired. Please sign in to request a new link.'
                  : 'We could not verify your email with this link. It may be invalid or already used.'
                : 'Your email address has been successfully verified. Your account is fully activated.'}
            </p>
          </header>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--za-space-3)' }}>
            <Link href="/dashboard" className="za-button za-button--primary">
              Open Dashboard
            </Link>
            <Link href="/login" className="za-button za-button--secondary">
              Sign In
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
