import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
// Use a safe wrapper that falls back to in-memory store on unsupported platforms (web)
import {
  applyAuthToken,
  schedulePreemptiveRefresh,
  decodeExp,
  refreshAccessToken,
  persistAuthTokens,
} from "@/api/client";
import {
  getTokens as getSessionTokens,
  setTokens as setSessionTokens,
  subscribe as subscribeSession,
} from "@/src/auth/session";
import {
  deleteItem as ssDelete,
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import * as FileSystem from "expo-file-system/legacy";
import queryClient from "@/src/queryClient";
import { therapistOnboardingStore } from "@/src/stores/therapistOnboardingStore";
import { clearRecommendationsCache } from "@/src/services/recommendations";

import { Alert } from "react-native";
import { normalizeAuthUser } from "@/src/features/auth/core/normalizeUser";
import type { AuthUser } from "@/src/features/auth/core/user";

export type PatientProfileSummary = {
  id: number | string;
  fullName?: string;
  relationshipToUser?: string;
  isSelf?: boolean;
};

type SessionPayload = {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: AuthUser;
};

type AuthContextValue = {
  user: AuthUser;
  accessToken: string | null;
  refreshToken: string | null;
  isBootstrapping: boolean;
  selectedProfile: PatientProfileSummary | null;
  isProfileBootstrapping: boolean;
  setSession: (payload: SessionPayload) => Promise<void>;
  updateUser: (nextUser: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  switchProfile: (profile: PatientProfileSummary) => void;
  clearProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [user, setUser] = useState<AuthUser>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<PatientProfileSummary | null>(null);
  const [isProfileBootstrapping, setIsProfileBootstrapping] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Bootstrap from storage: sessionStorage (web) or secure/local storage
        let [storedAccessToken, storedRefreshToken, storedUser] =
          await Promise.all([
            ssGet("accessToken"),
            ssGet("refreshToken"),
            ssGet("user"),
          ]);

        if (!mounted) return;

        // Check for token expiration and attempt refresh if needed
        if (storedAccessToken) {
          const exp = decodeExp(storedAccessToken);
          if (exp) {
            const expMs = exp * 1000;
            // If expired or expiring very soon (within 10s), try to refresh immediately
            if (expMs - Date.now() < 10000) {
              try {
                // We need to set the refresh token in memory/client for the refresh call to work
                // if the client relies on getTokens() or ssGet().
                // client.ts readRefreshToken() tries getTokens() then ssGet().
                // We haven't setTokens yet, but ssGet should work since we just read it.

                // However, refreshAccessToken in client.ts reads from getTokens() OR ssGet().
                // It should be fine.
                const newAccess = await refreshAccessToken();
                if (newAccess) {
                  storedAccessToken = newAccess;
                  // Refresh token might have rotated too, but refreshAccessToken handles persistence
                  // We should re-read it to be sure, or just rely on the fact that
                  // refreshAccessToken updates the interceptor/storage.
                  storedRefreshToken =
                    (await ssGet("refreshToken")) ?? storedRefreshToken;
                } else {
                  // Refresh failed (e.g. refresh token also expired)
                  storedAccessToken = null;
                  storedRefreshToken = null;
                  storedUser = null;
                  // Ensure storage is cleared
                  await Promise.all([
                    ssDelete("accessToken"),
                    ssDelete("refreshToken"),
                    ssDelete("user"),
                  ]);
                }
              } catch (e) {
                console.warn("Bootstrap refresh failed", e);
                storedAccessToken = null;
                storedRefreshToken = null;
                storedUser = null;
              }
            }
          }
        }

        setAccessToken(storedAccessToken ?? null);
        setRefreshToken(storedRefreshToken ?? null);
        applyAuthToken(storedAccessToken ?? null);
        // Seed the session bus so the interceptor can read tokens immediately
        setSessionTokens(
          storedAccessToken ?? null,
          storedRefreshToken ?? null,
          "auth",
        );
        // Start preemptive refresh if we have a token
        schedulePreemptiveRefresh(storedAccessToken ?? null);

        if (storedUser) {
          try {
            setUser(normalizeAuthUser(JSON.parse(storedUser)));
          } catch (err) {
            console.warn("Failed to parse user from SecureStore", err);
          }
        } else {
          // If no user but we had a token (rare), or if we cleared it above
          setUser(null);
        }
      } catch (err) {
        console.warn("Auth bootstrap failed", err);
      } finally {
        if (mounted) setIsBootstrapping(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // React to external token updates (e.g., axios interceptor refresh)
  useEffect(() => {
    const unsubscribe = subscribeSession(async (t, source) => {
      if (source !== "interceptor") return;
      const nextAccess = t.accessToken ?? null;
      const nextRefresh = t.refreshToken ?? null;

      // Avoid unnecessary work if nothing changed
      if (accessToken === nextAccess && refreshToken === nextRefresh) return;

      // Update local state and persist based on remember-me; apply header
      setAccessToken(nextAccess);
      setRefreshToken(nextRefresh);

      // If the interceptor cleared the tokens (logout), we must also clear the user
      if (nextAccess === null) {
        setUser(null);
      }

      applyAuthToken(nextAccess);
      schedulePreemptiveRefresh(nextAccess);

      try {
        await persistAuthTokens(nextAccess, nextRefresh);
      } catch (e) {
        console.warn("Failed to persist tokens from interceptor", e);
      }
    });
    return unsubscribe;
  }, [accessToken, refreshToken]);

  const persist = useCallback(
    async (
      key: string,
      value: string | null | undefined,
      scope: "auto" | "session" | "local" = "auto",
    ) => {
      if (value === undefined) return;
      if (value === null) {
        await ssDelete(key);
      } else {
        await ssSet(key, value, { scope });
      }
    },
    [],
  );

  const setSession = useCallback(
    async ({
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      user: nextUser,
    }: SessionPayload) => {
      const tasks: Promise<unknown>[] = [];

      const currentSession = getSessionTokens();
      const normalizedAccess =
        nextAccessToken !== undefined
          ? (nextAccessToken ?? null)
          : (currentSession.accessToken ?? null);
      const normalizedRefresh =
        nextRefreshToken !== undefined
          ? (nextRefreshToken ?? null)
          : (currentSession.refreshToken ?? null);

      // Detect if we're switching to a different user (not just updating same user)
      const isUserSwitch =
        nextUser !== undefined &&
        user !== null &&
        nextUser !== null &&
        nextUser?.id !== user?.id;

      // Clear cache when switching users to prevent data leakage
      if (isUserSwitch) {
        try {
          console.log("[AuthProvider] Detected user switch - clearing cache");
          await queryClient.cancelQueries();
          queryClient.clear();

          // Close SignalR connections for old user
          try {
            const { closeAllConnections } =
              await import("@/src/services/signalrManager");
            await closeAllConnections();
          } catch {}
        } catch (err) {
          console.warn(
            "[AuthProvider] Failed to clear cache on user switch",
            err,
          );
        }
      }

      if (nextAccessToken !== undefined) {
        setAccessToken(normalizedAccess);
        applyAuthToken(normalizedAccess);
        schedulePreemptiveRefresh(normalizedAccess);
      }

      if (nextRefreshToken !== undefined) {
        setRefreshToken(normalizedRefresh);
      }

      if (nextAccessToken !== undefined || nextRefreshToken !== undefined) {
        if (
          currentSession.accessToken !== normalizedAccess ||
          currentSession.refreshToken !== normalizedRefresh
        ) {
          setSessionTokens(normalizedAccess, normalizedRefresh, "auth");
        }
        tasks.push(persistAuthTokens(normalizedAccess, normalizedRefresh));
      }

      if (nextUser !== undefined) {
        const normalizedUser = normalizeAuthUser(nextUser ?? null);
        setUser(normalizedUser);
        let serialized: string | null = null;
        if (normalizedUser) {
          try {
            serialized = JSON.stringify(normalizedUser);
          } catch (err) {
            console.warn("Failed to serialize user for SecureStore", err);
          }
        }
        tasks.push(
          (async () => {
            const remember = (await ssGet("rememberMe")) === "true";
            const scope = remember ? "local" : "session";
            await persist("user", serialized, scope);
          })(),
        );
      }

      if (!tasks.length) return;

      try {
        await Promise.all(tasks);
      } catch (err) {
        console.warn("Auth session persistence failed", err);
      }
    },
    [persist, user],
  );

  const updateUser = useCallback(
    async (nextUser: AuthUser) => {
      await setSession({ user: nextUser });
    },
    [setSession],
  );

  const signOut = useCallback(async () => {
    // 1) Clear React Query cache (cancel outstanding, then clear all)
    try {
      await queryClient.cancelQueries();
    } catch {}
    try {
      queryClient.clear();
    } catch {}

    // 2) Remove cached therapist photo (and delete local file if present)
    try {
      const raw = await ssGet("therapistPhotoCache");
      if (raw) {
        try {
          const cache = JSON.parse(raw);
          const localUri = cache?.localUri;
          if (localUri) {
            try {
              const info = await FileSystem.getInfoAsync(localUri);
              if (info.exists) {
                await FileSystem.deleteAsync(localUri, { idempotent: true });
              }
            } catch {}
          }
        } catch {}
      }
      await ssDelete("therapistPhotoCache");
    } catch {}

    // 3) Clear recommendations cache (user-specific data)
    try {
      await clearRecommendationsCache();
    } catch {}

    // 4) Clear therapist onboarding store
    try {
      therapistOnboardingStore.clear();
    } catch {}

    // Profile cleared on logout
    setSelectedProfile(null);

    // 5) Close SignalR connections (if any active)
    try {
      const { closeAllConnections } =
        await import("@/src/services/signalrManager");
      await closeAllConnections();
    } catch {}

    // 6) Clear auth/session entries
    await setSession({ accessToken: null, refreshToken: null, user: null });
  }, [setSession]);

  const switchProfile = useCallback((profile: PatientProfileSummary) => {
    setSelectedProfile(profile);
  }, []);

  const clearProfile = useCallback(() => {
    setSelectedProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      refreshToken,
      isBootstrapping,
      selectedProfile,
      isProfileBootstrapping,
      setSession,
      updateUser,
      signOut,
      switchProfile,
      clearProfile,
    }),
    [
      user,
      accessToken,
      refreshToken,
      isBootstrapping,
      selectedProfile,
      isProfileBootstrapping,
      setSession,
      updateUser,
      signOut,
      switchProfile,
      clearProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
