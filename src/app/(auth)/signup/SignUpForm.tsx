'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp, signIn } from '@/lib/client/auth-client';
import { AuthCard, AuthField } from '@/components/auth/AuthCard';

export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signUp.email({
        name,
        email,
        password,
        callbackURL: '/dashboard',
      });

      if (res?.error) {
        setError(res.error.message || res.error.statusText || 'Failed to create account.');
      } else {
        // Sign in immediately to land on dashboard where verification chip will be shown
        const signInRes = await signIn.email({
          email,
          password,
          callbackURL: '/dashboard',
        });

        if (signInRes?.error) {
          setNeedsVerification(true);
        } else {
          router.push('/dashboard');
          router.refresh();
        }
      }
    } catch (err) {
      console.error('Sign up caught error:', err);
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (needsVerification) {
    return (
      <AuthCard
        title="Check your email"
        subtitle={
          <>
            We sent a verification link to <strong>{email}</strong>. Please check your inbox and
            click the link to activate your account.
          </>
        }
      >
        <div className="grid gap-3">
          <Link href="/login" className="za-button za-button--primary text-center">
            Go to Sign In
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Register"
      subtitle="Create an account with a username, email address, and password."
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/login" className="za-link">
            Sign in
          </Link>
        </p>
      }
    >
      {error && (
        <p className="za-notice za-notice--error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        <AuthField label="Username" htmlFor="name">
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            className="za-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Smith"
          />
        </AuthField>

        <AuthField label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="za-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </AuthField>

        <AuthField label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="za-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </AuthField>

        <button type="submit" disabled={loading} className="za-button za-button--primary w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
