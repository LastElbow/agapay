import type { ClockPort } from '@/src/shared/ports/clock';
import type { HttpPort } from '@/src/shared/ports/http';
import type { SchedulerPort, TimeoutHandle } from '@/src/shared/ports/scheduler';
import type { StoragePort } from '@/src/shared/ports/storage';
import { decodeJwtExp } from '@/src/features/auth/core/jwt';
import { computePreemptiveRefreshDelayMs } from '@/src/features/auth/core/refreshTiming';

export type SessionSource = 'auth' | 'interceptor';

export type SessionBusPort = {
  getTokens(): { accessToken: string | null; refreshToken: string | null };
  setTokens(accessToken: string | null, refreshToken: string | null, source: SessionSource): void;
};

export type AuthTokenServiceDeps = {
  http: HttpPort;
  storage: StoragePort;
  session: SessionBusPort;
  clock: ClockPort;
  scheduler: SchedulerPort;
  applyAccessToken?: (token: string | null) => void;
  refreshEndpoint?: string;
  refreshBeforeMs?: number;
  minDelayMs?: number;
  immediateRefreshDelayMs?: number;
  rememberMeKey?: string;
  accessTokenKey?: string;
  refreshTokenKey?: string;
};

export function createAuthTokenService(deps: AuthTokenServiceDeps) {
  const refreshEndpoint = deps.refreshEndpoint ?? '/api/Auth/refresh';
  const refreshBeforeMs = deps.refreshBeforeMs ?? 60_000;
  const minDelayMs = deps.minDelayMs ?? 5_000;
  const immediateRefreshDelayMs = deps.immediateRefreshDelayMs ?? 100;
  const rememberMeKey = deps.rememberMeKey ?? 'rememberMe';
  const accessTokenKey = deps.accessTokenKey ?? 'accessToken';
  const refreshTokenKey = deps.refreshTokenKey ?? 'refreshToken';

  let isRefreshing = false;
  let refreshPromise: Promise<string | null> | null = null;

  let refreshTimer: TimeoutHandle | null = null;
  let refreshTimerExp: number | null = null;

  async function readRefreshToken(): Promise<string | null> {
    const mem = deps.session.getTokens();
    if (mem.refreshToken) return mem.refreshToken;
    return (await deps.storage.getItem(refreshTokenKey)) ?? null;
  }

  async function readAccessToken(): Promise<string | null> {
    const mem = deps.session.getTokens();
    if (mem.accessToken) return mem.accessToken;
    return (await deps.storage.getItem(accessTokenKey)) ?? null;
  }

  async function persistTokens(accessToken: string | null, refreshToken: string | null): Promise<void> {
    const remember = (await deps.storage.getItem(rememberMeKey)) === 'true';
    const scope = remember ? 'local' : 'session';

    if (accessToken === null) await deps.storage.deleteItem(accessTokenKey);
    else await deps.storage.setItem(accessTokenKey, accessToken, { scope });

    if (refreshToken === null) await deps.storage.deleteItem(refreshTokenKey);
    else await deps.storage.setItem(refreshTokenKey, refreshToken, { scope });
  }

  function clearScheduledRefresh() {
    if (refreshTimer) deps.scheduler.clearTimeout(refreshTimer);
    refreshTimer = null;
    refreshTimerExp = null;
  }

  function schedulePreemptiveRefresh(accessToken: string | null) {
    if (!accessToken) {
      clearScheduledRefresh();
      return;
    }

    const exp = decodeJwtExp(accessToken);
    if (!exp) {
      clearScheduledRefresh();
      return;
    }

    if (refreshTimer && refreshTimerExp === exp) return;

    clearScheduledRefresh();

    const expMs = exp * 1000;
    const nowMs = deps.clock.now();
    const rawDelay = expMs - nowMs - refreshBeforeMs;

    if (rawDelay <= 0) {
      refreshTimer = deps.scheduler.setTimeout(() => {
        void refreshAccessToken();
      }, immediateRefreshDelayMs);
      refreshTimerExp = exp;
      return;
    }

    const delay = computePreemptiveRefreshDelayMs(exp, deps.clock, { refreshBeforeMs, minDelayMs });
    refreshTimer = deps.scheduler.setTimeout(() => {
      void refreshAccessToken();
    }, delay);

    refreshTimerExp = exp;
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (isRefreshing && refreshPromise) return refreshPromise;

    isRefreshing = true;
    refreshPromise = (async () => {
      const refreshToken = await readRefreshToken();
      const currentAccess = await readAccessToken();
      if (!refreshToken || !currentAccess) return null;

      try {
        const res = await deps.http.post<any>(refreshEndpoint, { refreshToken, accessToken: currentAccess });
        const data = res?.data ?? {};
        const newAccess: string | null = data?.accessToken ?? null;
        const newRefresh: string | null = data?.refreshToken ?? refreshToken ?? null;

        deps.applyAccessToken?.(newAccess);
        await persistTokens(newAccess, newRefresh);
        deps.session.setTokens(newAccess, newRefresh, 'interceptor');
        schedulePreemptiveRefresh(newAccess);
        return newAccess;
      } catch {
        deps.applyAccessToken?.(null);
        await persistTokens(null, null);
        deps.session.setTokens(null, null, 'interceptor');
        return null;
      } finally {
        isRefreshing = false;
      }
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  return {
    refreshAccessToken,
    schedulePreemptiveRefresh,
    persistTokens,
    // exposed for tests/diagnostics
    clearScheduledRefresh,
  };
}
