'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/client/auth-client';

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (res?.error) {
        setError(res.error.message || 'Failed to reset password. The link may have expired.');
      } else {
        setSuccess(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
      );
    } finally {
      setLoading(false);
    }
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
              Set new password
            </h1>
            <p
              style={{
                fontSize: 'var(--za-text-supporting)',
                color: 'var(--za-color-text-muted)',
              }}
            >
              Enter a new password for your ZedArchive account.
            </p>
          </header>

          {error && (
            <p className="za-notice za-notice--error" role="alert">
              {error}
            </p>
          )}

          {success ? (
            <div style={{ display: 'grid', gap: 'var(--za-space-4)' }}>
              <p className="za-notice za-notice--info" role="status">
                Your password has been reset successfully! Redirecting you to sign in…
              </p>
              <Link
                href="/login"
                className="za-button za-button--primary"
                style={{ textAlign: 'center' }}
              >
                Sign in now
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--za-space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-1)' }}>
                <label
                  htmlFor="new-password"
                  style={{
                    fontSize: 'var(--za-text-supporting)',
                    fontWeight: 'var(--za-weight-emphasis)',
                  }}
                >
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  className="za-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--za-space-1)' }}>
                <label
                  htmlFor="confirm-password"
                  style={{
                    fontSize: 'var(--za-text-supporting)',
                    fontWeight: 'var(--za-weight-emphasis)',
                  }}
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  className="za-field"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="za-button za-button--primary"
                style={{ inlineSize: '100%' }}
              >
                {loading ? 'Saving new password…' : 'Reset password'}
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
            <Link href="/login" className="za-link">
              Back to sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
