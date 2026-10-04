export type RecommendationCache<T> = {
  userId: string;
  data: T[];
  timestamp: number;
  preferencesHash: string;
};

export function parseRecommendationCache<T>(raw: string | null): RecommendationCache<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RecommendationCache<T>;
    if (
      parsed &&
      typeof parsed.userId === 'string' &&
      Array.isArray(parsed.data) &&
      typeof parsed.timestamp === 'number' &&
      typeof parsed.preferencesHash === 'string'
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function isCacheFresh(cache: { timestamp: number } | null, nowMs: number, ttlMs: number): boolean {
  if (!cache) return false;
  return nowMs - cache.timestamp < ttlMs;
}

export function isCacheForUser(cache: { userId: string } | null, userId: string): boolean {
  if (!cache || !userId) return false;
  return cache.userId === userId;
}
