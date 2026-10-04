export type RateLimitPlan = {
  waitMs: number;
  nextStartTimes: number[];
};

export function pruneRequestStartTimes(
  startTimes: readonly number[],
  nowMs: number,
  windowMs: number
): number[] {
  return startTimes.filter((t) => nowMs - t < windowMs);
}

export function planRateLimitedRequest(
  startTimes: readonly number[],
  nowMs: number,
  windowMs: number,
  maxRequestsPerWindow: number
): RateLimitPlan {
  const pruned = pruneRequestStartTimes(startTimes, nowMs, windowMs);

  if (pruned.length < maxRequestsPerWindow) {
    return { waitMs: 0, nextStartTimes: [...pruned, nowMs] };
  }

  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (nowMs - oldest));
  return { waitMs, nextStartTimes: pruned };
}
