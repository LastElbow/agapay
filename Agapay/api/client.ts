import { getTokens, setTokens } from '@/src/auth/session';
import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { emitGlobalError } from '@/src/utils/globalErrorEmitter';
import { decodeJwtExp } from '@/src/features/auth/core/jwt';
import { isAuthUrl as isAuthUrlCore } from '@/src/features/auth/core/authUrls';
import { createAuthTokenService } from '@/src/features/auth/usecases/tokenService';
import { safeSecureStorePort } from '@/src/infra/storage/safeSecureStorePort';
import { systemClock } from '@/src/shared/ports/clock';
import { systemScheduler } from '@/src/shared/ports/scheduler';
import { planRateLimitedRequest } from '@/src/features/http/core/rateLimit';
import { compute429RetryDelayMs } from '@/src/features/http/core/retryBackoff';

// IMPORTANT: Set your API base URL. For local development, this points to your running backend.
// If you're testing on a device, replace with your ngrok URL.
const BASE_URL = 'https://agapay-backend-production.up.railway.app/';

// Suspension event emitter for app-wide handling
type SuspensionDetails = {
  reason: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  isPermanent: boolean;
};

type SuspensionListener = (details: SuspensionDetails, isBanned: boolean) => void;
let suspensionListeners: SuspensionListener[] = [];

export function onSuspensionDetected(listener: SuspensionListener) {
  suspensionListeners.push(listener);
  return () => {
    suspensionListeners = suspensionListeners.filter(l => l !== listener);
  };
}

function emitSuspension(details: SuspensionDetails, isBanned: boolean) {
  suspensionListeners.forEach(listener => {
    try { listener(details, isBanned); } catch (e) { console.error('Suspension listener error:', e); }
  });
}

// Request throttling to prevent 429 Too Many Requests
// NOTE: A global "minimum interval" between *all* requests makes initial screen loads slow
// because React Query often triggers multiple concurrent requests. Instead, allow short bursts
// but rate-limit sustained request storms.
const REQUEST_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 8;
let requestStartTimes: number[] = [];

function shouldSkipRateLimit(url?: string): boolean {
  if (!url) return false;
  // Never delay auth endpoints (especially refresh) to avoid cascaded 401s.
  return isAuthUrlCore(url, BASE_URL, AUTH_SKIP_URLS);
}

const rateLimitRequest = async (url?: string): Promise<void> => {
  if (shouldSkipRateLimit(url)) return;

  // Use a pure planner so edge cases are testable in Jest.
  // This loop is defensive; in practice the first wait should be sufficient.
  // (setTimeout won't fire early, but can fire late.)
  while (true) {
    const plan = planRateLimitedRequest(
      requestStartTimes,
      Date.now(),
      REQUEST_WINDOW_MS,
      MAX_REQUESTS_PER_WINDOW,
    );
    requestStartTimes = plan.nextStartTimes;
    if (plan.waitMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, plan.waitMs));
  }
};

const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  timeout: 15000, // fail fast on hanging requests
  headers: {
    'Content-Type': 'application/json',
    ...(/ngrok/.test(BASE_URL) ? { 'ngrok-skip-browser-warning': 'true' } : {}),

  },
});

// Request interceptor for throttling
apiClient.interceptors.request.use(async (config) => {
  await rateLimitRequest(config?.url);
  return config;
});

export const applyAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common = {
      ...(apiClient.defaults.headers.common || {}),
      Authorization: `Bearer ${token}`,
    } as Record<string, string>;
  } else if ((apiClient.defaults.headers.common as any)?.Authorization) {
    delete (apiClient.defaults.headers.common as any).Authorization;
  }
};

// -----------------------------
// Token refresh interceptor
// -----------------------------
const REFRESH_ENDPOINT = '/api/Auth/refresh';

// Decode JWT exp (seconds) safely
export function decodeExp(token: string | null): number | null {
  return decodeJwtExp(token);
}

const authTokenService = createAuthTokenService({
  http: {
    get: (url, config) => apiClient.get(url, config).then((res) => ({ data: res.data, status: res.status, headers: res.headers })),
    post: (url, body, config) => apiClient.post(url, body, config).then((res) => ({ data: res.data, status: res.status, headers: res.headers })),
    put: (url, body, config) => apiClient.put(url, body, config).then((res) => ({ data: res.data, status: res.status, headers: res.headers })),
    delete: (url, config) => apiClient.delete(url, config).then((res) => ({ data: res.data, status: res.status, headers: res.headers })),
  },
  storage: safeSecureStorePort,
  session: {
    getTokens: () => getTokens(),
    setTokens: (a, r, source) => setTokens(a, r, source),
  },
  clock: systemClock,
  scheduler: systemScheduler,
  applyAccessToken: (t) => applyAuthToken(t),
  refreshEndpoint: REFRESH_ENDPOINT,
  refreshBeforeMs: 60_000,
  minDelayMs: 5_000,
  immediateRefreshDelayMs: 100,
});

function schedulePreemptiveRefresh(accessToken: string | null) {
  authTokenService.schedulePreemptiveRefresh(accessToken);
}

export async function persistAuthTokens(accessToken: string | null, refreshToken: string | null): Promise<void> {
  await authTokenService.persistTokens(accessToken, refreshToken);
}

export async function refreshAccessToken(): Promise<string | null> {
  return authTokenService.refreshAccessToken();
}

// Skip refreshing for these endpoints to avoid loops
const AUTH_SKIP_URLS = new Set<string>([
  '/api/Auth/login',
  '/api/Auth/login/patient',
  '/api/Auth/login/therapist',
  REFRESH_ENDPOINT,
]);

