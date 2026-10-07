export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ModelTurn =
  | { kind: 'plan'; arguments: unknown }
  | { kind: 'clarify'; question: string }
  | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Usage from a Responses payload. Missing usage is null, not a zero call. */
export function readUsage(body: unknown): ModelUsage | null {
  const record = asRecord(body);
  const usage = asRecord(record?.usage);
  if (!usage) return null;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return {
    inputTokens: Math.max(0, Math.floor(input)),
    outputTokens: Math.max(0, Math.floor(output)),
  };
}

/**
 * One function call is the whole turn. A second call, prose, or broken JSON is
 * invalid. Nothing here describes a follow-up request.
 */
export function parseResponsesOutput(body: unknown): ModelTurn {
  const record = asRecord(body);
  const output = record?.output;
  if (!Array.isArray(output)) return { kind: 'invalid' };

  const calls = output.filter((item) => asRecord(item)?.type === 'function_call');
  if (calls.length !== 1) return { kind: 'invalid' };

  const call = asRecord(calls[0]);
  if (!call || typeof call.arguments !== 'string') return { kind: 'invalid' };

  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { kind: 'invalid' };
  }

  if (call.name === 'propose_plan') return { kind: 'plan', arguments: args };
  if (call.name === 'ask_clarification') {
    const question = asRecord(args)?.question;
    if (typeof question !== 'string' || question.trim().length === 0) return { kind: 'invalid' };
    return { kind: 'clarify', question: question.trim().slice(0, 1000) };
  }
  return { kind: 'invalid' };
}

/** HTTP 200 counts. A non-200 counts only when the body included usage. */
export function callWasBilled(input: {
  networkError: boolean;
  httpStatus: number;
  hasUsage: boolean;
}): boolean {
  if (input.networkError) return false;
  return input.httpStatus === 200 || input.hasUsage;
}
