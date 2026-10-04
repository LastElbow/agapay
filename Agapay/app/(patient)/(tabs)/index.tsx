import React, { useCallback, useMemo, useState, useEffect } from "react";
import UpcomingSessionCard from "@/src/components/UpcomingSessionCard";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  fetchTherapists,
  THERAPISTS_QUERY_KEY,
} from "@/src/services/therapists";
import {
  fetchUpcomingSessions,
  patientUpcomingSessionsQueryKey,
  allSessionsQueryKey,
  type SessionSummary,
} from "@/src/services/sessions";
import { getContractsForPatient } from "@/src/services/contracts";
import { resolveAvatarSource } from "@/src/utils/avatar";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import signalrManager from "@/src/services/signalrManager";
import {
  Bell,
  Clock,
  Search,
  Sparkles,
  Star,
  Brain,
  ArrowRight,
} from "lucide-react-native";
import {

  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatPeso } from "@/src/utils/money";
import { Ionicons } from "@expo/vector-icons";
import {
  getItem as ssGet,
  setItem as ssSet,
  deleteItem as ssDel,
  multiGet as ssMultiGet,
} from "@/src/utils/safeSecureStore";
import { getSyncedNow, syncServerTime } from "@/src/utils/serverTime";
import WebHeader from "@/src/components/WebHeader";
import {
  fetchPatientProfilePicture,
  patientProfilePictureQueryKey,
} from "@/src/services/patientProfile";

const EMPTY_ARRAY: any[] = [];

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const fallbackPatient = {
  firstName: "Unknown",
  lastName: "User",
  avatar: require("@/assets/images/react-logo.png"),
};

