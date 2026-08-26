import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from '@/db/schema';
import { sendEmail, buildPasswordResetEmail, buildVerificationEmail } from './email';

const isDev = process.env.NODE_ENV === 'development';
// `next build` evaluates this module in production mode without runtime
// secrets present (CI included), so only hard-fail when actually serving.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

// In dev, fall back to localhost unless explicitly configured. Production must
// always resolve to the canonical browsing origin (Cloudflare dashboard vars).
const fallbackURL = isDev ? 'http://localhost:3000' : 'https://zedarchive.com';
const baseURL = process.env.BETTER_AUTH_URL || fallbackURL;

if (!process.env.BETTER_AUTH_SECRET && !isDev && !isBuildPhase) {
  throw new Error(
    'BETTER_AUTH_SECRET is required in production. Configure it via Cloudflare dashboard vars before deploying.',
  );
}

const authSecret =
  process.env.BETTER_AUTH_SECRET || 'placeholder_build_secret_0123456789abcdef0123456789abcdef';

export const auth = betterAuth({
  baseURL,
  secret: authSecret,
  // Explicit rather than inferred from baseURL: keeps cookie names byte-identical
  // in production (__Secure- prefix preserved) while letting plain-http local
  // development issue ordinary cookies that browsers actually store.
  advanced: {
    useSecureCookies: !isDev,
    // Behind Cloudflare the real client IP arrives in `cf-connecting-ip` (always
    // a single IP, so no `trustedProxies` is needed). Without this, Better
    // Auth's rate-limiter cannot resolve an IP and falls back to a single
    // shared per-path bucket — one bad client can throttle everyone.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  trustedOrigins: [
    'https://zedarchive.com',
    'https://www.zedarchive.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:8787',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
    'http://127.0.0.1:8787',
    // Preview/deployment hosts must be allow-listed explicitly per environment
    // via BETTER_AUTH_TRUSTED_ORIGINS — never re-enable public wildcards.
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : []),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      ...schema,
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        ...buildVerificationEmail({ name: user.name, url }),
      });
    },
    autoSignInAfterVerification: true,
    expiresIn: 3600, // 1 hour
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        ...buildPasswordResetEmail({ name: user.name, url }),
      });
    },
    resetPasswordTokenExpiresIn: 3600, // 1 hour
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || 'placeholder_google_client_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder_google_client_secret',
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || 'placeholder_github_client_id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'placeholder_github_client_secret',
      enabled: Boolean(process.env.GITHUB_CLIENT_ID),
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },
  session: {
    // Cache the resolved session in a short-lived cookie so per-request reads
    // (root-layout theming, dashboard SSR, public profiles) skip the DB round-trip.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
