import { compute429RetryDelayMs } from '@/src/features/http/core/retryBackoff';

describe('compute429RetryDelayMs', () => {
  it('uses exponential base delay (1s, 2s, 4s, ...)', () => {
    const d0 = compute429RetryDelayMs({ retryCount: 0, random01: () => 0 });
    const d1 = compute429RetryDelayMs({ retryCount: 1, random01: () => 0 });
    const d2 = compute429RetryDelayMs({ retryCount: 2, random01: () => 0 });

    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
  });

  it('respects retry-after header when larger than exponential base', () => {
    const delay = compute429RetryDelayMs({ retryCount: 0, retryAfterSeconds: 10, random01: () => 0 });
    expect(delay).toBe(10_000);
  });

  it('adds jitter in [0, 249] by default', () => {
    const dMin = compute429RetryDelayMs({ retryCount: 0, random01: () => 0 });
    const dMax = compute429RetryDelayMs({ retryCount: 0, random01: () => 0.999999 });

    expect(dMin).toBe(1000);
    expect(dMax).toBe(1249);
  });

  it('treats invalid retryAfterSeconds as absent', () => {
    const delay = compute429RetryDelayMs({ retryCount: 0, retryAfterSeconds: Number.NaN, random01: () => 0 });
    expect(delay).toBe(1000);
  });
});
