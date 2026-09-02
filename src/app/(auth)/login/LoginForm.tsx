'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, authClient } from '@/lib/client/auth-client';
import { AuthCard, AuthField } from '@/components/auth/AuthCard';

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
      <AuthCard
        title="Reset password"
        subtitle="Enter your email address to receive a secure link to reset your password."
        footer={
          <p>
            Remember your password?{' '}
            <button
              type="button"
              onClick={() => setView('signin')}
              className="za-link cursor-pointer border-0 bg-transparent p-0 text-[length:var(--za-text-supporting)]"
            >
              Sign in
            </button>
          </p>
        }
      >
        {error && (
          <p className="za-notice za-notice--error" role="alert">
            {error}
          </p>
        )}

        {forgotSubmitted ? (
          <div className="grid gap-4">
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
              className="za-button za-button--secondary w-full"
            >
              Return to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="grid gap-4">
            <AuthField label="Email" htmlFor="forgot-email">
              <input
                id="forgot-email"
                type="email"
                required
                className="za-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </AuthField>

            <button
              type="submit"
              disabled={loading}
              className="za-button za-button--primary w-full"
            >
              {loading ? 'Sending reset link…' : 'Send reset link'}
            </button>
          </form>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Sign in with the email and password for your account."
      footer={
        <p>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="za-link">
            Register
          </Link>
        </p>
      }
    >
      {error && (
        <p className="za-notice za-notice--error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSignIn} className="grid gap-4">
        <AuthField label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            required
            className="za-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </AuthField>

        <AuthField
          label="Password"
          htmlFor="password"
          labelAction={
            <button
              type="button"
              onClick={() => {
                setView('forgot');
                setError('');
                setForgotSubmitted(false);
              }}
              className="za-link cursor-pointer border-0 bg-transparent p-0 text-[length:var(--za-text-fine)]"
            >
              Forgot password?
            </button>
          }
        >
          <input
            id="password"
            type="password"
            required
            className="za-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </AuthField>

        <button type="submit" disabled={loading} className="za-button za-button--primary w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}
