'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/client/auth-client';
import { AuthCard, AuthField } from '@/components/auth/AuthCard';

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
    <AuthCard
      title="Set new password"
      subtitle="Enter a new password for your ZedArchive account."
      footer={
        <p>
          Remember your password?{' '}
          <Link href="/login" className="za-link">
            Back to sign in
          </Link>
        </p>
      }
    >
      {error && (
        <p className="za-notice za-notice--error" role="alert">
          {error}
        </p>
      )}

      {success ? (
        <div className="grid gap-4">
          <p className="za-notice za-notice--info" role="status">
            Your password has been reset successfully! Redirecting you to sign in…
          </p>
          <Link href="/login" className="za-button za-button--primary text-center">
            Sign in now
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-5">
          <AuthField label="New Password" htmlFor="new-password">
            <input
              id="new-password"
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

          <AuthField label="Confirm Password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="za-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
            />
          </AuthField>

          <button type="submit" disabled={loading} className="za-button za-button--primary w-full">
            {loading ? 'Saving new password…' : 'Reset password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
