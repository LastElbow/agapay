import type { ClockPort } from '@/src/shared/ports/clock';

export type RefreshTimingConfig = {
  refreshBeforeMs?: number; // default 60s
  minDelayMs?: number; // default 5s
};

export function computePreemptiveRefreshDelayMs(
  expSeconds: number,
  clock: ClockPort,
  config?: RefreshTimingConfig
): number {
  const refreshBeforeMs = config?.refreshBeforeMs ?? 60_000;
  const minDelayMs = config?.minDelayMs ?? 5_000;

  const expMs = expSeconds * 1000;
  const rawDelay = expMs - clock.now() - refreshBeforeMs;
  return Math.max(rawDelay, minDelayMs);
}
