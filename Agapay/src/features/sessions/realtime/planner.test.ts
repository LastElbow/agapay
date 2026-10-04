import { buildSessionRealtimePlan } from '@/src/features/sessions/realtime/planner';
import {
  upcomingSessionsQueryKey,
  allSessionsQueryKey,
  sessionDetailQueryKey,
  sessionLogsQueryKey,
} from '@/src/features/sessions/core/queryKeys';

describe('buildSessionRealtimePlan', () => {
  it('includes core invalidations + clears timer on SessionCancelled', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionCancelled', sessionId: 5 }, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(upcomingSessionsQueryKey);
    expect(plan.invalidateQueryKeys).toContainEqual(allSessionsQueryKey);
    expect(plan.invalidateQueryKeys).toContainEqual(sessionDetailQueryKey(5));
    expect(plan.clearStorageKeys).toContain('sessionTimer:5');
  });

  it('sets timer on SessionStarted when startAtMs provided', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionStarted', sessionId: 7, startAtMs: 12345 }, undefined);
    expect(plan.setStorageItems).toEqual([
      { key: 'sessionTimer:7', value: JSON.stringify({ startAtMs: 12345 }) },
    ]);
  });

  it('does not set timer on SessionStarted when startAtMs is invalid', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionStarted', sessionId: 7, startAtMs: 'nope' }, undefined);
    expect(plan.setStorageItems).toEqual([]);
  });

  it('coerces string sessionId values', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionCancelled', sessionId: '12' }, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(sessionDetailQueryKey(12));
    expect(plan.clearStorageKeys).toContain('sessionTimer:12');
  });

  it('invalidates logs on SessionLogAdded', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionLogAdded', sessionId: 9 }, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(sessionLogsQueryKey(9));
  });

  it('invalidates logs on SessionMarkedDone', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionMarkedDone', sessionId: 10 }, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(sessionLogsQueryKey(10));
  });

  it('clears timer on SessionCompleted', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionCompleted', sessionId: 21 }, undefined);
    expect(plan.clearStorageKeys).toContain('sessionTimer:21');
  });

  it('always includes list invalidations even for unknown events', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'UnknownEvent', sessionId: 5 }, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(upcomingSessionsQueryKey);
    expect(plan.invalidateQueryKeys).toContainEqual(allSessionsQueryKey);
  });

  it('does not emit duplicate invalidation keys', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionMarkedDone', sessionId: 10 }, 10);
    const unique = new Set(plan.invalidateQueryKeys.map((k) => JSON.stringify(k)));
    expect(unique.size).toBe(plan.invalidateQueryKeys.length);
  });

  it('ignores invalid sessionId', () => {
    const plan = buildSessionRealtimePlan({ eventName: 'SessionCancelled', sessionId: 'NaN' }, undefined);
    expect(plan.clearStorageKeys).toEqual([]);
  });

  it('handles missing payload gracefully', () => {
    const plan = buildSessionRealtimePlan(undefined as any, undefined);
    expect(plan.invalidateQueryKeys).toContainEqual(upcomingSessionsQueryKey);
    expect(plan.invalidateQueryKeys).toContainEqual(allSessionsQueryKey);
  });
});
