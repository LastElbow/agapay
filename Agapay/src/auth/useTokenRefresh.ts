import { schedulePreemptiveRefresh, decodeExp, refreshAccessToken } from '@/api/client';
import { useEffect } from 'react';
import { getTokens, subscribe } from './session';

// React hook that listens for token changes and (re)schedules a preemptive refresh.
// Call this once near the root of the app (e.g., in a provider or _layout).
export function useTokenRefresh() {
  useEffect(() => {
    // Schedule immediately for current token (in case page reloaded mid-session)
    const current = getTokens();
    schedulePreemptiveRefresh(current.accessToken);

    const unsubscribe = subscribe((t) => {
      schedulePreemptiveRefresh(t.accessToken);
    });
    // On web, background tabs throttle timers and can miss the preemptive refresh.
    // When the page becomes visible or gains focus again, re-check expiry and refresh if needed.
    const handleForeground = () => {
      const { accessToken } = getTokens();
      schedulePreemptiveRefresh(accessToken);
      const exp = decodeExp(accessToken);
      if (!exp) return;
      const msLeft = exp * 1000 - Date.now();
      // If token already expired or will expire within 60s, try to refresh immediately
      if (msLeft <= 60_000) {
        refreshAccessToken().catch(() => {
          // Non-fatal here; AuthProvider/axios interceptor will handle logout on failure
        });
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') handleForeground();
    };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('focus', handleForeground);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', handleForeground);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, []);
}

export default useTokenRefresh;
