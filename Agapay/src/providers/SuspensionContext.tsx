import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { onSuspensionDetected } from "@/api/client";
import apiClient from "@/api/client";

type SuspensionDetails = {
  reason: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  isPermanent: boolean;
};

type SuspensionContextType = {
  isSuspended: boolean;
  isBanned: boolean;
  suspensionDetails: SuspensionDetails | null;
  checkSuspensionStatus: () => Promise<void>;
};

const SuspensionContext = createContext<SuspensionContextType>({
  isSuspended: false,
  isBanned: false,
  suspensionDetails: null,
  checkSuspensionStatus: async () => {},
});

export const useSuspension = () => useContext(SuspensionContext);

export function SuspensionProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [isSuspended, setIsSuspended] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [suspensionDetails, setSuspensionDetails] =
    useState<SuspensionDetails | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const isLoggedIn = !!accessToken;

  // Check suspension status on login
  const checkSuspensionStatus = useCallback(async () => {
    if (!isLoggedIn) {
      setIsSuspended(false);
      setIsBanned(false);
      setSuspensionDetails(null);
      return;
    }

    try {
      const res = await apiClient.get("/api/users/suspension-status");
      const data = res.data;

      setIsSuspended(data.isSuspended);
      setIsBanned(data.isBanned);
      setSuspensionDetails(data.suspensionDetails);

      // If user is suspended or banned, navigate to suspension screen
      if (data.isSuspended || data.isBanned) {
        router.replace("/suspension" as any);
      }
    } catch (error: any) {
      // 404 means the backend endpoint hasn't been deployed yet —
      // treat this as "not suspended" so the app continues normally.
      const status = error?.response?.status;
      if (status === 404) {
        setIsSuspended(false);
        setIsBanned(false);
        setSuspensionDetails(null);
        return;
      }
      // For other errors (network issues, 500s, etc.) log quietly
      console.warn("Failed to check suspension status:", error);
    } finally {
      setHasChecked(true);
    }
  }, [isLoggedIn, router]);

  // Check suspension status when user logs in
  useEffect(() => {
    if (isLoggedIn && !hasChecked) {
      checkSuspensionStatus();
    }
    if (!isLoggedIn) {
      setHasChecked(false);
    }
  }, [isLoggedIn, hasChecked, checkSuspensionStatus]);

  // Listen for 403 suspension errors from API calls
  useEffect(() => {
    const unsubscribe = onSuspensionDetected((details, isBannedFlag) => {
      setIsSuspended(!isBannedFlag);
      setIsBanned(isBannedFlag);
      setSuspensionDetails(details);

      // Navigate to suspension screen
      router.replace("/suspension" as any);
    });

    return unsubscribe;
  }, [router]);

  // Prevent navigation away from suspension screen if suspended
  useEffect(() => {
    if (!isLoggedIn) return;
    if (!isSuspended && !isBanned) return;

    // Check if we're on the suspension or allowed screens
    const currentPath = "/" + segments.join("/");
    const allowedPaths = [
      "/suspension",
      "/community-guidelines",
      "/login",
      "/(auth)",
    ];

    const isAllowed = allowedPaths.some(
      (path) => currentPath === path || currentPath.startsWith(path),
    );

    if (!isAllowed) {
      router.replace("/suspension" as any);
    }
  }, [segments, isSuspended, isBanned, isLoggedIn, router]);

  const value = useMemo(
    () => ({
      isSuspended,
      isBanned,
      suspensionDetails,
      checkSuspensionStatus,
    }),
    [isSuspended, isBanned, suspensionDetails, checkSuspensionStatus],
  );

  return (
    <SuspensionContext.Provider value={value}>
      {children}
    </SuspensionContext.Provider>
  );
}
