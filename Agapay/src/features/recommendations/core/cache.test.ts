import { parseRecommendationCache, isCacheFresh, isCacheForUser } from '@/src/features/recommendations/core/cache';

describe('recommendations cache helpers', () => {
  it('parses a valid cache object', () => {
    const raw = JSON.stringify({
      userId: 'u1',
      data: [{ therapistId: 1 }],
      timestamp: 1000,
      preferencesHash: 'u1-abc',
    });
    const parsed = parseRecommendationCache<any>(raw);
    expect(parsed?.userId).toBe('u1');
    expect(Array.isArray(parsed?.data)).toBe(true);
  });

  it('returns null for invalid JSON', () => {
    expect(parseRecommendationCache<any>('not-json')).toBeNull();
  });

  it('checks freshness and ownership', () => {
    const cache = { userId: 'u1', timestamp: 1000 };
    expect(isCacheForUser(cache, 'u1')).toBe(true);
    expect(isCacheForUser(cache, 'u2')).toBe(false);

    expect(isCacheFresh(cache, 1000 + 10, 100)).toBe(true);
    expect(isCacheFresh(cache, 1000 + 150, 100)).toBe(false);
  });
});
