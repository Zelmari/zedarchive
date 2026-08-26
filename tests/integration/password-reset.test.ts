import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email', () => ({
  sendEmail: sendEmailMock,
  buildPasswordResetEmail: vi.fn(({ name, url }) => ({
    subject: 'Reset your ZedArchive password',
    html: `<p>Hi ${name}, <a href="${url}">Reset</a></p>`,
  })),
  buildVerificationEmail: vi.fn(({ name, url }) => ({
    subject: 'Verify your ZedArchive email',
    html: `<p>Hi ${name}, <a href="${url}">Verify</a></p>`,
  })),
}));

import { auth } from '@/lib/auth';

describe('password reset flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes request-password-reset and reset-password on auth api', () => {
    expect(auth.api.requestPasswordReset).toBeDefined();
    expect(auth.api.resetPassword).toBeDefined();
  });

  it('configures sendResetPassword callback that invokes sendEmail with template', async () => {
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;
    expect(sendResetPassword).toBeDefined();

    if (sendResetPassword) {
      await sendResetPassword({
        user: {
          id: 'user-1',
          email: 'test@zedarchive.com',
          name: 'Tester',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: 'https://zedarchive.com/reset-password/tok_123',
        token: 'tok_123',
      });

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@zedarchive.com',
          subject: 'Reset your ZedArchive password',
          html: expect.stringContaining('https://zedarchive.com/reset-password/tok_123'),
        }),
      );
    }
  });

  it('has 1-hour expiry configured for reset tokens', () => {
    expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(3600);
  });
});
