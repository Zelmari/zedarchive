import { describe, expect, it } from 'vitest';
import { estimateCallMicros, MAX_OUTPUT_TOKENS } from '@/lib/clerk/limits';
import { parseModelPlan, planSchemaForCandidates, refuseLocally } from '@/lib/clerk/plan';

const ids = ['abc', 'def'];

describe('estimateCallMicros', () => {
  it('charges 1 micro per 10 input tokens and 1 micro per 2 output tokens', () => {
    expect(estimateCallMicros(3000, 200)).toBe(300 + 100);
    expect(estimateCallMicros(1, 1)).toBe(1 + 1);
    expect(estimateCallMicros(11, 3)).toBe(2 + 2);
  });

  it('reserves the output cap when the output size is unknown', () => {
    expect(estimateCallMicros(100)).toBe(10 + Math.ceil(MAX_OUTPUT_TOKENS / 2));
  });
});

describe('parseModelPlan', () => {
  it('accepts a rating inside 1 to 10 for a candidate id', () => {
    const parsed = parseModelPlan(
      { actions: [{ type: 'set_rating', entryId: 'abc', rating: 9 }] },
      ids,
    );
    expect(parsed.ok).toBe(true);
  });

  it('rejects extra keys', () => {
    const parsed = parseModelPlan(
      { actions: [{ type: 'set_rating', entryId: 'abc', rating: 9, coverImage: 'x' }] },
      ids,
    );
    expect(parsed).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unknown operation', () => {
    const parsed = parseModelPlan({ actions: [{ type: 'drop_table', entryId: 'abc' }] }, ids);
    expect(parsed.ok).toBe(false);
  });

  it('rejects an id that was not in the candidate set', () => {
    const parsed = parseModelPlan(
      { actions: [{ type: 'set_rating', entryId: 'someone-else', rating: 9 }] },
      ids,
    );
    expect(parsed).toEqual({ ok: false, reason: 'unknown_id' });
  });

  it('rejects a rating of 11', () => {
    const parsed = parseModelPlan(
      { actions: [{ type: 'set_rating', entryId: 'abc', rating: 11 }] },
      ids,
    );
    expect(parsed).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an increment of 0 and an increment of 10000', () => {
    expect(
      parseModelPlan(
        { actions: [{ type: 'increment_secondary', entryId: 'abc', amount: 0, unit: 'chapter' }] },
        ids,
      ).ok,
    ).toBe(false);
    expect(
      parseModelPlan(
        {
          actions: [
            { type: 'increment_secondary', entryId: 'abc', amount: 10000, unit: 'chapter' },
          ],
        },
        ids,
      ).ok,
    ).toBe(false);
  });

  it('rejects a sixth action', () => {
    const actions = Array.from({ length: 6 }, () => ({
      type: 'set_rating' as const,
      entryId: 'abc',
      rating: 8,
    }));
    expect(parseModelPlan({ actions }, ids)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a create mixed with an update', () => {
    const parsed = parseModelPlan(
      {
        actions: [
          { type: 'set_rating', entryId: 'abc', rating: 8 },
          {
            type: 'create_from_catalog',
            category: 'book',
            query: 'Dune',
            author: null,
            year: null,
          },
        ],
      },
      ids,
    );
    expect(parsed).toEqual({ ok: false, reason: 'mixed_create' });
  });

  it('does not accept a catalog hit from the model', () => {
    const parsed = parseModelPlan(
      {
        actions: [
          {
            type: 'create_from_catalog',
            category: 'book',
            query: 'Dune',
            author: null,
            year: null,
            hit: { sourceId: 'ol:1', title: 'Dune' },
          },
        ],
      },
      [],
    );
    expect(parsed).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('planSchemaForCandidates', () => {
  it('pins candidate ids and forbids extra keys', () => {
    const schema = planSchemaForCandidates(['abc', 'def']);
    const encoded = JSON.stringify(schema);
    expect(encoded).toContain('"enum":["abc","def"]');
    expect(encoded).toContain('"additionalProperties":false');
    expect(encoded).not.toContain('coverImage');
    expect(encoded).not.toContain('synopsis');
  });
});

describe('refuseLocally', () => {
  it('refuses account deletion, rewatch, plot, recommendations, and stats', () => {
    expect(refuseLocally('Delete my account')).toMatch(/settings/i);
    expect(refuseLocally('I rewatched Dune')).toMatch(/editor/i);
    expect(refuseLocally('what happens in the last chapter')).toMatch(/plot/i);
    expect(refuseLocally('what should I watch next')).toMatch(/recommend/i);
    expect(refuseLocally('how many books have I finished')).toMatch(/stats/i);
  });

  it('does not refuse a normal progress sentence', () => {
    expect(refuseLocally('I read 3 more chapters of Dune')).toBeNull();
    expect(refuseLocally('I watched Dune')).toBeNull();
  });
});
