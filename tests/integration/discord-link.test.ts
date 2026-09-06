import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeDiscordLinkCode,
  hashDiscordLinkCode,
  generateRandomCodeString,
  createDiscordLinkCode,
  redeemDiscordLinkCode,
  unlinkByDiscordUserId,
  unlinkByUserId,
} from '@/domain/discord-link';
import { setDomainDb, type DbClient } from '@/domain/db-context';

describe('Discord Linking Domain', () => {
  const pepper = 'test-pepper-secret-key-12345';

  beforeEach(() => {
    vi.stubEnv('DISCORD_LINK_PEPPER', pepper);
  });

  describe('Code formatting and hashing', () => {
    it('normalizes codes with spaces, lowercase, and missing hyphens', () => {
      expect(normalizeDiscordLinkCode('za-ab3k-9mpq')).toBe('ZA-AB3K-9MPQ');
      expect(normalizeDiscordLinkCode('  za-ab3k-9mpq  ')).toBe('ZA-AB3K-9MPQ');
      expect(normalizeDiscordLinkCode('zaab3k9mpq')).toBe('ZA-AB3K-9MPQ');
      expect(normalizeDiscordLinkCode('ZA AB3K 9MPQ')).toBe('ZA-AB3K-9MPQ');
    });

    it('generates consistent hashes with identical pepper and normalized code', () => {
      const code1 = normalizeDiscordLinkCode('ZA-AB3K-9MPQ');
      const code2 = normalizeDiscordLinkCode('za ab3k 9mpq');
      const hash1 = hashDiscordLinkCode(code1, pepper);
      const hash2 = hashDiscordLinkCode(code2, pepper);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('generates random codes in the expected format without ambiguous chars', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRandomCodeString();
        expect(code).toMatch(/^ZA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        expect(code).not.toContain('0');
        expect(code).not.toContain('O');
        expect(code).not.toContain('1');
        expect(code).not.toContain('I');
      }
    });
  });

  describe('createDiscordLinkCode and redeem', () => {
    it('throws if DISCORD_LINK_PEPPER is missing', async () => {
      vi.stubEnv('DISCORD_LINK_PEPPER', '');
      await expect(createDiscordLinkCode('user-1')).rejects.toThrow(
        'Discord linking is not configured.',
      );
    });

    it('creates a link code with 10-minute expiry', async () => {
      const insertedCodes: Record<string, unknown>[] = [];
      const mockDb = {
        transaction: async (fn: any) => fn(mockDb),
        delete: () => ({ where: vi.fn().mockResolvedValue([]) }),
        insert: () => ({
          values: vi.fn().mockImplementation((val) => {
            insertedCodes.push(val);
            return Promise.resolve();
          }),
        }),
      } as unknown as DbClient;

      setDomainDb(mockDb);

      const before = Date.now();
      const res = await createDiscordLinkCode('user-1');
      const after = Date.now();

      expect(res.code).toMatch(/^ZA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(res.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
      expect(res.expiresAt.getTime()).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1000);
      expect(insertedCodes).toHaveLength(1);
      expect(insertedCodes[0]?.userId).toBe('user-1');
    });

    it('rejects invalid code formats on redeem', async () => {
      await expect(
        redeemDiscordLinkCode({ discordUserId: '123456', code: 'invalid' }),
      ).rejects.toThrow('Invalid code format');
    });

    it('successfully redeems and links accounts', async () => {
      const targetUserId = 'user-abc';
      const code = 'ZA-AB3K-9MPQ';
      const codeHash = hashDiscordLinkCode(code, pepper);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const codesTable: Record<string, unknown>[] = [
        {
          id: 'code-1',
          userId: targetUserId,
          codeHash,
          expiresAt,
          consumedAt: null,
        },
      ];
      const linksTable: Record<string, unknown>[] = [];

      const mockDb = {
        transaction: async (fn: any) => fn(mockDb),
        select: (fields?: any) => ({
          from: (table: any) => ({
            where: () => ({
              limit: () => {
                if (
                  table === undefined ||
                  table?._?.name === 'discord_link_codes' ||
                  'codeHash' in table
                ) {
                  return Promise.resolve(codesTable);
                }
                if (table?._?.name === 'discord_links' || 'discordUserId' in table) {
                  return Promise.resolve(linksTable);
                }
                return Promise.resolve([
                  { id: targetUserId, name: 'Zelmari', username: 'zelmari' },
                ]);
              },
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => ({
            where: () => {
              Object.assign(codesTable[0]!, vals);
              return Promise.resolve();
            },
          }),
        }),
        insert: () => ({
          values: (vals: any) => ({
            onConflictDoUpdate: (opts: any) => {
              linksTable.push(vals);
              return Promise.resolve();
            },
          }),
        }),
      } as unknown as DbClient;

      setDomainDb(mockDb);

      const result = await redeemDiscordLinkCode({
        discordUserId: 'discord-snowflake-1',
        discordUsername: 'zelmari_discord',
        code,
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(targetUserId);
      expect(result.username).toBe('zelmari');
      expect(codesTable[0]?.consumedAt).toBeInstanceOf(Date);
      expect(linksTable).toHaveLength(1);
      expect(linksTable[0]?.discordUserId).toBe('discord-snowflake-1');
      expect(linksTable[0]?.userId).toBe(targetUserId);
    });
  });

  describe('unlink', () => {
    it('unlinks by discord user ID', async () => {
      const mockDb = {
        delete: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ id: 'snowflake-1' }]),
          }),
        }),
      } as unknown as DbClient;

      setDomainDb(mockDb);
      const res = await unlinkByDiscordUserId('snowflake-1');
      expect(res).toBe(true);
    });

    it('unlinks by ZedArchive user ID', async () => {
      const mockDb = {
        delete: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ id: 'snowflake-1' }]),
          }),
        }),
      } as unknown as DbClient;

      setDomainDb(mockDb);
      const res = await unlinkByUserId('user-1');
      expect(res).toBe(true);
    });
  });
});
