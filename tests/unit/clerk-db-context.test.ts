import { describe, expect, it } from 'vitest';
import { domainDb, runWithDomainDb, type DbClient } from '@/domain/db-context';

const marker = (label: string) => ({ label }) as unknown as DbClient;

const labelOf = (client: DbClient) => (client as unknown as { label: string }).label;

describe('domain db scope', () => {
  it('keeps concurrent transactions on their own client', async () => {
    const a = marker('a');
    const b = marker('b');
    const seen: string[] = [];

    await Promise.all([
      runWithDomainDb(a, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.push(labelOf(domainDb()));
      }),
      runWithDomainDb(b, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(labelOf(domainDb()));
      }),
    ]);

    expect(seen).toEqual(['b', 'a']);
  });

  it('drops the transaction client after the callback settles', async () => {
    const scoped = marker('scoped');
    await expect(
      runWithDomainDb(scoped, async () => {
        expect(domainDb()).toBe(scoped);
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');

    await runWithDomainDb(marker('next'), async () => {
      expect(labelOf(domainDb())).toBe('next');
    });
  });
});
