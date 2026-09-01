'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, authClient } from '@/lib/client/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [view, setView] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signIn.email({
        email,
        password,
      });

      if (res?.error) {
        setError(res.error.message || 'Invalid email or password.');
      } else {
        const dest =
          callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/dashboard';
        router.push(dest);
        router.refresh();
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;

      await authClient.requestPasswordReset({
        email,
        redirectTo,
      });

      setForgotSubmitted(true);
    } catch (err) {
      console.error('Forgot password error:', err);
      // Anti-enumeration: still mark submitted on errors so timing/failure doesn't reveal user existence
      setForgotSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (view === 'forgot') {
    return (
      <main id="main-content" tabIndex={-1} style={{ paddingBlock: 'var(--za-space-6)' }}>
        <div className="za-container za-container--narrow">
          <section
            className="za-card za-card--raised"
            style={{ display: 'grid', gap: 'var(--za-space-6)' }}
          >
            <header style={{ display: 'grid', gap: 'var(--za-space-2)' }}>
              <h1
                style={{
                  fontSize: 'var(--za-text-heading-lg)',
                  fontWeight: 'var(--za-weight-heading)',
                  lineHeight: 'var(--za-leading-compact)',
                }}
              >
                Reset password
              </h1>
              <p
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  color: 'var(--za-color-text-muted)',
                }}
              >
                Enter your email address to receive a secure link to reset your password.
              </p>
            </header>

            {error && (
              <p className="za-notice za-notice--error" role="alert">
                {error}
              </p>
            )}

            {forgotSubmitted ? (
              <div style={{ display: 'grid', gap: 'var(--za-space-4)' }}>
                <p className="za-notice za-notice--info" role="status">
                  If an account exists for {email}, a password reset link has been sent. Check your
                  inbox (and spam folder). The link is valid for 1 hour.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setView('signin');
                    setForgotSubmitted(false);
                  }}
                  className="za-button za-button--secondary"
                  style={{ inlineSize: '100%' }}
                >
                  Return to sign in
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleForgotPassword}
                style={{ display: 'grid', gap: 'var(--za-space-4)' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-1)' }}>
                  <label
                    htmlFor="forgot-email"
                    style={{
                      fontSize: 'var(--za-text-supporting)',
                      fontWeight: 'var(--za-weight-emphasis)',
                    }}
                  >
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    className="za-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="za-button za-button--primary"
                  style={{ inlineSize: '100%' }}
                >
                  {loading ? 'Sending reset link…' : 'Send reset link'}
                </button>
              </form>
            )}

            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
                borderTop: 'var(--za-border-width) solid var(--za-color-border-decorative)',
                paddingTop: 'var(--za-space-4)',
              }}
            >
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => setView('signin')}
                className="za-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Sign in
              </button>
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} style={{ paddingBlock: 'var(--za-space-6)' }}>
      <div className="za-container za-container--narrow">
        <section
          className="za-card za-card--raised"
          style={{ display: 'grid', gap: 'var(--za-space-6)' }}
        >
          <header style={{ display: 'grid', gap: 'var(--za-space-2)' }}>
            <h1
              style={{
                fontSize: 'var(--za-text-heading-lg)',
                fontWeight: 'var(--za-weight-heading)',
                lineHeight: 'var(--za-leading-compact)',
              }}
            >
              Sign in
            </h1>
            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
              }}
            >
              Sign in with the email and password for your account.
            </p>
          </header>

          {error && (
            <p className="za-notice za-notice--error" role="alert">
              {error}
            </p>
          )}

          <form onSubmit={handleSignIn} style={{ display: 'grid', gap: 'var(--za-space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-1)' }}>
              <label
                htmlFor="email"
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  fontWeight: 'var(--za-weight-emphasis)',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                className="za-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-1)' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <label
                  htmlFor="password"
                  style={{
                    fontSize: 'var(--za-text-supporting)',
                    fontWeight: 'var(--za-weight-emphasis)',
                  }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot');
                    setError('');
                    setForgotSubmitted(false);
                  }}
                  className="za-link"
                  style={{
                    fontSize: 'var(--za-text-fine)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                required
                className="za-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="za-button za-button--primary"
              style={{ inlineSize: '100%' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p
            style={{
              fontSize: 'var(--za-text-supporting)',
              color: 'var(--za-color-text-muted)',
              borderTop: 'var(--za-border-width) solid var(--za-color-border-decorative)',
              paddingTop: 'var(--za-space-4)',
            }}
          >
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="za-link">
              Register
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
