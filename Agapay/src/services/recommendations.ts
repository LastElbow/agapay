import apiClient from "@/api/client";
import {
  getItem as ssGet,
  setItem as ssSet,
  deleteItem as ssDelete,
} from "@/src/utils/safeSecureStore";
import { createRecommendationsService } from "@/src/features/recommendations/usecases/recommendationsService";
import { systemClock } from "@/src/shared/ports/clock";

// ============================================================================
// Types
// ============================================================================

export type Recommendation = {
  therapistId: number;
  therapistName: string;
  profilePictureUrl: string | null;
  matchScore: number;
  tier: "Recommended" | "OtherOption";
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

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = "recommendationsCache";
// Cache TTL: 15 minutes (recommendations shouldn't change frequently)
const CACHE_TTL_MS = 15 * 60 * 1000;

// React Query key for recommendations
export const RECOMMENDATIONS_QUERY_KEY = ["recommendations", "me"] as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generates a simple hash from the user's preferences to detect changes.
 * When preferences change, the cache should be invalidated.
 */
const feature = createRecommendationsService({
  http: {
    get: (url, config) => apiClient.get(url, config).then((res) => ({ data: res.data })),
    post: (url, body, config) => apiClient.post(url, body, config).then((res) => ({ data: res.data })),
    put: (url, body, config) => apiClient.put(url, body, config).then((res) => ({ data: res.data })),
    delete: (url, config) => apiClient.delete(url, config).then((res) => ({ data: res.data })),
  },
  storage: {
    getItem: (k) => ssGet(k),
    setItem: (k, v) => ssSet(k, v),
    deleteItem: (k) => ssDelete(k),
  },
  clock: systemClock,
  cacheKey: CACHE_KEY,
  ttlMs: CACHE_TTL_MS,
});

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Retrieves cached recommendations if valid
 */
export async function getCachedRecommendations(
  userId: string
): Promise<Recommendation[] | null> {
  try {
    const data = await feature.getCachedRecommendations(userId);
    if (data) console.log("[Recommendations] Serving from cache");
    return data;
  } catch (err) {
    console.warn("Failed to read recommendations cache", err);
    return null;
  }
}

/**
 * Stores recommendations in secure cache
 */
export async function cacheRecommendations(
  userId: string,
  data: Recommendation[]
): Promise<void> {
  try {
    await feature.cacheRecommendations(userId, data);
    console.log("[Recommendations] Cached successfully");
  } catch (err) {
    console.warn("Failed to cache recommendations", err);
  }
}

/**
 * Clears the recommendations cache
 */
export async function clearRecommendationsCache(): Promise<void> {
  try {
    await feature.clearRecommendationsCache();
    console.log("[Recommendations] Cache cleared");
  } catch (err) {
    console.warn("Failed to clear recommendations cache", err);
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetches recommendations from API with caching support.
 * This is the main function to use with React Query.
 */
export async function fetchRecommendations(
  userId: string | null | undefined,
  options?: { forceRefresh?: boolean }
): Promise<Recommendation[]> {
  const { forceRefresh = false } = options ?? {};
  console.log("[Recommendations] Fetching from API");
  const start = Date.now();
  const data = await feature.fetchRecommendations(userId, { forceRefresh });
  const duration = Date.now() - start;
  console.log(`[Recommendations] API response in ${duration}ms`);
  return data;
}

/**
 * Invalidates the cache and fetches fresh recommendations.
 * Use this after updating preferences.
 */
export async function refreshRecommendations(
  userId: string | null | undefined
): Promise<Recommendation[]> {
  return feature.refreshRecommendations(userId);
}

/**
 * Call this when preferences are updated to invalidate the cache
 */
export async function invalidateRecommendationsOnPreferenceChange(): Promise<void> {
  await clearRecommendationsCache();
}
