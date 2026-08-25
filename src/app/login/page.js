'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
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
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ paddingBlock: 'var(--za-space-6)' }}
    >
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

          <form
            onSubmit={handleSubmit}
            style={{ display: 'grid', gap: 'var(--za-space-4)' }}
          >
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
              <label
                htmlFor="password"
                style={{
                  fontSize: 'var(--za-text-supporting)',
                  fontWeight: 'var(--za-weight-emphasis)',
                }}
              >
                Password
              </label>
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