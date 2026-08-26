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

const { getAuthUserMock, revalidatePathMock } = vi.hoisted(() => ({
  getAuthUserMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/server/internal', () => ({
  getAuthUser: getAuthUserMock,
  getSessionUser: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const dbState = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  function awaitable<T>(value: T) {
    const p = Promise.resolve(value) as Promise<T> & Record<string, unknown>;
    p.where = () => p;
    p.returning = () => p;
    return p;
  }

  return {
    db: {
      select: () => ({ from: () => ({ where: () => awaitable(dbState.rows) }) }),
      update: () => ({
        set: (fields: Row) => ({
          where: () => {
            const target = dbState.rows[0];
            if (target) Object.assign(target, fields);
            return awaitable([target]);
          },
        }),
      }),
    },
  };
});

import { auth } from '@/lib/auth';
import { dismissVerificationNotice } from '@/server/profile';

describe('email verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows.length = 0;
    getAuthUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('configures sendVerificationEmail and autoSignInAfterVerification', async () => {
    const emailVerification = auth.options.emailVerification;
    expect(emailVerification).toBeDefined();
    expect(emailVerification?.autoSignInAfterVerification).toBe(true);

    if (emailVerification?.sendVerificationEmail) {
      await emailVerification.sendVerificationEmail({
        user: {
          id: 'user-1',
          email: 'verify@zedarchive.com',
          name: 'Verifiable User',
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        url: 'https://zedarchive.com/verify-email?token=tok_456',
        token: 'tok_456',
      });

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'verify@zedarchive.com',
          subject: 'Verify your ZedArchive email',
          html: expect.stringContaining('https://zedarchive.com/verify-email?token=tok_456'),
        }),
      );
    }
  });

  it('dismisses verification notice via server action', async () => {
    dbState.rows.push({ id: 'user-1', verificationDismissedAt: null });

    const res = await dismissVerificationNotice();
    expect(res).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(dbState.rows[0]?.verificationDismissedAt).toBeInstanceOf(Date);
  });
});
