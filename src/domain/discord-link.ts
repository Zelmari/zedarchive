import crypto from 'crypto';
import { discordLinks, discordLinkCodes, user as userTable } from '@/db/schema';
import { eq, and, gt, isNull, desc } from 'drizzle-orm';
import { domainDb } from './db-context';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters, no 0/O/1/I
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory rate limiting tracking
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const generateRateLimits = new Map<string, RateLimitBucket>();
const redeemRateLimits = new Map<string, RateLimitBucket>();

function checkRateLimit(
  map: Map<string, RateLimitBucket>,
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count++;
  return true;
}

export function getLinkPepper(): string | null {
  return process.env.DISCORD_LINK_PEPPER || null;
}

export function normalizeDiscordLinkCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const alphaNum = cleaned.replace(/[^A-Z0-9]/g, '');
  if (alphaNum.startsWith('ZA') && alphaNum.length === 10) {
    return `ZA-${alphaNum.slice(2, 6)}-${alphaNum.slice(6, 10)}`;
  }
  return cleaned;
}

export function hashDiscordLinkCode(normalizedCode: string, pepper: string): string {
  return crypto.createHash('sha256').update(`${pepper}:${normalizedCode}`).digest('hex');
}

export function generateRandomCodeString(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let randomStr = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = bytes[i]!;
    randomStr += CODE_CHARS[byte % CODE_CHARS.length];
  }
  return `ZA-${randomStr.slice(0, 4)}-${randomStr.slice(4, 8)}`;
}

export interface CreateLinkCodeResult {
  code: string;
  expiresAt: Date;
}

/**
 * Generate a short-lived link code for a ZedArchive user.
 * Invalidates any existing unconsumed codes for this user.
 */
export async function createDiscordLinkCode(userId: string): Promise<CreateLinkCodeResult> {
  const pepper = getLinkPepper();
  if (!pepper) {
    throw new Error('Discord linking is not configured.');
  }

  // Rate limit: 5 codes / user / hour
  if (!checkRateLimit(generateRateLimits, userId, 5, 60 * 60 * 1000)) {
    throw new Error('Too many link code requests. Please wait before generating another code.');
  }

  const code = generateRandomCodeString();
  const normalized = normalizeDiscordLinkCode(code);
  const codeHash = hashDiscordLinkCode(normalized, pepper);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await domainDb().transaction(async (tx) => {
    // Invalidate previous unconsumed codes for this user
    await tx
      .delete(discordLinkCodes)
      .where(and(eq(discordLinkCodes.userId, userId), isNull(discordLinkCodes.consumedAt)));

    await tx.insert(discordLinkCodes).values({
      id: crypto.randomUUID(),
      userId,
      codeHash,
      expiresAt,
      createdAt: now,
    });
  });

  return { code, expiresAt };
}

export interface RedeemLinkCodeParams {
  discordUserId: string;
  discordUsername?: string | null;
  code: string;
}

export interface RedeemLinkCodeResult {
  success: boolean;
  userId: string;
  username: string | null;
  name: string;
}

/**
 * Redeem a link code from Discord, mapping discordUserId to a ZedArchive user.
 */
