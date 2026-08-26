import { describe, it, expect } from 'vitest';
import { auth } from '@/lib/auth';

describe('GitHub OAuth configuration', () => {
  it('configures github social provider', () => {
    const githubProvider = auth.options.socialProviders?.github;
    expect(githubProvider).toBeDefined();
    expect(githubProvider?.clientId).toBeDefined();
    expect(githubProvider?.clientSecret).toBeDefined();
  });

  it('enables account linking for github provider', () => {
    const accountLinking = auth.options.account?.accountLinking;
    expect(accountLinking?.enabled).toBe(true);
    expect(accountLinking?.trustedProviders).toContain('github');
  });
});