export default function PatientHome() {
  const router = useRouter();
  const { user: authUser, accessToken, signOut } = useAuth();
  const queryClient = useQueryClient();

  // Track locally running timers (rehydrated from SecureStore) to show Active badge with live timer
  const [sessionStartMsById, setSessionStartMsById] = useState<
    Record<number, number>
  >({});
  // Tick every second to update timer display when timers are running
  const [nowTick, setNowTick] = useState(0);

  // Sync server time on mount for accurate timer display
  useEffect(() => {
    syncServerTime().catch(() => { });
  }, []);

  const {
    data: upcomingSessions = EMPTY_ARRAY,
    isLoading: sessionsLoading,
    isRefetching: sessionsRefetching,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: patientUpcomingSessionsQueryKey,
    queryFn: () => fetchUpcomingSessions(5),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!accessToken,
  });

  // Get current patient ID from the first session (all sessions belong to this patient)
  const currentPatientId = useMemo(
    () => (upcomingSessions.length > 0 ? upcomingSessions[0].patientId : null),
    [upcomingSessions]
  );

  // Fetch contracts to count pending proposals
  const { data: patientContracts = EMPTY_ARRAY } = useQuery({
    queryKey: ["contracts", "patient", currentPatientId],
    queryFn: () => getContractsForPatient(currentPatientId!),
    enabled: currentPatientId != null,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch unreviewed contracts for Reviews section
  // These are contracts that are Completed or Terminated (Discontinued) and not yet rated
  const { data: unreviewedContracts = EMPTY_ARRAY } = useQuery({
    queryKey: ["contracts", "unreviewed"],
    queryFn: async () => {
      try {
        const mod = await import("@/src/services/sessions");
        if (typeof mod.fetchUnreviewedContracts === "function") {
          return mod.fetchUnreviewedContracts();
        }
      } catch {
        // ignore and fall back to empty array
      }
      return [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!accessToken,
  });

  // Fetch profile picture for display in header
  const { data: profilePictureData } = useQuery({
    queryKey: patientProfilePictureQueryKey,
    queryFn: fetchPatientProfilePicture,
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });



  React.useEffect(() => {
    if (!accessToken) return;

    let active = true;
    let unsubscribeFn: (() => void) | undefined;

    const setupConnection = async () => {
      try {
        await signalrManager.getSharedConnection('contracts', accessToken);

        if (!active) {
          signalrManager.releaseConnection('contracts');
          return;
        }

        unsubscribeFn = signalrManager.subscribeToEvent('contracts', "ContractActivated", (payload: any) => {
          if (!active || !payload) return;
          const contractId = Number(payload.contractId);
          queryClient.setQueryData<SessionSummary[] | undefined>(
            patientUpcomingSessionsQueryKey,
            (existing) =>
              Array.isArray(existing)
                ? existing.filter(
                  (session) => session.contractId !== contractId
                )
                : existing
          );
          queryClient.setQueryData<SessionSummary[] | undefined>(
            allSessionsQueryKey,
            (existing) =>
              Array.isArray(existing)
                ? existing.filter(
                  (session) => session.contractId !== contractId
                )
                : existing
          );
          queryClient
            .invalidateQueries({ queryKey: patientUpcomingSessionsQueryKey })
            .catch(() => { });
          queryClient
            .invalidateQueries({ queryKey: allSessionsQueryKey })
            .catch(() => { });
          // Invalidate contracts for notification badge
          queryClient
            .invalidateQueries({ queryKey: ["contracts", "patient"] })
            .catch(() => { });
          // Invalidate unreviewed contracts to update Reviews badge counter
          queryClient
            .invalidateQueries({ queryKey: ["contracts", "unreviewed"] })
            .catch(() => { });
        });
      } catch (error) {
        console.warn("PatientHome contracts hub connection failed", error);
      }
    };

    setupConnection();

    return () => {
      active = false;
      if (unsubscribeFn) unsubscribeFn();
      signalrManager.releaseConnection('contracts');
    };
  }, [accessToken, queryClient]);

  // Setup Sessions Hub for real-time session updates (timer sync)
  React.useEffect(() => {
    if (!accessToken) return;

    let active = true;
    const unsubscribeFns: (() => void)[] = [];

    const setupSessionsHub = async () => {
      try {
        await signalrManager.getSharedConnection('sessions', accessToken);

        if (!active) {
          signalrManager.releaseConnection('sessions');
          return;
        }

        // Handle SessionStarted event
        unsubscribeFns.push(signalrManager.subscribeToEvent('sessions', "SessionStarted", async (payload: any) => {
          if (!active || !payload) return;
          const sessionId = Number(payload.sessionId);
          if (!Number.isFinite(sessionId)) return;

          // Use startAtMs from server for synchronized timer, fallback to Date.now()
          const startMs = Number.isFinite(payload.startAtMs)
            ? Number(payload.startAtMs)
            : Date.now();
          setSessionStartMsById((prev) => ({ ...prev, [sessionId]: startMs }));

          // Persist timer to SecureStore
          try {
            await ssSet(
              `sessionTimer:${sessionId}`,
              JSON.stringify({ startAtMs: startMs })
            );
          } catch (err) {
            console.warn("Failed to store session timer", err);
          }

          // Invalidate queries to refresh UI
          queryClient
            .invalidateQueries({ queryKey: patientUpcomingSessionsQueryKey })
            .catch(() => { });
          queryClient
            .invalidateQueries({ queryKey: allSessionsQueryKey })
            .catch(() => { });
        }));

        // Handle SessionCompleted event
        unsubscribeFns.push(signalrManager.subscribeToEvent('sessions', "SessionCompleted", async (payload: any) => {
          if (!active || !payload) return;
          const sessionId = Number(payload.sessionId);
          if (!Number.isFinite(sessionId)) return;

          setSessionStartMsById((prev) => {
            const updated = { ...prev };
            delete updated[sessionId];
            return updated;
          });

          // Clear timer from SecureStore
          try {
            await ssDel(`sessionTimer:${sessionId}`);
          } catch (err) {
            console.warn("Failed to clear session timer", err);
          }

          // Invalidate queries to refresh UI
          queryClient
            .invalidateQueries({ queryKey: patientUpcomingSessionsQueryKey })
            .catch(() => { });
          queryClient
            .invalidateQueries({ queryKey: allSessionsQueryKey })
            .catch(() => { });
        }));

        // Handle SessionMarkedDone event
        unsubscribeFns.push(signalrManager.subscribeToEvent('sessions', "SessionMarkedDone", async (payload: any) => {
          if (!active || !payload) return;
          const sessionId = Number(payload.sessionId);
          if (!Number.isFinite(sessionId)) return;

          setSessionStartMsById((prev) => {
            const updated = { ...prev };
            delete updated[sessionId];
            return updated;
          });

          // Clear timer from SecureStore
          try {
            await ssDel(`sessionTimer:${sessionId}`);
          } catch (err) {
            console.warn("Failed to clear session timer", err);
          }

          // Invalidate queries to refresh UI
          queryClient
            .invalidateQueries({ queryKey: patientUpcomingSessionsQueryKey })
            .catch(() => { });
          queryClient
            .invalidateQueries({ queryKey: allSessionsQueryKey })
            .catch(() => { });
        }));
      } catch (error) {
        console.warn("PatientHome sessions hub connection failed", error);
      }
    };

    setupSessionsHub();

    return () => {
      active = false;
      unsubscribeFns.forEach(unsub => unsub());
      signalrManager.releaseConnection('sessions');
    };
  }, [accessToken, queryClient]);

  const activeUpcomingSessions = useMemo(() => {
    return upcomingSessions.filter((s) => {
      const contractStatus = (s.contractStatus ?? "").toLowerCase();
      const sessionStatus = (s.status ?? "").toLowerCase();
      const isDoneForToday = sessionStatus === "donefortoday" || sessionStatus === "done for today";
      return contractStatus !== "completed" && contractStatus !== "terminated" && !isDoneForToday;
    });
  }, [upcomingSessions]);

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
          } catch { }
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
            (s) => `sessionTimer:${s.id}`
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
            } catch { }
          }
          if (!cancelled) setSessionStartMsById(map);
        } catch {
          if (!cancelled) setSessionStartMsById({});
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeUpcomingSessions])
  );

  // Auto-start timer when scheduled time is reached (patient side)
  useEffect(() => {
    if (!activeUpcomingSessions || activeUpcomingSessions.length === 0) return;

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    for (const session of activeUpcomingSessions) {
      // Skip if timer already running for this session
      if (sessionStartMsById[session.id]) continue;

      const sessionStatus = (session.status ?? "").toLowerCase();
      const isDoneForToday = sessionStatus === "donefortoday";
      const isCancelled = sessionStatus === "cancelled" || sessionStatus === "canceled";
      const isCompleted = sessionStatus === "completed";
      const isTerminated = sessionStatus === "terminated";

      // Skip if session is in a final state
      if (isDoneForToday || isCancelled || isCompleted || isTerminated) continue;

      const scheduledStartTime = new Date(session.startAt).getTime();
      if (!Number.isFinite(scheduledStartTime)) continue;

      const now = Date.now();

      // If scheduled time has passed, start the timer immediately
      if (now >= scheduledStartTime) {
        setSessionStartMsById((prev) => ({
          ...prev,
          [session.id]: scheduledStartTime,
        }));
        // Persist to SecureStore
        (async () => {
          try {
            await ssSet(
              `sessionTimer:${session.id}`,
              JSON.stringify({ startAtMs: scheduledStartTime })
            );
          } catch { }
        })();
        continue;
      }

      // If scheduled time is in the future, set a timeout
      const delay = scheduledStartTime - now;
      if (delay > 0 && delay <= 24 * 60 * 60 * 1000) {
        const timeoutId = setTimeout(() => {
          setSessionStartMsById((prev) => ({
            ...prev,
            [session.id]: scheduledStartTime,
          }));
          // Persist to SecureStore
          (async () => {
            try {
              await ssSet(
                `sessionTimer:${session.id}`,
                JSON.stringify({ startAtMs: scheduledStartTime })
              );
            } catch { }
          })();
        }, delay);
        timeoutIds.push(timeoutId);
      }
    }

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [activeUpcomingSessions, sessionStartMsById]);

  const formatHMS = (elapsedSec: number) => {
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Tick every second if there is at least one running timer (for live timer display)
  useEffect(() => {
    const hasAny = Object.keys(sessionStartMsById).length > 0;
    if (!hasAny) return;
    const id = setInterval(() => setNowTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [sessionStartMsById]);

  // Avoid refetching on focus to align with therapist home efficiency

  const displayUser = useMemo(() => {
    if (!authUser) return fallbackPatient;
    const asAny = authUser as Record<string, any>;
    const first =
      asAny.firstName ??
      asAny.FirstName ??
      asAny.givenName ??
      asAny.GivenName ??
      fallbackPatient.firstName;
    const last =
      asAny.lastName ??
      asAny.LastName ??
      asAny.familyName ??
      asAny.FamilyName ??
      fallbackPatient.lastName;
    return {
      ...authUser,
      firstName: first,
      lastName: last,
    };
  }, [authUser]);
  const greetingName = [displayUser.firstName, displayUser.lastName]
    .filter(Boolean)
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" ");

  // Use profile picture from API if available, otherwise fall back to user avatar
  const avatarSource = useMemo(() => {
    if (profilePictureData?.profilePictureUrl) {
      return { uri: profilePictureData.profilePictureUrl };
    }
    return resolveAvatarSource((displayUser as any)?.avatar, fallbackPatient.avatar);
  }, [displayUser, profilePictureData]);

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
    []
  );

  // Use centralized formatPeso from src/utils/money

  const nextSession = useMemo(() => {
    if (activeUpcomingSessions.length === 0) return null;

    // Prioritize active sessions (ones with running timers or InProgress status)
    const activeSession = activeUpcomingSessions.find((s) => {
      const hasTimer = sessionStartMsById[s.id];
      const isInProgress = (s.status ?? "").toLowerCase() === "inprogress";
      return hasTimer || isInProgress;
    });

    // Fall back to first upcoming session
    return activeSession || activeUpcomingSessions[0];
  }, [activeUpcomingSessions, sessionStartMsById]);

  const otherSessionsCount = useMemo(
    () => Math.max(0, activeUpcomingSessions.length - 1),
    [activeUpcomingSessions]
  );

  const nextSessionCard = useMemo(() => {
    if (!nextSession) return null;
    const date = formatSessionDate(nextSession.startAt);
    const timeRange = formatSessionTimeRange(
      nextSession.startAt,
      nextSession.endAt
    );
    // Only use avatar if therapist has a profile picture, otherwise null to show initials
    const hasProfilePicture =
      nextSession.therapistProfilePictureUrl &&
      String(nextSession.therapistProfilePictureUrl).trim().length > 0;
    const avatar = hasProfilePicture
      ? resolveAvatarSource(
        nextSession.therapistProfilePictureUrl,
        fallbackPatient.avatar
      )
      : null;

    // Determine display status based on contract status if available
    let displayStatus = nextSession.status;
    const contractStatus = (nextSession.contractStatus ?? "").toLowerCase();
    const sessionStatus = (nextSession.status ?? "").toLowerCase();

    // Check if contract is ended or session is cancelled
    const isContractEnded =
      contractStatus === "completed" || contractStatus === "terminated";
    const isSessionCancelled =
      sessionStatus === "cancelled" || sessionStatus === "canceled";
    const isDoneForToday =
      sessionStatus === "donefortoday" || sessionStatus === "done for today";

    // Determine dynamic status based on locally running timer or done for today status
    const startMs = sessionStartMsById[nextSession.id as number];
    let statusOverride: string | undefined;
    let statusColorHex: string | undefined;

    // Show "Inactive" for ended contracts or cancelled sessions
    if (isContractEnded || isSessionCancelled) {
      statusOverride = "Inactive";
      statusColorHex = "#6B7280"; // grey
    } else if (isDoneForToday) {
      statusOverride = "Done for today";
      statusColorHex = "#6B7280"; // grey
    } else if (Number.isFinite(startMs)) {
      // Use synced server time for accurate elapsed calculation
      const elapsed = Math.max(0, Math.floor((getSyncedNow() - startMs) / 1000));
      statusOverride = `Active • ${formatHMS(elapsed)}`;
      statusColorHex = "#10B981"; // green
    } else if (contractStatus === "pendingconfirmation") {
      displayStatus = "Pending Confirmation";
    } else if (nextSession.isRescheduled && sessionStatus === "scheduled") {
      // Show "Rescheduled" instead of "Scheduled" for rescheduled sessions
      statusOverride = "Rescheduled";
      statusColorHex = "#F59E0B"; // amber
    }
    return {
      therapistName: nextSession.therapistName || "Unknown Therapist",
      role: nextSession.conditionCase || "Unknown Condition",
      date,
      time: timeRange,
      address: nextSession.locationAddress ?? undefined,
      status: displayStatus,
      statusOverride,
      statusColorHex,
      isRescheduled: nextSession.isRescheduled || false,
      avatarSource: avatar,
    };
  }, [
    nextSession,
    formatSessionDate,
    formatSessionTimeRange,
    sessionStartMsById,
    nowTick, // trigger re-render every second when timer is running
  ]);

  const handleOpenSession = useCallback(() => {
    if (!nextSession) return;

    const params: Record<string, string> = {
      therapistName: nextSession.therapistName || "Physical Therapist",
      patientName: greetingName || "John Doe",
      caseTitle: nextSession.conditionCase || "Therapy Session",
      day: formatSessionDate(nextSession.startAt),
      timeRange: formatSessionTimeRange(nextSession.startAt, nextSession.endAt),
      duration: `${nextSession.durationMinutes} mins`,
      profileId: String(nextSession.patientId),
      sessionId: String(nextSession.id),
      startAt: nextSession.startAt,
      endAt: nextSession.endAt,
    };

    if (nextSession.locationAddress)
      params.address = nextSession.locationAddress;
    if (nextSession.latitude != null) params.lat = String(nextSession.latitude);
    if (nextSession.longitude != null)
      params.lng = String(nextSession.longitude);

    const professionalFee = formatPeso(nextSession.professionalFee);
    const locationFee = formatPeso(nextSession.locationFee);
    const miscFee = formatPeso(nextSession.miscellaneousFee);
    const totalFee = formatPeso(nextSession.totalFee);

    if (professionalFee) params.fee = professionalFee;
    if (locationFee) params.locFee = locationFee;
    if (miscFee) params.toolsFee = miscFee;
    if (totalFee) params.total = totalFee;

    router.push({ pathname: "/create-session", params } as any);
  }, [
    nextSession,
    greetingName,
    formatSessionDate,
    formatSessionTimeRange,
    router,
  ]);

  const isFetchingSessions = sessionsLoading || sessionsRefetching;

  const getTimeAwareGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };
  const greeting = getTimeAwareGreeting();

  // Track if notifications have been viewed
  const [hasViewedNotifications, setHasViewedNotifications] =
    React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const confirmLogout = async () => {
    try {
      await ssDel("notificationsViewed");
      await signOut();
      router.replace("/(auth)/signin");
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      setShowLogoutModal(false);
    }
  };

  // Load the viewed state on mount and reset on new proposals
  React.useEffect(() => {
    const loadViewedState = async () => {
      try {
        const viewed = await ssGet("notificationsViewed");
        setHasViewedNotifications(viewed === "true");
      } catch (err) {
        console.warn("Failed to load notification viewed state", err);
      }
    };
    loadViewedState();
  }, []);

  // Reset viewed state when new proposals arrive
  React.useEffect(() => {
    if (patientContracts.some((c) => c.status === "PendingConfirmation")) {
      setHasViewedNotifications(false);
      ssSet("notificationsViewed", "false").catch(() => { });
    }
  }, [patientContracts]);

  // Notifications badge: sessions in next 24 hours + pending contract proposals
  const sessionsSoonCount = useMemo(() => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    return upcomingSessions.filter((s) => {
      const start = new Date(s.startAt).getTime();
      return !Number.isNaN(start) && start >= now && start <= in24h;
    }).length;
  }, [upcomingSessions]);

  const pendingProposalsCount = useMemo(() => {
    return patientContracts.filter((c) => c.status === "PendingConfirmation")
      .length;
  }, [patientContracts]);

  const totalNotifications = sessionsSoonCount + pendingProposalsCount;

  // Only show badge if not viewed or if there are new notifications
  const notificationCount =
    hasViewedNotifications && totalNotifications > 0
      ? 0
      : Math.min(99, Math.max(0, totalNotifications));

  return (
    <View className="flex-1 bg-teal-50">
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-blue-100 items-center justify-center mb-3">
                <Ionicons name="help-circle" size={32} color="#2F80ED" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                Confirm Logout
              </Text>
            </View>
            <Text className="text-base text-gray-600 text-center mb-6">
              Are you sure you want to log out?
            </Text>
            <View className="flex-row justify-around">
              <TouchableOpacity
                onPress={() => setShowLogoutModal(false)}
                className="bg-gray-200 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-gray-800 text-center font-semibold text-base">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmLogout}
                className="bg-red-500 py-3.5 rounded-xl flex-1 mx-2"
                activeOpacity={0.8}
              >
                <Text className="text-white text-center font-semibold text-base">
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <WebHeader />

      <SafeAreaView className="flex-1 bg-teal-50 w-full" edges={["top", "left", "right"]}>
        <ScrollView
          className="flex-1 w-full"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-screen-lg mx-auto px-[18px] pt-10 md:pt-8 pb-10">
            {/* Desktop Header */}
            <View className="hidden md:flex items-center mb-10 mt-4">
              <Text className="text-3xl font-bold text-gray-900">
                {greeting}, {greetingName}!
              </Text>
              <Text className="text-gray-500 mt-2 text-base">
                Here is what&apos;s happening with your therapy sessions today.
              </Text>
            </View>

            {/* Mobile Header */}
            <View className="md:hidden flex-row justify-between items-center mb-5">
              {avatarSource !== fallbackPatient.avatar ? (
                <Image
                  source={avatarSource}
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
                <Text className="text-xl font-bold text-black">
                  {greetingName || "John Doe"}
                </Text>
              </View>
              <View className="w-10 h-10 items-center justify-center">
                <TouchableOpacity
                  accessibilityRole="button"
                  className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                  onPress={async () => {
                    // Mark notifications as viewed
                    setHasViewedNotifications(true);
                    try {
                      await ssSet("notificationsViewed", "true");
                    } catch (err) {
                      console.warn(
                        "Failed to save notification viewed state",
                        err
                      );
                    }
                    router.push({ pathname: "/notifications" } as any);
                  }}
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

            {/* Upcoming Session Section */}
            <Text className="text-lg font-medium text-black mt-3 mb-2 md:hidden">
              Upcoming Session
            </Text>

            {nextSessionCard && !isFetchingSessions && !sessionsError ? (
              <View className="mb-[18px]">
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleOpenSession}
                >
                  <UpcomingSessionCard {...nextSessionCard} />
                </TouchableOpacity>
                {otherSessionsCount > 0 ? (
                  <Text className="text-xs text-gray-500 text-center mt-2">
                    {otherSessionsCount === 1
                      ? "1 more session scheduled"
                      : `${otherSessionsCount} more sessions scheduled`}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="bg-white rounded-xl p-3 md:p-10 mb-[18px] border border-teal-100 min-h-[110px] md:min-h-[200px] justify-center shadow-sm md:shadow-none">
                {isFetchingSessions ? (
                  <View className="items-center justify-center py-5 gap-2.5">
                    <ActivityIndicator color="#2F80ED" />
                    <Text className="text-[13px] text-gray-500">
                      Checking your schedule…
                    </Text>
                  </View>
                ) : sessionsError ? (
                  <TouchableOpacity
                    className="items-center justify-center py-5 px-3 gap-1.5"
                    activeOpacity={0.7}
                    onPress={() => refetchSessions()}
                  >
                    <Text className="text-[13px] text-red-600 text-center">
                      We couldn&apos;t load your upcoming sessions.
                    </Text>
                    <Text className="text-[13px] text-blue-600 font-semibold">
                      Tap to try again
                    </Text>
                  </TouchableOpacity>
                ) : (
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
                )}
              </View>
            )}

            {/* Quick Actions Title - Desktop */}
            <Text className="text-lg font-bold text-black mt-6 mb-4 hidden md:block">
              Quick Actions
            </Text>

            {/* Desktop Quick Actions Grid */}
            <View className="hidden md:flex flex-row flex-wrap gap-4">
              {/* Get Matched */}
              <TouchableOpacity
                className="flex-1 min-w-[45%] bg-[#059669] p-6 rounded-xl border border-[#059669] shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200"
                onPress={() => router.push("/(patient)/recommend/results")}
              >
                <View className="w-12 h-12 rounded-lg bg-white/20 items-center justify-center mb-4">
                  <Brain size={24} color="white" />
                </View>
                <Text className="text-xl font-bold text-white mb-2">
                  Get Matched
                </Text>
                <Text className="text-base text-white/90 mb-4">
                  Let our algorithm suggest a list of therapists based on your
                  specific needs.
                </Text>
                <View className="items-end mt-auto">
                  <ArrowRight size={20} color="white" />
                </View>
              </TouchableOpacity>

              {/* Browse Therapists */}
              <TouchableOpacity
                className="flex-1 min-w-[45%] bg-white p-6 rounded-xl border border-teal-100 shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200"
                onPress={async () => {
                  queryClient.prefetchQuery({
                    queryKey: THERAPISTS_QUERY_KEY,
                    queryFn: () => fetchTherapists(),
                    staleTime: 60_000,
                  });
                  router.push("/(patient)/therapists");
                }}
              >
                <View className="w-12 h-12 rounded-lg bg-teal-50 items-center justify-center mb-4">
                  <Search size={24} color="#059669" />
                </View>
                <Text className="text-xl font-bold text-gray-900 mb-2">
                  Browse Therapists
                </Text>
                <Text className="text-base text-gray-500 mb-4">
                  Browse specialist directory
                </Text>
                <View className="items-end mt-auto">
                  <ArrowRight size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>

              {/* My Sessions */}
              <TouchableOpacity
                className="flex-1 min-w-[45%] bg-white p-6 rounded-xl border border-teal-100 shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200"
                onPress={() =>
                  router.push({ pathname: "/(patient)/sessions" } as any)
                }
              >
                <View className="w-12 h-12 rounded-lg bg-teal-50 items-center justify-center mb-4">
                  <Clock size={24} color="#059669" />
                </View>
                <Text className="text-xl font-bold text-gray-900 mb-2">
                  My Sessions
                </Text>
                <Text className="text-base text-gray-500 mb-4">
                  View upcoming appointments
                </Text>
                <View className="items-end mt-auto">
                  <ArrowRight size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>

              {/* Write a Review */}
              <TouchableOpacity
                className="flex-1 min-w-[45%] bg-white p-6 rounded-xl border border-teal-100 shadow-sm hover:scale-[1.02] hover:shadow-md transition-all duration-200"
                onPress={() => router.push({ pathname: "/rating" } as any)}
              >
                <View className="w-12 h-12 rounded-lg bg-teal-50 items-center justify-center mb-4">
                  <Star size={24} color="#059669" />
                </View>
                <Text className="text-xl font-bold text-gray-900 mb-2">
                  Write a Review
                </Text>
                <Text className="text-base text-gray-500 mb-4">
                  Rate your recent experience
                </Text>
                <View className="items-end mt-auto">
                  <ArrowRight size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Mobile Quick Actions Grid */}
            <View className="md:hidden flex-row flex-wrap gap-4 mt-1.5">
              {/* Get Matched */}
              <TouchableOpacity
                className="bg-[#059669] p-5 rounded-2xl shadow-sm relative overflow-hidden min-h-[180px] justify-between"
                style={{ width: "47.5%" }}
                activeOpacity={0.9}
                onPress={() => router.push("/(patient)/recommend/results")}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-white/20 border border-white/10">
                    <Brain size={20} color="white" />
                  </View>
                  <Text className="text-lg font-bold text-white mb-2">
                    Get Matched
                  </Text>
                  <Text className="text-teal-100 text-xs leading-relaxed opacity-90">
                    Let our algorithm suggest a list of therapists based on your
                    specific needs.
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="white" />
                </View>
              </TouchableOpacity>

              {/* Browse Therapists */}
              <TouchableOpacity
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[180px] justify-between"
                style={{ width: "47.5%" }}
                activeOpacity={0.9}
                onPress={async () => {
                  queryClient.prefetchQuery({
                    queryKey: THERAPISTS_QUERY_KEY,
                    queryFn: () => fetchTherapists(),
                    staleTime: 60_000,
                  });
                  router.push("/(patient)/therapists");
                }}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Search size={20} color="#0D9488" />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-2">
                    Browse Therapists
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    Browse specialist directory
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
                </View>
              </TouchableOpacity>

              {/* My Sessions */}
              <TouchableOpacity
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[180px] justify-between"
                style={{ width: "47.5%" }}
                activeOpacity={0.9}
                onPress={() =>
                  router.push({ pathname: "/(patient)/sessions" } as any)
                }
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Clock size={20} color="#0D9488" />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-2">
                    My Sessions
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    View upcoming appointments
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
                </View>
              </TouchableOpacity>

              {/* Write a Review */}
              <TouchableOpacity
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm min-h-[180px] justify-between"
                style={{ width: "47.5%" }}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: "/rating" } as any)}
              >
                <View>
                  <View className="mb-4 h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Star size={20} color="#0D9488" />
                  </View>
                  <Text className="text-lg font-bold text-gray-900 mb-2">
                    Write a Review
                  </Text>
                  <Text className="text-gray-500 text-xs leading-relaxed">
                    Rate your recent experience
                  </Text>
                </View>
                <View className="items-end">
                  <ArrowRight size={18} color="#D1D5DB" />
                </View>
                {unreviewedContracts.length > 0 && (
                  <View className="absolute top-4 right-4 min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-600 items-center justify-center">
                    <Text className="text-[11px] text-white font-bold">
                      {unreviewedContracts.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
