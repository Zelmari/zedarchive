/** Caps from the locked clerk design. Dollar math is integer microdollars. */

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_PROMPT_TOKENS = 6000;
export const MAX_OUTPUT_TOKENS = 512;
export const MAX_CANDIDATES = 8;
export const SMALL_LIBRARY = 40;
export const MAX_ACTIONS = 5;
export const MAX_CALLS_PER_USER_DAY = 15;
/** $1 estimated per UTC day for the whole fleet. */
export const FLEET_DAY_MICROS = 1_000_000;
export const PROPOSAL_TTL_MS = 15 * 60 * 1000;
export const INCREMENT_SECONDARY_MAX = 50;
export const INCREMENT_PRIMARY_MAX = 10;
export const MODEL_ID = 'gpt-6-luna';
/** Config swap if Luna is retired. Not an automatic second call. */
export const FALLBACK_MODEL_ID = 'gpt-4.1-mini';

/**
 * Short-context Luna price: $0.10 / 1M input and $0.50 / 1M output.
 * 1 dollar = 1_000_000 micros, so input is 1 micro per 10 tokens and output is 1 micro per 2 tokens.
 * When the output size is unknown, reserve the output cap.
 */
export function estimateCallMicros(
  inputTokens: number,
  outputTokens: number = MAX_OUTPUT_TOKENS,
): number {
  const input = Math.max(0, Math.ceil(inputTokens));
  const output = Math.max(0, Math.ceil(outputTokens));
  return Math.ceil(input / 10) + Math.ceil(output / 2);
}

/** chars/4, rounded up. This is the reject line for an assembled prompt. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
