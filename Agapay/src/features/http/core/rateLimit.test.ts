import { planRateLimitedRequest, pruneRequestStartTimes } from '@/src/features/http/core/rateLimit';

describe('rateLimit core', () => {
  it('prunes times outside the window (>= windowMs)', () => {
    const windowMs = 1000;
    const nowMs = 2000;
    const pruned = pruneRequestStartTimes([999, 1000, 1001, 1500], nowMs, windowMs);
    // now - 999 = 1001 (pruned)
    // now - 1000 = 1000 (boundary, pruned)
    // now - 1001 = 999 (kept)
    expect(pruned).toEqual([1001, 1500]);
  });

  it('allows immediately when under the max', () => {
    const plan = planRateLimitedRequest([0, 100], 200, 1000, 3);
    expect(plan.waitMs).toBe(0);
    expect(plan.nextStartTimes).toEqual([0, 100, 200]);
  });

  it('computes wait when at the max', () => {
    const windowMs = 1000;
    const max = 3;
    // 3 requests already in the window; next at t=900 should wait until t=1000
    const plan = planRateLimitedRequest([0, 100, 200], 900, windowMs, max);
    expect(plan.waitMs).toBe(100);
    expect(plan.nextStartTimes).toEqual([0, 100, 200]);
  });

  it('after waiting, the next plan allows and appends now', () => {
    const windowMs = 1000;
    const max = 3;
    const first = planRateLimitedRequest([0, 100, 200], 900, windowMs, max);
    expect(first.waitMs).toBe(100);

    const second = planRateLimitedRequest(first.nextStartTimes, 1000, windowMs, max);
    // at now=1000, time 0 is pruned (boundary), so we can append 1000
    expect(second.waitMs).toBe(0);
    expect(second.nextStartTimes).toEqual([100, 200, 1000]);
  });
});
