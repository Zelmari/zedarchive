import { describe, expect, it } from 'vitest';
import {
  authorizeCall,
  crossedFleetAlert,
  pageBudget,
  reconcileUsage,
  settleCallsDelta,
  utcUsageDay,
} from '@/domain/clerk-quota';
import { FLEET_DAY_MICROS, estimateCallMicros } from '@/lib/clerk/limits';

describe('authorizeCall', () => {
  it('rejects the 15th call and a fleet estimate past one dollar', () => {
    expect(
      authorizeCall({
        calls: 15,
        fleetSpentMicros: 0,
        fleetReservedMicros: 0,
        estimateMicros: 400,
      }),
    ).toBe(false);
    expect(
      authorizeCall({
        calls: 1,
        fleetSpentMicros: FLEET_DAY_MICROS - 100,
        fleetReservedMicros: 0,
        estimateMicros: 400,
      }),
    ).toBe(false);
  });

  it('allows the 14th call and a fleet total that lands on one dollar', () => {
    expect(
      authorizeCall({
        calls: 14,
        fleetSpentMicros: 0,
        fleetReservedMicros: 0,
        estimateMicros: 400,
      }),
    ).toBe(true);
    expect(
      authorizeCall({
        calls: 0,
        fleetSpentMicros: FLEET_DAY_MICROS - 400,
        fleetReservedMicros: 0,
        estimateMicros: 400,
      }),
    ).toBe(true);
  });
});

describe('reconcileUsage', () => {
  it('counts an accepted call at the short-context price and releases the reserve', () => {
    const estimate = estimateCallMicros(3000);
    const result = reconcileUsage({
      estimate,
      accepted: true,
      inputTokens: 3000,
      outputTokens: 200,
    });
    expect(estimateCallMicros(3000, 200)).toBe(400);
    expect(result).toEqual({ callsDelta: 1, spentDelta: 400, reservedDelta: -estimate });
  });

  it('releases the reserve and does not count a rejected call', () => {
    expect(
      reconcileUsage({ estimate: 256, accepted: false, inputTokens: null, outputTokens: null }),
    ).toEqual({ callsDelta: 0, spentDelta: 0, reservedDelta: -256 });
  });

  it('keeps the estimate when the provider accepts the call and omits usage', () => {
    expect(
      reconcileUsage({ estimate: 256, accepted: true, inputTokens: null, outputTokens: 20 }),
    ).toEqual({ callsDelta: 1, spentDelta: 256, reservedDelta: -256 });
  });
});

describe('settleCallsDelta', () => {
  it('keeps a billed call and returns a slot the provider did not bill', () => {
    expect(settleCallsDelta(1)).toBe(0);
    expect(settleCallsDelta(0)).toBe(-1);
  });
});

describe('pageBudget', () => {
  it('rests at 15 calls or when the fleet dollar is gone', () => {
    expect(pageBudget({ calls: 15, fleetSpentMicros: 0, fleetReservedMicros: 0 })).toEqual({
      remaining: 0,
      resting: true,
    });
    expect(
      pageBudget({ calls: 2, fleetSpentMicros: 600_000, fleetReservedMicros: 400_000 }),
    ).toEqual({ remaining: 0, resting: true });
    expect(pageBudget({ calls: 3, fleetSpentMicros: 10, fleetReservedMicros: 0 })).toEqual({
      remaining: 12,
      resting: false,
    });
  });
});

describe('crossedFleetAlert', () => {
  it('names the threshold a settle crosses, and the higher one when both move', () => {
    expect(crossedFleetAlert(499_999, 500_000)).toBe(500_000);
    expect(crossedFleetAlert(100, 900_000)).toBe(800_000);
    expect(crossedFleetAlert(800_000, 900_000)).toBeNull();
  });
});

describe('utcUsageDay', () => {
  it('uses the UTC date', () => {
    expect(utcUsageDay(new Date('2026-10-07T23:30:00.000Z'))).toBe('2026-10-07');
  });
});
