export type RetryBackoffConfig = {
  baseDelayMs?: number; // default 1000
  maxJitterMs?: number; // default 250
};

export function compute429RetryDelayMs(args: {
  retryCount: number;
  retryAfterSeconds?: number;
  random01?: () => number;
  config?: RetryBackoffConfig;
}): number {
  const baseDelayMs = args.config?.baseDelayMs ?? 1000;
  const maxJitterMs = args.config?.maxJitterMs ?? 250;

  const retryCount = Math.max(0, Math.floor(args.retryCount));
  const baseDelay = Math.pow(2, retryCount) * baseDelayMs;

  const retryAfterSeconds = args.retryAfterSeconds;
  const headerDelay = Number.isFinite(retryAfterSeconds) ? Number(retryAfterSeconds) * 1000 : 0;

  const rnd = args.random01 ?? Math.random;
  const jitter = Math.floor(rnd() * maxJitterMs);

  return Math.max(baseDelay, headerDelay) + jitter;
}
