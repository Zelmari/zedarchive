import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from '@/db/schema';

const isDev = process.env.NODE_ENV === 'development';

// In dev, fall back to localhost unless explicitly configured. Production must
// always resolve to the canonical browsing origin (Cloudflare dashboard vars).
const fallbackURL = isDev ? 'http://localhost:3000' : 'https://zedarchive.com';
const baseURL = process.env.BETTER_AUTH_URL || fallbackURL;

const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  'placeholder_build_secret_0123456789abcdef0123456789abcdef';

export const auth = betterAuth({
  baseURL,
  secret: authSecret,
  // Explicit rather than inferred from baseURL: keeps cookie names byte-identical
  // in production (__Secure- prefix preserved) while letting plain-http local
  // development issue ordinary cookies that browsers actually store.
  advanced: {
    useSecureCookies: !isDev,
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
    // Cloudflare deployment & preview hosts (workers.dev / pages.dev)
    'https://*.workers.dev',
    'https://*.pages.dev',
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
  emailAndPassword: {
    enabled: true,
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