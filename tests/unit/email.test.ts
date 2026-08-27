import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmail, buildPasswordResetEmail, buildVerificationEmail } from '@/lib/email';

describe('email templates', () => {
  it('builds password reset email with escaped name and url', () => {
    const email = buildPasswordResetEmail({
      name: '<script>alert("xss")</script>Alice',
      url: 'https://zedarchive.com/reset-password/test-token-123',
    });

    expect(email.subject).toBe('Reset your ZedArchive password');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Alice');
    expect(email.html).toContain('https://zedarchive.com/reset-password/test-token-123');
  });

  it('builds verification email with escaped name and url', () => {
    const email = buildVerificationEmail({
      name: 'Bob & Charlie',
      url: 'https://zedarchive.com/verify-email?token=xyz',
    });

    expect(email.subject).toBe('Verify your ZedArchive email');
    expect(email.html).toContain('Bob &amp; Charlie');
    expect(email.html).toContain('https://zedarchive.com/verify-email?token=xyz');
  });
});

describe('sendEmail', () => {
  const originalEnv = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('no-ops safely without error when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    process.env.RESEND_API_KEY = originalEnv;
  });

  it('sends POST request to Resend API when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test_12345';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }));

    await sendEmail({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello world</p>',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_test_12345',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ZedArchive <noreply@auth.zedarchive.com>',
          to: ['user@example.com'],
          subject: 'Test Subject',
          html: '<p>Hello world</p>',
          text: 'Hello world',
        }),
      }),
    );

    process.env.RESEND_API_KEY = originalEnv;
  });

  it('uses custom EMAIL_FROM when configured', async () => {
    process.env.RESEND_API_KEY = 're_test_12345';
    process.env.EMAIL_FROM = 'ZedArchive <noreply@auth.zedarchive.com>';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }));

    await sendEmail({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello world</p>',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        body: expect.stringContaining('"from":"ZedArchive <noreply@auth.zedarchive.com>"'),
      }),
    );

    delete process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = originalEnv;
  });

  it('never throws even if fetch fails or returns non-200', async () => {
    process.env.RESEND_API_KEY = 're_test_12345';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(
      sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).resolves.toBeUndefined();

    process.env.RESEND_API_KEY = originalEnv;
  });
});
