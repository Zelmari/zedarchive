const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_ADDRESS = 'ZedArchive <noreply@auth.zedarchive.com>';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function getEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const cfContext = (globalThis as Record<string | symbol, unknown>)[
      Symbol.for('__cloudflare-context__')
    ] as { env?: Record<string, string> } | undefined;
    if (cfContext?.env?.[name]) return cfContext.env[name];
  } catch {}
  const g = globalThis as Record<string, unknown>;
  if (typeof g[name] === 'string') return g[name] as string;
  const gEnv = g.env as Record<string, string> | undefined;
  if (gEnv && typeof gEnv[name] === 'string') return gEnv[name];
  return undefined;
}

/**
 * Send a transactional email via the Resend HTTP API.
 *
 * Best-effort: never throws. Callers (Better Auth's `sendResetPassword` /
 * `sendVerificationEmail`) run inside `runInBackgroundOrAwait` and any
 * throw would abort the surrounding flow. The caller will surface success
 * to the user regardless of the email outcome; the reset/verify token is
 * persisted in the DB and the user can retry from the UI.
 *
 * No-op when `RESEND_API_KEY` is unset (local dev without secrets) so
 * sign-in / sign-up flows do not break in environments that have not been
 * configured for email yet.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = getEnvVar('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to);
    return;
  }

  const from = getEnvVar('EMAIL_FROM') || DEFAULT_FROM_ADDRESS;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ''),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[email] Resend rejected send:', res.status, errText);
    }
  } catch (err) {
    console.warn('[email] Resend fetch failed:', err instanceof Error ? err.message : err);
  }
}

function escapeHtml(s?: string | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPasswordResetEmail(args: { name?: string | null; url: string }): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(args.name) || 'there';
  const subject = 'Reset your ZedArchive password';
  const html = `
    <div style="font-family: Georgia, serif; max-width: 32rem; margin: 0 auto; padding: 1.5rem; color: #242321;">
      <h1 style="font-size: 1.4rem; margin: 0 0 1rem;">Reset your password</h1>
      <p>Hi ${safeName},</p>
      <p>Someone (hopefully you) asked to reset the password on your ZedArchive account. Click the link below to choose a new one. It expires in one hour.</p>
      <p style="margin: 1.5rem 0;"><a href="${args.url}" style="background: #242321; color: #f7f5f0; padding: 0.6rem 1rem; border-radius: 4px; text-decoration: none; display: inline-block;">Reset password</a></p>
      <p style="font-size: 0.85rem; color: #6b6864;">If you did not request this, you can safely ignore this email — your password will stay the same.</p>
      <p style="font-size: 0.85rem; color: #6b6864;">— ZedArchive</p>
    </div>
  `;
  return { subject, html };
}

export function buildVerificationEmail(args: { name?: string | null; url: string }): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(args.name) || 'there';
  const subject = 'Verify your ZedArchive email';
  const html = `
    <div style="font-family: Georgia, serif; max-width: 32rem; margin: 0 auto; padding: 1.5rem; color: #242321;">
      <h1 style="font-size: 1.4rem; margin: 0 0 1rem;">Welcome to ZedArchive</h1>
      <p>Hi ${safeName},</p>
      <p>Thanks for signing up. Please confirm your email address by clicking the link below. It expires in one hour.</p>
      <p style="margin: 1.5rem 0;"><a href="${args.url}" style="background: #242321; color: #f7f5f0; padding: 0.6rem 1rem; border-radius: 4px; text-decoration: none; display: inline-block;">Verify email</a></p>
      <p style="font-size: 0.85rem; color: #6b6864;">If you did not create this account, you can safely ignore this email.</p>
      <p style="font-size: 0.85rem; color: #6b6864;">— ZedArchive</p>
    </div>
  `;
  return { subject, html };
}
