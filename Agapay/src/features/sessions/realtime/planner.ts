import { sessionDetailQueryKey, upcomingSessionsQueryKey, allSessionsQueryKey, sessionLogsQueryKey } from '@/src/features/sessions/core/queryKeys';

export type SessionRealtimePlan = {
  invalidateQueryKeys: readonly (readonly unknown[])[];
  clearStorageKeys: string[];
  setStorageItems: { key: string; value: string }[];
};

function keyToStableString(key: readonly unknown[]): string {
  // React Query keys in this app are simple arrays of primitives.
  // JSON stringify is stable enough for our use and keeps this helper dependency-free.
  return JSON.stringify(key);
}

export function buildSessionRealtimePlan(payload: any, focusedSessionId?: number): SessionRealtimePlan {
  const idNum = Number(payload?.sessionId);
  const validId = Number.isFinite(idNum) ? idNum : undefined;

  const invalidateQueryKeys: (readonly unknown[])[] = [];
  const seenKeys = new Set<string>();

  const pushKey = (key: readonly unknown[]) => {
    const stable = keyToStableString(key);
    if (seenKeys.has(stable)) return;
    seenKeys.add(stable);
    invalidateQueryKeys.push(key);
  };

  pushKey(upcomingSessionsQueryKey);
  pushKey(allSessionsQueryKey);

  if (validId) pushKey(sessionDetailQueryKey(validId));

  const clearStorageKeys: string[] = [];
  const setStorageItems: { key: string; value: string }[] = [];

  const event = String(payload?.eventName ?? '');
  const startAtMs = payload?.startAtMs;

  // Timer logic aligned with current hook behavior.
  if (validId && (event === 'SessionCancelled' || event === 'SessionMarkedDone' || event === 'SessionCompleted')) {
    clearStorageKeys.push(`sessionTimer:${validId}`);
  }

  if (validId && event === 'SessionStarted' && Number.isFinite(Number(startAtMs))) {
    setStorageItems.push({
      key: `sessionTimer:${validId}`,
      value: JSON.stringify({ startAtMs: Number(startAtMs) }),
    });
  }

  if (validId && event === 'SessionLogAdded') {
    pushKey(sessionLogsQueryKey(validId));
  }

  if (validId && event === 'SessionMarkedDone') {
    pushKey(sessionLogsQueryKey(validId));
  }

  return {
    invalidateQueryKeys,
    clearStorageKeys,
    setStorageItems,
  };
}