export async function redeemDiscordLinkCode({
  discordUserId,
  discordUsername,
  code,
}: RedeemLinkCodeParams): Promise<RedeemLinkCodeResult> {
  const pepper = getLinkPepper();
  if (!pepper) {
    throw new Error('Discord linking is not configured.');
  }

  // Rate limit: 10 attempts / Discord user / hour
  if (!checkRateLimit(redeemRateLimits, discordUserId, 10, 60 * 60 * 1000)) {
    throw new Error('Too many link attempts. Please try again later.');
  }

  const normalized = normalizeDiscordLinkCode(code);
  if (!normalized.startsWith('ZA-') || normalized.length < 10) {
    throw new Error('Invalid code format. Code should look like ZA-XXXX-XXXX.');
  }

  const codeHash = hashDiscordLinkCode(normalized, pepper);
  const now = new Date();

  return await domainDb().transaction(async (tx) => {
    // Find valid, non-expired, unconsumed link code
    const [row] = await tx
      .select()
      .from(discordLinkCodes)
      .where(
        and(
          eq(discordLinkCodes.codeHash, codeHash),
          isNull(discordLinkCodes.consumedAt),
          gt(discordLinkCodes.expiresAt, now),
        ),
      )
      .limit(1);

    if (!row) {
      throw new Error('Invalid or expired link code. Please generate a new code on the website.');
    }

    // Check if this Discord user is already linked to a DIFFERENT ZedArchive user
    const [existingDiscordLink] = await tx
      .select()
      .from(discordLinks)
      .where(eq(discordLinks.discordUserId, discordUserId))
      .limit(1);

    if (existingDiscordLink && existingDiscordLink.userId !== row.userId) {
      throw new Error(
        'This Discord account is already linked to another ZedArchive user. Run /unlink first.',
      );
    }

    // Check if this ZedArchive user is already linked to a DIFFERENT Discord user
    const [existingUserLink] = await tx
      .select()
      .from(discordLinks)
      .where(eq(discordLinks.userId, row.userId))
      .limit(1);

    if (existingUserLink && existingUserLink.discordUserId !== discordUserId) {
      throw new Error(
        'This ZedArchive account is already linked to another Discord user. Unlink on the website first.',
      );
    }

    // Mark code as consumed
    await tx
      .update(discordLinkCodes)
      .set({ consumedAt: now })
      .where(eq(discordLinkCodes.id, row.id));

    // Upsert discord_links row
    await tx
      .insert(discordLinks)
      .values({
        discordUserId,
        userId: row.userId,
        discordUsername: discordUsername ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: discordLinks.discordUserId,
        set: {
          userId: row.userId,
          discordUsername: discordUsername ?? null,
          updatedAt: now,
        },
      });

    // Fetch user info for confirmation message
    const [user] = await tx
      .select({ id: userTable.id, name: userTable.name, username: userTable.username })
      .from(userTable)
      .where(eq(userTable.id, row.userId))
      .limit(1);

    return {
      success: true,
      userId: row.userId,
      username: user?.username ?? null,
      name: user?.name ?? 'ZedArchive User',
    };
  });
}

/**
 * Sever link by Discord snowflake.
 */
export async function unlinkByDiscordUserId(discordUserId: string): Promise<boolean> {
  const result = await domainDb()
    .delete(discordLinks)
    .where(eq(discordLinks.discordUserId, discordUserId))
    .returning({ id: discordLinks.discordUserId });
  return result.length > 0;
}

/**
 * Sever link by ZedArchive user id.
 */
export async function unlinkByUserId(userId: string): Promise<boolean> {
  const result = await domainDb()
    .delete(discordLinks)
    .where(eq(discordLinks.userId, userId))
    .returning({ id: discordLinks.discordUserId });
  return result.length > 0;
}

export interface DiscordLinkInfo {
  discordUserId: string;
  userId: string;
  discordUsername: string | null;
  createdAt: Date;
}

export async function getDiscordLinkByUserId(userId: string): Promise<DiscordLinkInfo | null> {
  const [link] = await domainDb()
    .select()
    .from(discordLinks)
    .where(eq(discordLinks.userId, userId))
    .limit(1);
  return link ?? null;
}

export async function getDiscordLinkByDiscordUserId(
  discordUserId: string,
): Promise<DiscordLinkInfo | null> {
  const [link] = await domainDb()
    .select()
    .from(discordLinks)
    .where(eq(discordLinks.discordUserId, discordUserId))
    .limit(1);
  return link ?? null;
}

export interface ResolvedZedUser {
  userId: string;
  name: string;
  username: string | null;
  email: string;
  isPublic: boolean;
}

export async function resolveZedUserFromDiscordId(
  discordUserId: string,
): Promise<ResolvedZedUser | null> {
  const [row] = await domainDb()
    .select({
      userId: discordLinks.userId,
      name: userTable.name,
      username: userTable.username,
      email: userTable.email,
      isPublic: userTable.isPublic,
    })
    .from(discordLinks)
    .innerJoin(userTable, eq(discordLinks.userId, userTable.id))
    .where(eq(discordLinks.discordUserId, discordUserId))
    .limit(1);

  return row ?? null;
}
