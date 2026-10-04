import apiClient from "@/api/client";
import UpcomingSessionCard from "@/src/components/UpcomingSessionCard";
import TherapistVerificationBanner from "@/src/components/TherapistVerificationBanner";
import {
  fetchAllSessions,
  therapistSessionsQueryKey,
  allSessionsQueryKey,
  type SessionSummary,
  fetchRelieverProposals,
  type RelieverProposal,
} from "@/src/services/sessions";
import {
  fetchTherapistRatings,
  therapistRatingsQueryKey,
  type TherapistRating,
} from "@/src/services/ratings";
import {
  getItem as ssGet,
  setItem as ssSet,
  multiGet as ssMultiGet,
} from "@/src/utils/safeSecureStore";
import { getSyncedNow, syncServerTime } from "@/src/utils/serverTime";
import { useAuth } from "@/src/providers/AuthProvider";
import { formatPeso } from "@/src/utils/money";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  Bell,
  Calendar,
  CalendarPlus,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Star,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Image,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import Skeleton from "@/src/components/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTherapistStatus } from "@/src/hooks/useTherapistStatus";
import useRatingsRealtime from "@/src/hooks/useRatingsRealtime";
import useRelieverRealtime from "@/src/hooks/useRelieverRealtime";
import WebHeader from "@/src/components/WebHeader";

const ACTIVE_SESSION_STATUSES = new Set([
  "scheduled",
  "pendingconfirmation",
  "accepted",
  "active",
]);

const ENDED_CONTRACT_STATUSES = new Set([
  "completed",
  "terminated",
  "cancelled",
  "canceled",
  "expired",
]);