function isAuthUrl(url?: string): boolean {
  return isAuthUrlCore(url, BASE_URL, AUTH_SKIP_URLS);
}

// Helper to extract a user-friendly error message from the response
function extractErrorMessage(error: AxiosError): string {
  const data = error.response?.data as any;
  if (typeof data === 'string') return data;
  if (data?.message) return data.message;
  if (data?.title) return data.title; // ASP.NET ProblemDetails
  if (data?.errors) {
    // Flatten validation errors
    const msgs = Object.values(data.errors).flat().join('. ');
    if (msgs) return msgs;
  }
  return error.message || 'An unexpected error occurred.';
}

apiClient.interceptors.response.use(
  (response: any) => response,
  async (error: AxiosError) => {
    const { response, config, code } = error;
    const status = response?.status;

    const originalRequest = config as InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number; _silentError?: boolean };

    // ─────────────────────────────────────────────────────────────────────────
    // Network Error (no response at all - device offline or server unreachable)
    // ─────────────────────────────────────────────────────────────────────────
    if (!response && (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || error.message === 'Network Error')) {
      emitGlobalError({
        title: 'Connection Error',
        message: 'Unable to reach the server. Please check your internet connection and try again.',
        variant: 'warning',
      });
      return Promise.reject(error);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Handle 429 Too Many Requests with exponential backoff
    // ─────────────────────────────────────────────────────────────────────────
    if (status === 429) {
      const retryCount = originalRequest._retryCount ?? 0;
      const MAX_RETRIES = 3;

      if (retryCount < MAX_RETRIES) {
        originalRequest._retryCount = retryCount + 1;
        // Prefer server hint if present
        const retryAfterHeader = (response?.headers as any)?.['retry-after'];
        const retryAfterSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : undefined;

        const delay = compute429RetryDelayMs({
          retryCount,
          retryAfterSeconds,
          random01: Math.random,
        });

        console.warn(`429 Too Many Requests - retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient.request(originalRequest as AxiosRequestConfig);
      }
      // Max retries exceeded
      console.error('429 Too Many Requests - max retries exceeded');
      emitGlobalError({
        title: 'Too Many Requests',
        message: 'The server is busy. Please wait a moment and try again.',
        variant: 'warning',
      });
      return Promise.reject(error);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Handle 5xx Server Errors (show global error modal)
    // ─────────────────────────────────────────────────────────────────────────
    if (status && status >= 500 && status < 600) {
      emitGlobalError({
        title: 'Server Error',
        message: 'Something went wrong on our end. Please try again later.',
        variant: 'error',
      });
      return Promise.reject(error);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Handle 403 Account Suspended/Banned - redirect to suspension screen
    // ─────────────────────────────────────────────────────────────────────────
    if (status === 403) {
      const data = response?.data as any;
      if (data?.error === 'AccountSuspended' || data?.error === 'AccountBanned') {
        const isBanned = data.error === 'AccountBanned';
        emitSuspension(data.suspensionDetails, isBanned);
        // Don't show global error - the suspension screen will handle it
        return Promise.reject(error);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Handle 401 Unauthorized - attempt token refresh
    // ─────────────────────────────────────────────────────────────────────────
    if (!response || status !== 401 || originalRequest?._retry || isAuthUrl(originalRequest?.url)) {
      // For 4xx errors (except 401), emit a contextual error if not silenced
      if (status && status >= 400 && status < 500 && !originalRequest?._silentError) {
        // Don't show modal for 401 (handled by auth flow) or validation errors (handled by forms)
        // But do log for debugging
        console.warn(`[API] ${status} error:`, extractErrorMessage(error));
      }
      return Promise.reject(error);
    }

    // Mark to avoid infinite loops
    originalRequest._retry = true;

    try {
      const newToken = await refreshAccessToken();
      if (!newToken) throw error;
      originalRequest.headers = {
        ...(originalRequest.headers || {}),
        Authorization: `Bearer ${newToken}`,
      } as any;
      return apiClient.request(originalRequest as AxiosRequestConfig);
    } catch (e) {
      return Promise.reject(e);
    }
  }
);

export type OtpPurpose = 'AccountVerification' | 'TwoFactorLogin' | 'PasswordReset';

export type OtpChallengeResponse = {
  requiresOtp: boolean;
  email: string;
  purpose: OtpPurpose;
  expiresAtUtc?: string;
  message?: string;
  roleHint?: string | null;
};

export type AuthResponse = {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: any;
};

export async function requestOtp(
  email: string,
  purpose: OtpPurpose,
  device?: { deviceId?: string | null }
): Promise<OtpChallengeResponse> {
  const response = await apiClient.post<OtpChallengeResponse>('/api/Auth/request-otp', {
    email,
    purpose,
    deviceId: device?.deviceId ?? null,
  });
  return response.data;
}

export type VerifyOtpPayload = {
  email: string;
  code: string;
  purpose: OtpPurpose;
  deviceId?: string | null;
  deviceName?: string | null;
  rememberDevice?: boolean;
};

export async function verifyOtp(payload: VerifyOtpPayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/api/Auth/verify-otp', {
    email: payload.email,
    code: payload.code,
    purpose: payload.purpose,
    deviceId: payload.deviceId ?? null,
    deviceName: payload.deviceName ?? null,
    rememberDevice: payload.rememberDevice ?? false,
  });
  return response.data;
}

export default apiClient;

// Public API to allow manual scheduling after an initial login
export { schedulePreemptiveRefresh };
