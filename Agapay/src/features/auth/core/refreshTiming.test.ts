import { computePreemptiveRefreshDelayMs } from '@/src/features/auth/core/refreshTiming';

const clock = (nowMs: number) => ({ now: () => nowMs });

describe('computePreemptiveRefreshDelayMs', () => {
  it('computes delay for far expiry', () => {
    const nowMs = 1_000_000;
    const expSeconds = Math.floor((nowMs + 120_000) / 1000);
    const delay = computePreemptiveRefreshDelayMs(expSeconds, clock(nowMs), {
      refreshBeforeMs: 60_000,
      minDelayMs: 5_000,
    });
    // raw delay is ~60s
    expect(delay).toBeGreaterThanOrEqual(59_000);
    expect(delay).toBeLessThanOrEqual(61_000);
  });

  it('enforces minimum delay', () => {
    const nowMs = 0;
    const expSeconds = Math.floor((nowMs + 61_000) / 1000);
    const delay = computePreemptiveRefreshDelayMs(expSeconds, clock(nowMs), {
      refreshBeforeMs: 60_000,
      minDelayMs: 5_000,
    });
    expect(delay).toBe(5_000);
  });
});
