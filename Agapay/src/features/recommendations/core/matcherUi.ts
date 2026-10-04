import type { Recommendation } from '@/src/services/recommendations';

type AxiosLikeError = {
  response?: { status?: number; data?: any } | null;
  message?: string;
} | null | undefined;

type UserLike = {
  id?: unknown;
  _id?: unknown;
  userId?: unknown;
} | null | undefined;

export function getUserIdForRecommendations(user: UserLike): string | null {
  const raw = user?.id ?? user?._id ?? user?.userId ?? null;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function getUserFacingRecommendationsError(args: {
  isError: boolean;
  queryError: AxiosLikeError;
}): string | null {
  if (!args.isError || !args.queryError) return null;

  const e: any = args.queryError;
  const status = e?.response?.status as number | undefined;
  const serverMsg = e?.response?.data?.message || e?.message || null;

  if (status === 401) {
    return 'Your session expired. Please sign in again.';
  }
  if (status === 403) {
    return serverMsg || 'You need a Patient account to view recommendations.';
  }
  if (status === 409 || status === 404) {
    return serverMsg || 'Set your patient preferences first to view recommendations.';
  }
  return 'Failed to load recommendations.';
}

export function splitRecommendationsByThreshold(
  items: Recommendation[] | null | undefined,
  threshold = 0.7,
): { recommendedItems: Recommendation[]; otherItems: Recommendation[] } {
  const recommendedItems: Recommendation[] = [];
  const otherItems: Recommendation[] = [];

  for (const item of items ?? []) {
    const score = (item?.matchScore ?? 0) as number;
    if (score >= threshold) recommendedItems.push(item);
    else otherItems.push(item);
  }

  return { recommendedItems, otherItems };
}

export function getMatchPercentage(score: unknown): number {
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatGenderLabel(gender: unknown): string {
  const trimmed = typeof gender === 'string' ? gender.trim() : '';
  return trimmed.length > 0 ? trimmed : 'Gender not specified';
}

export function formatListOrNotSpecified(values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return 'Not specified';
  const cleaned = values
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0);
  return cleaned.length > 0 ? cleaned.join(', ') : 'Not specified';
}
