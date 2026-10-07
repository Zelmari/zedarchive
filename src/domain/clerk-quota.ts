import { FLEET_DAY_MICROS, MAX_CALLS_PER_USER_DAY, estimateCallMicros } from '@/lib/clerk/limits';

/** Warn once when the fleet crosses these. They do not block a call. */
export const FLEET_ALERT_MICROS = [500_000, 800_000] as const;

export function utcUsageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A model call is allowed when this person is under 15 calls today and the
 * fleet still has room for the reserved estimate. Exactly $1 is still allowed.
 */
export function authorizeCall(input: {
  calls: number;
  fleetSpentMicros: number;
  fleetReservedMicros: number;
  estimateMicros: number;
}): boolean {
  if (input.calls >= MAX_CALLS_PER_USER_DAY) return false;
  const fleet =
    input.fleetSpentMicros + input.fleetReservedMicros + Math.max(0, input.estimateMicros);
  return fleet <= FLEET_DAY_MICROS;
}

export interface UsageReconciliation {
  callsDelta: number;
  spentDelta: number;
  /** Negative. Subtract this from the reserved column (it is already signed). */
  reservedDelta: number;
}

/**
 * Accepted calls (HTTP 200, or any body that carried usage) count.
 * A network failure or a non-200 without usage releases the reserve and does not count.
 * When the provider accepts the call but omits usage, the estimate stays spent.
 */
export function reconcileUsage(input: {
  estimate: number;
  accepted: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
}): UsageReconciliation {
  const estimate = Math.max(0, input.estimate);
  if (!input.accepted) {
    return { callsDelta: 0, spentDelta: 0, reservedDelta: -estimate };
  }
  const spent =
    input.inputTokens == null || input.outputTokens == null
      ? estimate
      : estimateCallMicros(input.inputTokens, input.outputTokens);
  return { callsDelta: 1, spentDelta: spent, reservedDelta: -estimate };
}

/** The higher threshold wins when one call jumps both lines. */
export function crossedFleetAlert(beforeSpent: number, afterSpent: number): number | null {
  if (beforeSpent < 800_000 && afterSpent >= 800_000) return 800_000;
  if (beforeSpent < 500_000 && afterSpent >= 500_000) return 500_000;
  return null;
}

export function pageBudget(input: {
  calls: number;
  fleetSpentMicros: number;
  fleetReservedMicros: number;
}): { remaining: number; resting: boolean } {
  const calls = Math.max(0, input.calls);
  const fleetUsed = Math.max(0, input.fleetSpentMicros) + Math.max(0, input.fleetReservedMicros);
  const resting = calls >= MAX_CALLS_PER_USER_DAY || fleetUsed >= FLEET_DAY_MICROS;
  return {
    remaining: resting ? 0 : MAX_CALLS_PER_USER_DAY - calls,
    resting,
  };
}
