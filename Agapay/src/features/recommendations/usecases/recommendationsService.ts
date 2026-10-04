import type { ClockPort } from '@/src/shared/ports/clock';
import type { HttpPort } from '@/src/shared/ports/http';
import type { StoragePort } from '@/src/shared/ports/storage';
import {
  isCacheFresh,
  isCacheForUser,
  parseRecommendationCache,
  type RecommendationCache,
} from '@/src/features/recommendations/core/cache';
import { hashPreferences } from '@/src/features/recommendations/core/hash';
import { snapshotFromPreferencesResponse } from '@/src/features/recommendations/core/normalize';

export type Recommendation = {
  therapistId: number;
  therapistName: string;
  profilePictureUrl: string | null;
  matchScore: number;
  tier: 'Recommended' | 'OtherOption';
  tierLabel: string;
  breakdown: Record<string, number> | null;
  averageRating?: number | null;
  ratingCount?: number | null;
  feePerSession?: number | null;
  specializations?: string[];
  serviceAreas?: string[];
  gender?: string | null;
  licenseNumber?: string | null;
};

export type RecommendationsDeps = {
  http: HttpPort;
  storage: StoragePort;
  clock: ClockPort;
  cacheKey?: string;
  ttlMs?: number;
  preferencesUrl?: string;
  recommendationsUrl?: string;
};

const DEFAULT_CACHE_KEY = 'recommendationsCache';
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PREFS_URL = '/api/Preferences/me';
const DEFAULT_RECS_URL = '/api/Recommendation/me';

async function computePreferencesHash(
  userId: string,
  deps: { http: HttpPort; clock: ClockPort; preferencesUrl: string }
): Promise<string> {
  try {
    const res = await deps.http.get<any>(deps.preferencesUrl);
    const snapshot = snapshotFromPreferencesResponse(res?.data ?? {});
    return hashPreferences(userId, snapshot);
  } catch {
    return `${userId}-${deps.clock.now()}`;
  }
}

export function createRecommendationsService(deps: RecommendationsDeps) {
  const cacheKey = deps.cacheKey ?? DEFAULT_CACHE_KEY;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const preferencesUrl = deps.preferencesUrl ?? DEFAULT_PREFS_URL;
  const recommendationsUrl = deps.recommendationsUrl ?? DEFAULT_RECS_URL;

  async function clearRecommendationsCache(): Promise<void> {
    await deps.storage.deleteItem(cacheKey);
  }

  async function getCachedRecommendations(userId: string): Promise<Recommendation[] | null> {
    if (!userId) return null;

    const raw = await deps.storage.getItem(cacheKey);
    const cache = parseRecommendationCache<Recommendation>(raw) as RecommendationCache<Recommendation> | null;

    if (!cache || !isCacheForUser(cache, userId) || !isCacheFresh(cache, deps.clock.now(), ttlMs)) {
      return null;
    }

    const currentHash = await computePreferencesHash(userId, { http: deps.http, clock: deps.clock, preferencesUrl });
    if (cache.preferencesHash !== currentHash) {
      await clearRecommendationsCache();
      return null;
    }

    return cache.data;
  }

  async function cacheRecommendations(userId: string, data: Recommendation[]): Promise<void> {
    if (!userId || !Array.isArray(data)) return;

    const preferencesHash = await computePreferencesHash(userId, { http: deps.http, clock: deps.clock, preferencesUrl });
    const cache: RecommendationCache<Recommendation> = {
      userId,
      data,
      timestamp: deps.clock.now(),
      preferencesHash,
    };

    await deps.storage.setItem(cacheKey, JSON.stringify(cache));
  }

  async function fetchRecommendations(
    userId: string | null | undefined,
    options?: { forceRefresh?: boolean }
  ): Promise<Recommendation[]> {
    const forceRefresh = options?.forceRefresh ?? false;

    if (userId && !forceRefresh) {
      const cached = await getCachedRecommendations(userId);
      if (cached !== null) return cached;
    }

    const res = await deps.http.get<Recommendation[]>(recommendationsUrl);
    const data = Array.isArray(res.data) ? res.data : [];

    if (userId) {
      await cacheRecommendations(userId, data);
    }

    return data;
  }

  async function refreshRecommendations(userId: string | null | undefined): Promise<Recommendation[]> {
    await clearRecommendationsCache();
    return fetchRecommendations(userId, { forceRefresh: true });
  }

  return {
    getCachedRecommendations,
    cacheRecommendations,
    clearRecommendationsCache,
    fetchRecommendations,
    refreshRecommendations,
  };
}