const FINAL_SESSION_STATUSES = new Set([
  "completed",
  "terminated",
  "cancelled",
  "canceled",
  "donefortoday",
]);

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TherapistHome() {
  const router = useRouter();
  const { user: authUser, accessToken } = useAuth();
  const therapistStatus = useTherapistStatus();
  const { isRestricted, isVerified, onboardingComplete } = therapistStatus;
  const [user, setUser] = useState<{
    firstName?: string;
    lastName?: string;
    avatar?: any;
  } | null>(null);

  const canAccessCoreFeatures = isVerified && onboardingComplete;
  const queryClient = useQueryClient();

  // Enable real-time updates
  useRatingsRealtime();
  useRelieverRealtime();

  // Sync server time on mount for accurate timer display
  useEffect(() => {
    syncServerTime().catch(() => {});
  }, []);

  const {
    data: upcomingSessionsData,
    isLoading: sessionsLoading,
    isRefetching: sessionsRefetching,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: therapistSessionsQueryKey,
    queryFn: () => fetchAllSessions(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    enabled: canAccessCoreFeatures,
  });

  const {
    data: ratingsData = [],
    isLoading: ratingsLoading,
    isError: ratingsError,
    error: ratingsErrorObj,
    refetch: refetchRatings,
  } = useQuery({
    queryKey: therapistRatingsQueryKey,
    queryFn: fetchTherapistRatings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: canAccessCoreFeatures,
    retry: 1,
  });

  const {
    data: relieverProposals = [],
    isLoading: relieverProposalsLoading,
    refetch: refetchRelieverProposals,
  } = useQuery({
    queryKey: ["reliever-proposals"],
    queryFn: fetchRelieverProposals,
    staleTime: 0, // Always fetch fresh data for real-time updates
    gcTime: 5 * 60 * 1000,
    enabled: canAccessCoreFeatures,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Debug logging for ratings
  useEffect(() => {
    console.log("🔍 Ratings Debug:");
    console.log("  - canAccessCoreFeatures:", canAccessCoreFeatures);
    console.log("  - isVerified:", isVerified);
    console.log("  - onboardingComplete:", onboardingComplete);
    console.log("  - ratingsLoading:", ratingsLoading);
    console.log("  - ratingsError:", ratingsError);
    console.log("  - ratingsData:", ratingsData);
    if (ratingsErrorObj) {
      console.log("  - ratingsErrorObj:", ratingsErrorObj);
    }
  }, [
    canAccessCoreFeatures,
    isVerified,
    onboardingComplete,
    ratingsLoading,
    ratingsError,
    ratingsData,
    ratingsErrorObj,
  ]);

  // Real-time updates for sessions/notifications
  useEffect(() => {
    if (!accessToken || !canAccessCoreFeatures) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupConnection = async () => {
      try {
        const { default: signalrManager } =
          await import("@/src/services/signalrManager");
        await signalrManager.getSharedConnection("contracts", accessToken);

        if (!active) {
          signalrManager.releaseConnection("contracts");
          return;
        }

        unsubscribeFns.push(
          signalrManager.subscribeToEvent(
            "contracts",
            "ContractActivated",
            () => {
              if (!active) return;
              queryClient
                .invalidateQueries({ queryKey: therapistSessionsQueryKey })
                .catch(() => {});
              queryClient
                .invalidateQueries({ queryKey: allSessionsQueryKey })
                .catch(() => {});
              // Explicitly refetch to show new sessions immediately
              queryClient
                .refetchQueries({ queryKey: therapistSessionsQueryKey })
                .catch(() => {});
            },
          ),
          signalrManager.subscribeToEvent(
            "contracts",
            "ContractDeclined",
            () => {
              if (!active) return;
              queryClient
                .invalidateQueries({ queryKey: therapistSessionsQueryKey })
                .catch(() => {});
              queryClient
                .invalidateQueries({ queryKey: allSessionsQueryKey })
                .catch(() => {});
            },
          ),
          signalrManager.subscribeToEvent("contracts", "ContractEnded", () => {
            if (!active) return;
            queryClient
              .invalidateQueries({ queryKey: therapistSessionsQueryKey })
              .catch(() => {});
            queryClient
              .invalidateQueries({ queryKey: allSessionsQueryKey })
              .catch(() => {});
          }),
          // Reliever-specific events
          signalrManager.subscribeToEvent(
            "contracts",
            "RelieverProposed",
            () => {
              if (!active) return;
              queryClient
                .invalidateQueries({ queryKey: ["reliever-proposals"] })
                .catch(() => {});
              queryClient
                .refetchQueries({ queryKey: ["reliever-proposals"] })
                .catch(() => {});
            },
          ),
          signalrManager.subscribeToEvent(
            "contracts",
            "RelieverApproved",
            () => {
              if (!active) return;
              queryClient
                .invalidateQueries({ queryKey: ["reliever-proposals"] })
                .catch(() => {});
              queryClient
                .invalidateQueries({ queryKey: therapistSessionsQueryKey })
                .catch(() => {});
              queryClient
                .refetchQueries({ queryKey: therapistSessionsQueryKey })
                .catch(() => {});
            },
          ),
          signalrManager.subscribeToEvent(
            "contracts",
            "RelieverDeclined",
            () => {
              if (!active) return;
              queryClient
                .invalidateQueries({ queryKey: ["reliever-proposals"] })
                .catch(() => {});
            },
          ),
        );
      } catch (error) {
        console.warn("TherapistHome contracts hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      unsubscribeFns.forEach((unsub) => unsub());
      import("@/src/services/signalrManager")
        .then(({ default: signalrManager }) => {
          signalrManager.releaseConnection("contracts");
        })
        .catch(() => {});
    };
  }, [accessToken, canAccessCoreFeatures, queryClient]);

  // Refresh tick every minute to re-evaluate sessions that should be removed
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setMinuteTick((t) => (t + 1) % 1_000_000),
      60_000,
    );
    return () => clearInterval(id);
  }, []);

  const upcomingSessions = useMemo(() => {
    const nowMs = Date.now();
    const data = Array.isArray(upcomingSessionsData)
      ? (upcomingSessionsData as SessionSummary[])
      : [];

    return data
      .filter((s) => {
        const contractStatus = String(s.contractStatus ?? "")
          .trim()
          .toLowerCase();
        const sessionStatus = String(s.status ?? "")
          .trim()
          .toLowerCase();
        const isContractEnded = ENDED_CONTRACT_STATUSES.has(contractStatus);
        const isSessionFinal = FINAL_SESSION_STATUSES.has(sessionStatus);
        if (isContractEnded || isSessionFinal) return false;

        // DoneForToday sessions are now handled by the backend and excluded from upcoming
        // They will appear in the "Sessions" list instead

        const endMs = new Date(s.endAt).getTime();
        if (!Number.isFinite(endMs)) return false;
        return endMs >= nowMs;
      })
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
  }, [upcomingSessionsData, minuteTick]);

  const activeUpcomingSessions = upcomingSessions;

  // Track locally running timers (rehydrated from SecureStore) to show Active badge with live timer
  const [sessionStartMsById, setSessionStartMsById] = useState<
    Record<number, number>
  >({});
  const [nowTick, setNowTick] = useState(0); // increments each second to trigger re-render

  // Rehydrate timers for visible sessions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeUpcomingSessions || activeUpcomingSessions.length === 0) {
        if (!cancelled) setSessionStartMsById({});
        return;
      }
      try {
        const keys = activeUpcomingSessions.map((s) => `sessionTimer:${s.id}`);
        const entries = await ssMultiGet(keys);
        const map: Record<number, number> = {};
        for (const s of activeUpcomingSessions) {
          const raw = entries[`sessionTimer:${s.id}`];
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (obj?.startAtMs && Number.isFinite(obj.startAtMs)) {
              map[s.id] = obj.startAtMs as number;
            }
          } catch {}
        }
        if (!cancelled) setSessionStartMsById(map);
      } catch {
        if (!cancelled) setSessionStartMsById({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUpcomingSessions]);

  // Refetch sessions and ratings whenever this screen regains focus (e.g., returning from session view)
  // This ensures completed/terminated sessions are removed and ratings are up-to-date
  useFocusEffect(
    useCallback(() => {
      if (canAccessCoreFeatures) {
        refetchSessions();
        refetchRatings();
      }
    }, [canAccessCoreFeatures, refetchSessions, refetchRatings]),
  );

  // Also refresh timers whenever this screen regains focus (e.g., returning from session view)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!activeUpcomingSessions || activeUpcomingSessions.length === 0) {
          if (!cancelled) setSessionStartMsById({});
          return;
        }
        try {
          const keys = activeUpcomingSessions.map(
            (s) => `sessionTimer:${s.id}`,
          );
          const entries = await ssMultiGet(keys);
          const map: Record<number, number> = {};
          for (const s of activeUpcomingSessions) {
            const raw = entries[`sessionTimer:${s.id}`];
            if (!raw) continue;
            try {
              const obj = JSON.parse(raw);
              if (obj?.startAtMs && Number.isFinite(obj.startAtMs)) {
                map[s.id] = obj.startAtMs as number;
              }
            } catch {}
          }
          if (!cancelled) setSessionStartMsById(map);
        } catch {
          if (!cancelled) setSessionStartMsById({});
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeUpcomingSessions?.length]),
  );

  // Tick every second if there is at least one running timer
  useEffect(() => {
    const hasAny = Object.keys(sessionStartMsById).length > 0;
    if (!hasAny) return;
    const id = setInterval(() => setNowTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [sessionStartMsById]);

  const formatHMS = (elapsedSec: number) => {
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const fallbackAvatar = require("@/assets/images/react-logo.png");

  const formatSessionDate = useCallback((startIso: string) => {
    const date = new Date(startIso);
    if (Number.isNaN(date.getTime())) return "Upcoming Session";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(date);
  }, []);

  const formatSessionTimeRange = useCallback(
    (startIso: string, endIso: string) => {
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return "";
      const formatter = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${formatter.format(start)} - ${formatter.format(end)}`;
    },
    [],
  );

  const formatStatus = (status: string) => {
    if (status === "DoneForToday") return "Done for today";
    if (status?.toLowerCase() === "terminated") return "Discontinued";
    return status;
  };

  const createSessionCardProps = useCallback(
    (session: any) => {
      const date = formatSessionDate(session.startAt);
      const timeRange = formatSessionTimeRange(session.startAt, session.endAt);
      // Determine dynamic status based on locally running timer
      const startMs = sessionStartMsById[session.id as number];
      let statusOverride: string | undefined;
      let statusColorHex: string | undefined;
      if (Number.isFinite(startMs)) {
        // Use synced server time for accurate elapsed calculation
        const elapsed = Math.max(
          0,
          Math.floor((getSyncedNow() - startMs) / 1000),
        );
        statusOverride = `Active • ${formatHMS(elapsed)}`;
        statusColorHex = "#10B981"; // green
      }
      // Don't use fallback avatar - use null to show patient initials instead
      return {
        therapistName: session.patientName || "Patient",
        role: session.conditionCase || "Therapy Session",
        date,
        time: timeRange,
        address: session.locationAddress ?? undefined,
        status: formatStatus(session.status),
        statusOverride,
        statusColorHex,
        isRescheduled: session.isRescheduled || false,
        avatarSource: null,
      };
    },
    [formatSessionDate, formatSessionTimeRange, sessionStartMsById, nowTick],
  );

  const handleOpenSession = useCallback(
    (session: any) => {
      if (!session || isRestricted) return;
      router.push({
        pathname: "/session-view",
        params: {
          sessionId: String(session.id),
          profileId: String(session.patientId),
          therapistName: user
            ? [user.firstName, user.lastName]
                .filter(Boolean)
                .map((n) => n?.trim())
                .filter(Boolean)
                .join(" ") || "Therapist"
            : "Therapist",
          patientName: session.patientName || "Patient",
          startAt: session.startAt,
          endAt: session.endAt,
        },
      } as any);
    },
    [user, formatSessionDate, formatSessionTimeRange, router, isRestricted],
  );

  const isFetchingSessions =
    canAccessCoreFeatures && (sessionsLoading || sessionsRefetching);

  // Carousel sizing and navigation
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const scrollRef = useRef<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isSmallScreen =
    typeof window !== "undefined" ? window.innerWidth < 768 : true;
  const totalSlides = activeUpcomingSessions.length;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < Math.max(0, totalSlides - 1);
  const visiblePageCount = Math.min(totalSlides, 10);
  const visiblePages = useMemo(
    () => Array.from({ length: visiblePageCount }, (_, i) => i),
    [visiblePageCount],
  );
  const goTo = (idx: number) => {
    if (!scrollRef.current || containerWidth <= 0) return;
    const clamped = Math.max(0, Math.min(idx, totalSlides - 1));
    scrollRef.current.scrollTo({ x: clamped * containerWidth, animated: true });
    setCurrentIndex(clamped);
  };
  const prev = () => canPrev && goTo(currentIndex - 1);
  const next = () => canNext && goTo(currentIndex + 1);

  // Notifications badge: sessions in next 24 hours only
  const sessionsSoonCount = useMemo(() => {
    if (!canAccessCoreFeatures) return 0;
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    return upcomingSessions.filter((s) => {
      const start = new Date(s.startAt).getTime();
      const sessionStatus = String(s.status ?? "")
        .trim()
        .toLowerCase();
      const contractStatus = String(s.contractStatus ?? "")
        .trim()
        .toLowerCase();
      const isContractEnded = ENDED_CONTRACT_STATUSES.has(contractStatus);
      const isSessionFinal = FINAL_SESSION_STATUSES.has(sessionStatus);
      return (
        !isContractEnded &&
        !isSessionFinal &&
        !Number.isNaN(start) &&
        start >= now &&
        start <= in24h &&
        sessionStatus !== "donefortoday"
      );
    }).length;
  }, [upcomingSessions, canAccessCoreFeatures]);
  const notificationCount = Math.min(99, Math.max(0, sessionsSoonCount));

  // Sync local user state with auth context (fallback to placeholder when missing)
  useEffect(() => {
    if (authUser) {
      setUser((prev) => {
        const next = {
          ...(prev ?? {}),
          firstName:
            authUser.firstName ??
            authUser.givenName ??
            authUser.name ??
            prev?.firstName,
          lastName: authUser.lastName ?? authUser.familyName ?? prev?.lastName,
        };

        const avatarCandidate =
          prev?.avatar ??
          authUser.avatar ??
          (authUser as any)?.profilePicture ??
          (authUser as any)?.profilePictureUrl ??
          null;
        if (avatarCandidate) {
          next.avatar = avatarCandidate;
        }

        return next;
      });
    } else {
      // If authUser is null (logged out), clear local state
      setUser(null);
    }
  }, [authUser]);

  // Helper to resolve avatar source for Image component
  const resolveAvatarSource = (avatar: any) => {
    if (!avatar) return require("@/assets/images/react-logo.png");
    // If it's a require() asset it will be a number — return as-is
    if (typeof avatar === "number") return avatar;

    const str = String(avatar ?? "");
    if (str.startsWith("http://") || str.startsWith("https://"))
      return { uri: str };
    if (str.startsWith("file://") || str.startsWith("content://"))
      return { uri: str };
    // Otherwise, assume it's a local FileSystem path already (cache)
    if (str.startsWith("/")) return { uri: str };
    return require("@/assets/images/react-logo.png");
  };

  // ...existing code...

  // Fetch therapist photo, cache it locally, and persist cache metadata to SecureStore.
  // Minimizes repeated network calls by using a cached local file for 24 hours.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const isWeb = Platform.OS === "web";
        const cacheRaw = await ssGet("therapistPhotoCache");
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache?.localUri && cache?.ts) {
            const age = Date.now() - cache.ts;
            try {
              if (!isWeb) {
                const info = await FileSystem.getInfoAsync(cache.localUri);
                // use cache if file exists and was cached less than 24 hours ago
                if (info.exists && age < 24 * 60 * 60 * 1000) {
                  if (!cancelled)
                    setUser((u) => ({ ...(u ?? {}), avatar: cache.localUri }));
                  return;
                }
              }
            } catch {
              // continue to refresh
            }
          }
        }

        // Call API to get the signed URL (or URL) for profile picture
        const resp = await apiClient.get("/api/Therapist/me/photo");
        const remoteUrl = resp?.data?.profilePicture;
        if (!remoteUrl) return;

        // Prefer to download and cache a local copy (signed URLs may expire)
        const filename =
          remoteUrl.split("/").pop()?.split("?")[0] ??
          `therapist-${Date.now()}.jpg`;
        // isWeb already defined above
        const localPath = `${
          FileSystem.cacheDirectory ?? ""
        }therapist-${filename}`;

        try {
          if (isWeb) {
            // expo-file-system is not supported on web; use remote URL directly
            const cacheObj = { localUri: null, remoteUrl, ts: Date.now() };
            await ssSet("therapistPhotoCache", JSON.stringify(cacheObj));
            if (!cancelled)
              setUser((u) => ({ ...(u ?? {}), avatar: remoteUrl }));
          } else {
            const info = await FileSystem.getInfoAsync(localPath);
            if (!info.exists) {
              await FileSystem.downloadAsync(remoteUrl, localPath);
            }

            const cacheObj = { localUri: localPath, remoteUrl, ts: Date.now() };
            await ssSet("therapistPhotoCache", JSON.stringify(cacheObj));
            if (!cancelled)
              setUser((u) => ({ ...(u ?? {}), avatar: localPath }));
          }
        } catch (err) {
          // If download fails, fall back to using remote URL directly
          console.warn(
            "Failed to download therapist photo, falling back to remote URL",
            err,
          );
          await ssSet(
            "therapistPhotoCache",
            JSON.stringify({ localUri: null, remoteUrl, ts: Date.now() }),
          );
          if (!cancelled) setUser((u) => ({ ...(u ?? {}), avatar: remoteUrl }));
        }
      } catch (err) {
        console.warn("Error fetching therapist photo", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const greetingName = user
    ? [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n?.trim())
        .filter(Boolean)
        .join(" ")
    : "";

  const getTimeAwareGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };
  const greeting = getTimeAwareGreeting();

  // Track expanded review IDs
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null);

  const toggleReviewExpansion = (reviewId: number) => {
    setExpandedReviewId(expandedReviewId === reviewId ? null : reviewId);
  };

  return (
    <View className="flex-1 bg-teal-50">
      <WebHeader />
      <SafeAreaView
        className="flex-1 bg-teal-50 w-full max-w-screen-lg mx-auto"
        edges={["top", "left", "right"]}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#F7F7F7"
          translucent={false}
        />
        <ScrollView
          className="flex-1 px-[18px]"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 40,
            paddingBottom: 30,
          }}
        >
          {/* Mobile Header (Avatar & Bell) */}
          <View className="md:hidden flex-row justify-between items-center mb-5">
            <View className="flex-row items-center flex-1">
              {resolveAvatarSource(user?.avatar) !== fallbackAvatar ? (
                <Image
                  source={resolveAvatarSource(user?.avatar)}
                  className="w-[54px] h-[54px] rounded-[28px] mr-2"
                />
              ) : (
                <View className="w-[54px] h-[54px] rounded-[28px] mr-2 bg-gray-200 justify-center items-center">
                  <Text className="text-lg font-bold text-gray-700">
                    {getInitials(greetingName)}
                  </Text>
                </View>
              )}
              <View className="flex-1 ml-2 justify-center">
                <Text className="text-[13px] text-gray-500">{greeting}</Text>
                <Text
                  className="text-xl font-bold text-black"
                  numberOfLines={1}
                >
                  {greetingName || "Therapist"}
                </Text>
              </View>
            </View>

            <View className="w-10 h-10 items-center justify-center">
              <TouchableOpacity
                accessibilityRole="button"
                className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                onPress={() =>
                  router.push({ pathname: "/(therapist)/notifications" } as any)
                }
              >
                <Bell color="#111" size={22} />
              </TouchableOpacity>
              {notificationCount > 0 ? (
                <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 items-center justify-center">
                  <Text className="text-[10px] text-white font-bold">
                    {notificationCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Welcome Section - Desktop Only */}
          <View className="hidden md:flex items-center mb-10 mt-4">
            <Text className="text-3xl font-bold text-gray-900 text-center">
              {greeting},{" "}
              <Text className="text-teal-700">
                {greetingName || "Therapist"}!
              </Text>
            </Text>
            <Text className="text-gray-500 mt-2 text-base text-center">
              Here is what&apos;s happening with your schedule today.
            </Text>
          </View>

          <TherapistVerificationBanner style={{ marginBottom: 18 }} />

          <Text className="text-lg font-medium text-black mt-3 mb-2 md:mb-4">
            Upcoming Session
          </Text>
          <View className="mb-8">
            {isRestricted ? (
              <View className="py-6 items-center justify-center">
                <Text className="text-base font-semibold text-black mb-1.5 text-center">
                  Limited access while we review your documents
                </Text>
                <Text className="text-sm text-gray-500 text-center">
                  You&apos;ll see your schedule and upcoming sessions once your
                  application is approved.
                </Text>
              </View>
            ) : isFetchingSessions ? (
              <View className="py-8 items-center justify-center">
                <View className="w-full">
                  <View className="flex-row items-center mb-2">
                    <Skeleton
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        marginRight: 12,
                      }}
                    />
                    <View className="flex-1 justify-center">
                      <Skeleton
                        style={{
                          height: 14,
                          width: "60%",
                          borderRadius: 4,
                          marginBottom: 8,
                        }}
                      />
                      <Skeleton
                        style={{ height: 12, width: "40%", borderRadius: 4 }}
                      />
                    </View>
                  </View>

                  <Skeleton
                    style={{ height: 12, width: "50%", marginTop: 12 }}
                  />
                  <Skeleton
                    style={{
                      height: 48,
                      width: "100%",
                      marginTop: 12,
                      borderRadius: 8,
                    }}
                  />
                </View>
              </View>
            ) : sessionsError ? (
              <TouchableOpacity
                className="py-8 items-center justify-center active:opacity-70"
                onPress={() => refetchSessions()}
              >
                <Text className="text-sm text-red-600 text-center mb-2">
                  We couldn&apos;t load your upcoming sessions.
                </Text>
                <Text className="text-[13px] text-blue-600 text-center">
                  Tap to try again
                </Text>
              </TouchableOpacity>
            ) : activeUpcomingSessions.length > 0 ? (
              <>
                <View
                  onLayout={(e) =>
                    setContainerWidth(e.nativeEvent.layout.width)
                  }
                >
                  <View className="relative">
                    {!isSmallScreen && canPrev ? (
                      <TouchableOpacity
                        onPress={prev}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 border border-gray-200 rounded-full p-1.5 shadow"
                        accessibilityLabel="Previous session"
                      >
                        <ChevronLeft color="#111" size={18} />
                      </TouchableOpacity>
                    ) : null}
                    {!isSmallScreen && canNext ? (
                      <TouchableOpacity
                        onPress={next}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 border border-gray-200 rounded-full p-1.5 shadow"
                        accessibilityLabel="Next session"
                      >
                        <ChevronRight color="#111" size={18} />
                      </TouchableOpacity>
                    ) : null}
                    <ScrollView
                      horizontal
                      ref={scrollRef}
                      showsHorizontalScrollIndicator={false}
                      pagingEnabled
                      snapToInterval={containerWidth || undefined}
                      snapToAlignment="start"
                      scrollEventThrottle={16}
                      onScroll={(ev: any) => {
                        const x = ev.nativeEvent.contentOffset.x || 0;
                        if (containerWidth > 0) {
                          const idx = Math.round(x / containerWidth);
                          const clamped = Math.max(
                            0,
                            Math.min(idx, totalSlides - 1),
                          );
                          if (clamped !== currentIndex) {
                            setCurrentIndex(clamped);
                          }
                        }
                      }}
                      onMomentumScrollEnd={(ev: any) => {
                        const x = ev.nativeEvent.contentOffset.x || 0;
                        if (containerWidth > 0) {
                          const idx = Math.round(x / containerWidth);
                          setCurrentIndex(
                            Math.max(0, Math.min(idx, totalSlides - 1)),
                          );
                        }
                      }}
                    >
                      {activeUpcomingSessions.map((session) => (
                        <TouchableOpacity
                          key={session.id}
                          activeOpacity={0.9}
                          onPress={() => handleOpenSession(session)}
                          style={{ width: Math.max(0, containerWidth) }}
                        >
                          <UpcomingSessionCard
                            {...createSessionCardProps(session)}
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {/* Pagination dots (max 10) */}
                    {totalSlides > 0 ? (
                      <View className="flex-row items-center justify-center mt-2">
                        {visiblePages.map((i) => {
                          const active = i === currentIndex;
                          return (
                            <TouchableOpacity
                              key={i}
                              onPress={() => goTo(i)}
                              className="mx-0.5"
                              accessibilityLabel={`Go to session ${i + 1}`}
                            >
                              <View
                                className={
                                  active
                                    ? "w-2.5 h-2.5 rounded-full bg-[#089769]"
                                    : "w-2 h-2 rounded-full bg-gray-300 opacity-60"
                                }
                              />
                            </TouchableOpacity>
                          );
                        })}
                        {totalSlides > 10 ? (
                          <Text className="text-xs text-gray-400 ml-1">
                            ...
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </>
            ) : (
              <View className="bg-white rounded-xl p-3 md:p-10 mb-[18px] border border-teal-100 min-h-[110px] md:min-h-[200px] justify-center shadow-sm md:shadow-none">
                <View className="items-center justify-center">
                  <View className="mb-4 hidden md:flex">
                    <Sparkles size={48} color="#10B981" />
                  </View>
                  <Text className="text-base md:text-2xl font-bold text-black mb-1.5">
                    You&apos;re all caught up!
                  </Text>
                  <Text className="text-[13px] md:text-base text-gray-500 text-center">
                    You do not have any scheduled sessions right now.
                  </Text>
                </View>
              </View>
            )}
            {!isRestricted && activeUpcomingSessions.length > 0 ? null : null}
          </View>

          {/* Reliever Requests Section */}
          {!isRestricted && relieverProposals.length > 0 && (
            <View className="mb-8">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-medium text-black">
                  👥 Reliever Requests
                </Text>
                <View className="bg-amber-100 px-2 py-1 rounded-full">
                  <Text className="text-xs font-bold text-amber-700">
                    {relieverProposals.length} Pending
                  </Text>
                </View>
              </View>
              <Text className="text-sm text-gray-600 mb-4">
                You&apos;ve been suggested as a reliever therapist for these
                sessions
              </Text>
              {relieverProposals.map((proposal) => (
                <TouchableOpacity
                  key={proposal.id}
                  onPress={() => {
                    router.push({
                      pathname: "/session-view",
                      params: {
                        sessionId: String(proposal.id),
                        fromRelieverRequest: "true",
                      },
                    } as any);
                  }}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-amber-900">
                        {proposal.patientName || "Patient"}
                      </Text>
                      <Text className="text-xs text-amber-700 mt-0.5">
                        Suggested by{" "}
                        {proposal.originalTherapistName || "Therapist"}
                      </Text>
                    </View>
                    <View className="bg-amber-100 px-2 py-1 rounded-full">
                      <Text className="text-[10px] font-bold text-amber-700">
                        PENDING APPROVAL
                      </Text>
                    </View>
                  </View>

                  {proposal.rescheduleProposalReason && (
                    <View className="bg-white/50 rounded-lg p-2 mb-2">
                      <Text className="text-xs text-amber-800 italic">
                        &quot;{proposal.rescheduleProposalReason}&quot;
                      </Text>
                    </View>
                  )}

                  {proposal.proposedRescheduleStartAt && (
                    <View className="flex-row items-center mt-2">
                      <Calendar size={14} color="#92400E" />
                      <Text className="text-xs text-amber-900 ml-2 font-medium">
                        {new Date(
                          proposal.proposedRescheduleStartAt,
                        ).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </Text>
                    </View>
                  )}

                  {proposal.conditionCase && (
                    <View className="flex-row items-center mt-1">
                      <Text className="text-xs text-amber-700">
                        Case: {proposal.conditionCase}
                      </Text>
                    </View>
                  )}

                  <View className="mt-3 pt-3 border-t border-amber-200">
                    <Text className="text-[11px] text-amber-600">
                      💡 Waiting for patient to approve the proposal
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Quick Actions */}
          {/* Quick Actions Title - Desktop */}
          <Text className="text-lg font-bold text-black mt-6 mb-4 hidden md:block">
            Quick Actions
          </Text>

          {/* Desktop Quick Actions Grid */}
          <View className="hidden md:flex flex-row flex-wrap gap-4">
            {/* Manage Schedule */}
            <TouchableOpacity
              className={`flex-1 min-w-[45%] bg-[#059669] p-6 rounded-xl border border-[#059669] shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200 ${
                isRestricted ? "opacity-60" : ""
              }`}
              disabled={isRestricted}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/schedule");
              }}
            >
              <View className="w-12 h-12 rounded-lg bg-white/20 items-center justify-center mb-4">
                <CalendarPlus size={24} color="white" />
              </View>
              <Text className="text-xl font-bold text-white mb-2">
                Manage Schedule
              </Text>
              <Text className="text-base text-white/90 mb-4">
                Add availability, reschedule appointments, or block off time.
              </Text>
              <View className="items-end mt-auto">
                <ArrowRight size={20} color="white" />
              </View>
            </TouchableOpacity>

            {/* Patient Sessions */}
            <TouchableOpacity
              className={`flex-1 min-w-[45%] bg-white p-6 rounded-xl border border-teal-100 shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200 ${
                isRestricted ? "opacity-60" : ""
              }`}
              disabled={isRestricted}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/sessions");
              }}
            >
              <View className="w-12 h-12 rounded-lg bg-teal-50 items-center justify-center mb-4">
                <Users size={24} color="#059669" />
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-2">
                Patient Sessions
              </Text>
              <Text className="text-base text-gray-500 mb-4">
                Review past session notes and patient history.
              </Text>
              <View className="items-end mt-auto">
                <ArrowRight size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>

            {/* Reliever Network */}
            <TouchableOpacity
              className={`flex-1 min-w-[45%] bg-white p-6 rounded-xl border border-teal-100 shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200 ${
                isRestricted ? "opacity-60" : ""
              }`}
              disabled={isRestricted}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/colleagues");
              }}
            >
              <View className="w-12 h-12 rounded-lg bg-teal-50 items-center justify-center mb-4">
                <Users size={24} color="#059669" />
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-2">
                Reliever Network
              </Text>
              <Text className="text-base text-gray-500 mb-4">
                Connect with trusted colleagues for reliever services.
              </Text>
              <View className="items-end mt-auto">
                <ArrowRight size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Mobile Quick Actions Grid */}
          <View className="md:hidden flex-row flex-wrap gap-4 mt-1.5">
            {/* Manage Schedule */}
            <TouchableOpacity
              className={`bg-[#059669] p-5 rounded-2xl shadow-sm relative overflow-hidden min-h-[180px] justify-between border border-[#059669] ${
                isRestricted ? "opacity-60" : ""
              }`}
              style={{ width: "47.5%" }}
              disabled={isRestricted}
              activeOpacity={0.9}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/schedule");
              }}
            >
              <View>
                <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-white/20 border border-white/10">
                  <CalendarPlus size={20} color="white" />
                </View>
                <Text className="text-lg font-bold text-white mb-2">
                  Manage Schedule
                </Text>
                <Text className="text-teal-100 text-xs leading-relaxed opacity-90">
                  Add availability, reschedule appointments, or block off time.
                </Text>
              </View>
              <View className="items-end">
                <ArrowRight size={18} color="white" />
              </View>
            </TouchableOpacity>

            {/* Patient Sessions */}
            <TouchableOpacity
              className={`bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[180px] justify-between ${
                isRestricted ? "opacity-60" : ""
              }`}
              style={{ width: "47.5%" }}
              disabled={isRestricted}
              activeOpacity={0.9}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/sessions");
              }}
            >
              <View>
                <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                  <Users size={20} color="#0D9488" />
                </View>
                <Text className="text-lg font-bold text-gray-900 mb-2">
                  Patient Sessions
                </Text>
                <Text className="text-gray-500 text-xs leading-relaxed">
                  Review past session notes and patient history.
                </Text>
              </View>
              <View className="items-end">
                <ArrowRight size={18} color="#D1D5DB" />
              </View>
            </TouchableOpacity>

            {/* Reliever Network */}
            <TouchableOpacity
              className={`bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[180px] justify-between ${
                isRestricted ? "opacity-60" : ""
              }`}
              style={{ width: "47.5%" }}
              disabled={isRestricted}
              activeOpacity={0.9}
              onPress={() => {
                if (isRestricted) return;
                router.push("/(therapist)/colleagues");
              }}
            >
              <View>
                <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                  <Users size={20} color="#0D9488" />
                </View>
                <Text className="text-lg font-bold text-gray-900 mb-2">
                  Reliever Network
                </Text>
                <Text className="text-gray-500 text-xs leading-relaxed">
                  Connect with trusted colleagues for reliever services.
                </Text>
              </View>
              <View className="items-end">
                <ArrowRight size={18} color="#D1D5DB" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Reviews Section */}
          <Text className="text-lg font-bold text-gray-900 mt-8 mb-4">
            Recent Reviews
          </Text>

          <View className="bg-white rounded-2xl p-6 mb-8 border border-gray-100 shadow-sm">
            {!canAccessCoreFeatures ? (
              <View className="py-6 items-center justify-center">
                <Text className="text-base font-semibold text-black mb-1.5 text-center">
                  {!isVerified
                    ? "Reviews will appear here once verified"
                    : "Complete onboarding to see reviews"}
                </Text>
                <Text className="text-sm text-gray-500 text-center">
                  {!isVerified
                    ? "You'll see patient reviews once your application is approved."
                    : "You'll see patient reviews once you complete your profile setup."}
                </Text>
              </View>
            ) : ratingsLoading ? (
              <View className="py-8 items-center justify-center">
                <View className="w-full">
                  <View className="flex-row items-center mb-2">
                    <Skeleton
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        marginRight: 12,
                      }}
                    />
                    <View className="flex-1 justify-center">
                      <Skeleton
                        style={{
                          height: 14,
                          width: "60%",
                          borderRadius: 4,
                          marginBottom: 8,
                        }}
                      />
                      <Skeleton
                        style={{ height: 12, width: "40%", borderRadius: 4 }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : ratingsError ? (
              <TouchableOpacity
                className="py-8 items-center justify-center active:opacity-70"
                onPress={() => refetchRatings()}
              >
                <Text className="text-sm text-red-600 text-center mb-2">
                  We couldn&apos;t load your reviews.
                </Text>
                <Text className="text-[13px] text-blue-600 text-center">
                  Tap to try again
                </Text>
              </TouchableOpacity>
            ) : ratingsData.length === 0 ? (
              <View className="py-8 items-center justify-center">
                <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center mb-3">
                  <Star size={32} color="#9CA3AF" />
                </View>
                <Text className="text-base font-semibold text-black mb-1.5">
                  No reviews yet
                </Text>
                <Text className="text-sm text-gray-500 text-center">
                  Reviews from your patients will appear here.
                </Text>
              </View>
            ) : (
              <ScrollView
                className="max-h-[400px]"
                showsVerticalScrollIndicator={true}
              >
                {ratingsData.map((rating) => {
                  const isExpanded = expandedReviewId === rating.id;
                  return (
                    <TouchableOpacity
                      key={rating.id}
                      activeOpacity={0.7}
                      onPress={() => toggleReviewExpansion(rating.id)}
                      className="py-4 border-b border-gray-100 last:border-0"
                    >
                      {/* Main row - always visible */}
                      <View className="flex-row items-center">
                        {rating.patientProfilePictureUrl ? (
                          <Image
                            source={{ uri: rating.patientProfilePictureUrl }}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center">
                            <Text className="text-teal-700 font-bold text-sm">
                              {getInitials(rating.patientName || undefined)}
                            </Text>
                          </View>
                        )}
                        <View className="flex-1 ml-3">
                          <Text className="text-sm font-bold text-gray-900">
                            {rating.patientName || "Patient"}
                          </Text>
                          <View className="flex-row items-center gap-1 mt-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                color={i < rating.score ? "#FBBF24" : "#D1D5DB"}
                                fill={
                                  i < rating.score ? "#FBBF24" : "transparent"
                                }
                              />
                            ))}
                            <Text className="text-xs text-gray-400 ml-2">
                              {new Date(rating.createdAt).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        {isExpanded ? (
                          <ChevronUp size={18} color="#9CA3AF" />
                        ) : (
                          <ChevronDown size={18} color="#9CA3AF" />
                        )}
                      </View>

                      {/* Expanded content - case badge and comment */}
                      {isExpanded && (
                        <View className="mt-3 ml-13 pl-13">
                          {rating.caseToTreat && (
                            <View className="bg-teal-50 self-start px-2 py-0.5 rounded mb-2 ml-13">
                              <Text className="text-xs text-teal-600 font-medium">
                                Case: {rating.caseToTreat}
                              </Text>
                            </View>
                          )}
                          <View className="bg-gray-50 p-3 rounded-lg border border-gray-100 ml-13">
                            {rating.comment ? (
                              <Text className="text-sm text-gray-600 italic">
                                &quot;{rating.comment}&quot;
                              </Text>
                            ) : (
                              <Text className="text-sm text-gray-400 italic">
                                No written feedback provided
                              </Text>
                            )}
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {ratingsData.length > 10 ? (
                  <Text className="text-xs text-gray-500 text-center mt-2">
                    Showing all {ratingsData.length} reviews
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
