import { describe, expect, it } from 'vitest';
import { callWasBilled, parseResponsesOutput, readUsage } from '@/domain/clerk-response';

function body(output: unknown[], usage?: { input_tokens: number; output_tokens: number }) {
  return { output, usage };
}

describe('parseResponsesOutput', () => {
  it('reads one propose_plan call', () => {
    const turn = parseResponsesOutput(
      body([
        {
          type: 'function_call',
          name: 'propose_plan',
          arguments: JSON.stringify({
            actions: [{ type: 'set_rating', entryId: 'dune', rating: 8 }],
          }),
        },
      ]),
    );
    expect(turn.kind).toBe('plan');
    if (turn.kind !== 'plan') return;
    expect(turn.arguments).toEqual({
      actions: [{ type: 'set_rating', entryId: 'dune', rating: 8 }],
    });
  });

  it('reads one clarification', () => {
    const turn = parseResponsesOutput(
      body([
        {
          type: 'function_call',
          name: 'ask_clarification',
          arguments: JSON.stringify({ question: 'Which Dune?' }),
        },
      ]),
    );
    expect(turn).toEqual({ kind: 'clarify', question: 'Which Dune?' });
  });

  it('rejects a second function call instead of describing another request', () => {
    const turn = parseResponsesOutput(
      body([
        { type: 'function_call', name: 'propose_plan', arguments: '{"actions":[]}' },
        { type: 'function_call', name: 'ask_clarification', arguments: '{"question":"Again?"}' },
      ]),
    );
    expect(turn).toEqual({ kind: 'invalid' });
  });

  it('rejects prose, broken JSON, and an unknown tool', () => {
    expect(parseResponsesOutput(body([{ type: 'message', content: 'I updated it.' }]))).toEqual({
      kind: 'invalid',
    });
    expect(
      parseResponsesOutput(
        body([{ type: 'function_call', name: 'propose_plan', arguments: '{not json' }]),
      ),
    ).toEqual({ kind: 'invalid' });
    expect(
      parseResponsesOutput(body([{ type: 'function_call', name: 'web_search', arguments: '{}' }])),
    ).toEqual({ kind: 'invalid' });
  });
});

describe('readUsage', () => {
  it('reads input_tokens and output_tokens', () => {
    expect(readUsage(body([], { input_tokens: 3000, output_tokens: 200 }))).toEqual({
      inputTokens: 3000,
      outputTokens: 200,
    });
    expect(readUsage({ output: [] })).toBeNull();
  });
});

describe('callWasBilled', () => {
  it('counts HTTP 200 and any body that carried usage', () => {
    expect(callWasBilled({ networkError: false, httpStatus: 200, hasUsage: false })).toBe(true);
    expect(callWasBilled({ networkError: false, httpStatus: 500, hasUsage: true })).toBe(true);
    expect(callWasBilled({ networkError: false, httpStatus: 500, hasUsage: false })).toBe(false);
    expect(callWasBilled({ networkError: true, httpStatus: 200, hasUsage: true })).toBe(false);
  });
});
