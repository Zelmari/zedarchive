import { describe, it, expect } from 'vitest';
import { auth } from '@/lib/auth';

describe('Google OAuth configuration', () => {
  it('configures google social provider', () => {
    const googleProvider = auth.options.socialProviders?.google;
    expect(googleProvider).toBeDefined();
    expect(googleProvider?.clientId).toBeDefined();
    expect(googleProvider?.clientSecret).toBeDefined();
  });

  it('enables account linking for google provider', () => {
    const accountLinking = auth.options.account?.accountLinking;
    expect(accountLinking?.enabled).toBe(true);
    expect(accountLinking?.trustedProviders).toContain('google');
  });
});
