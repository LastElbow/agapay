import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Alert,
  TextInput,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebHeader from "@/src/components/WebHeader";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  FileText,
  ChevronRight,
  Star,
} from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSessionDetail,
  sessionDetailQueryKey,
  upcomingSessionsQueryKey,
  allSessionsQueryKey,
  cancelSession,
  requestCancellation,
  acknowledgeCancellation,
  startSession as startSessionApi,
  markAsDone,
  logTodaySession,
  fetchSessionLogs,
  sessionLogsQueryKey,
  rescheduleSession,
  approveReschedule,
  declineReschedule,
  acceptRelieverProposal,
  declineRelieverProposal,
} from "@/src/services/sessions";
import { useRole } from "@/src/providers/RoleProvider";
import { endContract } from "@/src/services/contracts";
import {
  fetchTherapistAvailability,
  fetchBookedIntervals,
  upsertTherapistAvailability,
  type TherapistAvailability,
  type TherapistAvailabilityDto,
} from "@/src/services/availability";
import { discretizeAvailabilityForWeek } from "@/src/features/scheduling/core/slotting";
import { buildConflictKeySet } from "@/src/features/scheduling/core/conflicts";
import {
  getDateForDowInWeek,
  getWeekRange,
} from "@/src/features/scheduling/core/weekRange";
import {
  fetchRecurringCommitments,
  type RecurringCommitment,
} from "@/src/services/contracts";
import useSessionRealtime from "@/src/hooks/useSessionRealtime";
import { getUserFacingSessionsErrorMessage } from "@/src/features/sessions/core/userFacingErrors";
import { useLocationTracking } from "@/src/hooks/useLocationTracking";
import { formatPeso } from "@/src/utils/money";
import {
  fetchMyColleagues,
  fetchMyTherapist,
  MY_COLLEAGUES_QUERY_KEY,
  type TherapistListItem,
  type TherapistColleague,
  type MyTherapist,
} from "@/src/services/therapists";
import { submitPatientRating } from "@/src/services/ratings";
import { getSyncedNow, syncServerTime } from "@/src/utils/serverTime";
import InAppModal from "@/src/components/InAppModal";
import CancellationReasonSelector, {
  getFinalReasonText,
  isReasonValid,
} from "@/src/components/CancellationReasonSelector";
import {
  getItem as ssGet,
  setItem as ssSet,
  deleteItem as ssDel,
} from "@/src/utils/safeSecureStore";
import { useDebugLog } from "@/src/providers/DebugLogProvider";
import EmbeddedLocationMap from "@/src/features/sessions/screens/session-view/EmbeddedLocationMap";
import {
  SLOT_DURATION_MINUTES,
  dowToDayLabel,
  toHHmm,
  hhmmTo12,
  formatDate,
  formatTime,
  formatTimeRange,
} from "@/src/features/sessions/screens/session-view/sessionViewHelpers";

export default function TherapistSessionView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { selectedRole } = useRole();
  const { addLog } = useDebugLog();
  const isCurrentUserPatient = selectedRole === "Patient";
  const isCurrentUserTherapist = selectedRole === "PhysicalTherapist";

  const params = useLocalSearchParams<{
    sessionId?: string;
    profileId?: string;
    therapistName?: string;
    patientName?: string;
    startAt?: string;
    endAt?: string;
    fromRelieverRequest?: string;
  }>();

  const sessionId = useMemo(() => {
    const n = Number(params.sessionId);
    return Number.isFinite(n) ? n : undefined;
  }, [params.sessionId]);

  // Check if navigated from reliever requests section
  const fromRelieverRequest = params.fromRelieverRequest === "true";

  // Sync server time on mount for accurate timer display
  useEffect(() => {
    syncServerTime().catch(() => {});
  }, []);

  // Realtime updates: auto-invalidate when the other party updates the session
  useSessionRealtime(sessionId);

  // Location tracking for therapist to share location with patient
  const { isSharing: isLocationSharing, toggleSharing: toggleLocationSharing } =
    useLocationTracking({
      sessionId: sessionId ?? 0,
      role: isCurrentUserTherapist ? "therapist" : "patient",
      onTrackingStarted: () => {
        console.log(
          "✅✅✅ [SessionView] Location sharing started - state should update",
        );
      },
      onTrackingStopped: () => {
        console.log("❌❌❌ [SessionView] Location sharing stopped");
      },
      onOwnLocationUpdate: (coords) => {
        console.log("📍📍📍 [SessionView] Own location update:", coords);
      },
    });

  // Debug: Log isLocationSharing state changes
  useEffect(() => {
    console.log(
      "🔄🔄🔄 [SessionView] isLocationSharing state changed to:",
      isLocationSharing,
    );
  }, [isLocationSharing]);

  const {
    data: detail,
    isLoading,
    isFetching,
    isError: isDetailError,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: sessionDetailQueryKey(sessionId ?? 0),
    queryFn: () => fetchSessionDetail(sessionId!),
    enabled: !!sessionId,
  });

  // Debug: Log detail object to verify reliever therapist data
  useEffect(() => {
    if (detail) {
      console.log(
        "[session-view.tsx] detail:",
        JSON.stringify(
          {
            relieverTherapistName: detail.relieverTherapistName,
            relieverTherapistId: detail.relieverTherapistId,
            isRelieverProposed: detail.isRelieverProposed,
            relieverTherapistSpecialty: detail.relieverTherapistSpecialty,
            status: detail.status,
          },
          null,
          2,
        ),
      );
    }
  }, [detail]);

  const {
    data: sessionLogs,
    isLoading: isLogsLoading,
    isFetching: isLogsFetching,
  } = useQuery({
    queryKey: sessionLogsQueryKey(sessionId ?? 0),
    queryFn: () => fetchSessionLogs(sessionId!),
    enabled: !!sessionId,
  });

  // Real-time updates: Listen for SessionCreated events to refresh schedule slots
  // This ensures when therapist creates a session with Patient A, then creates with Patient B,
  // the schedule selection modal for Patient B shows the slot as booked immediately
  useEffect(() => {
    if (!sessionId) return;

    let active = true;
    const setupConnection = async () => {
      try {
        const { default: signalrManager } =
          await import("@/src/services/signalrManager");
        const { getTokens } = await import("@/src/auth/session");
        const accessToken = getTokens().accessToken;

        if (!accessToken) return;

        await signalrManager.getSharedConnection("sessions", accessToken);

        if (!active) {
          signalrManager.releaseConnection("sessions");
          return;
        }

        // Listen for SessionCreated events to refresh schedule slots/availability
        const unsubscribe = signalrManager.subscribeToEvent(
          "sessions",
          "SessionCreated",
          (payload: any) => {
            if (!active) return;
            console.log(
              "[SessionView] SessionCreated event received:",
              payload,
            );

            // Invalidate and immediately refetch session detail to show updated slot availability
            queryClient
              .invalidateQueries({ queryKey: sessionDetailQueryKey(sessionId) })
              .catch(() => {});
            queryClient
              .refetchQueries({ queryKey: sessionDetailQueryKey(sessionId) })
              .catch(() => {});
          },
        );

        return () => {
          unsubscribe?.();
        };
      } catch (error) {
        console.warn("SessionView sessions hub connection failed", error);
      }
    };

    const cleanup = setupConnection();

    return () => {
      active = false;
      cleanup.then((cleanupFn) => cleanupFn?.()).catch(() => {});
      import("@/src/services/signalrManager")
        .then(({ default: signalrManager }) => {
          signalrManager.releaseConnection("sessions");
        })
        .catch(() => {});
    };
  }, [sessionId, queryClient]);

  const isBusy = isLoading || isFetching;

  const normalizeParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  // Prefer names from API response, fallback to URL params
  const therapistName =
    detail?.therapistName || normalizeParam(params.therapistName) || undefined;
  const patientName =
    detail?.patientName || normalizeParam(params.patientName) || undefined;
  const paramStartAt = normalizeParam(params.startAt);
  const paramEndAt = normalizeParam(params.endAt);
  const scheduleStartAt = detail?.startAt ?? paramStartAt;
  const scheduleEndAt = detail?.endAt ?? paramEndAt;

  // Derive a friendly status label and color for responsive badge
  const [timerStartMs, setTimerStartMs] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [relieverAcceptModalVisible, setRelieverAcceptModalVisible] =
    useState(false);

  // Check if session is done for today (used to stop timer immediately)
  const sessionStatus = (detail?.status || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const isSessionDoneForToday = sessionStatus === "donefortoday";
  const isSessionCancelled = sessionStatus.includes("cancel");

  // tick elapsed every second when running, using synced server time
  // Stop immediately if session is done for today or cancelled
  useEffect(() => {
    if (!timerStartMs || isSessionDoneForToday || isSessionCancelled) {
      if (isSessionDoneForToday || isSessionCancelled) {
        setElapsed(0);
      }
      return;
    }
    const id = setInterval(() => {
      setElapsed(
        Math.max(0, Math.floor((getSyncedNow() - timerStartMs) / 1000)),
      );
    }, 1000);
    // immediate set
    setElapsed(Math.max(0, Math.floor((getSyncedNow() - timerStartMs) / 1000)));
    return () => clearInterval(id);
  }, [timerStartMs, isSessionDoneForToday, isSessionCancelled]);

  const statusMeta = useMemo(() => {
    const rawContractStatus = (detail?.contractStatus || "")
      .toString()
      .trim()
      .toLowerCase();
    const rawSessionStatus = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase();

    // Check if contract is ended or session is cancelled/completed/terminated
    const isContractEnded = ["completed", "terminated"].includes(
      rawContractStatus,
    );
    const isSessionCancelled = rawSessionStatus.includes("cancel");
    const isSessionCompleted = rawSessionStatus === "completed";
    const isSessionTerminated = rawSessionStatus === "terminated";

    // Show Inactive if contract ended or session cancelled/completed/terminated
    if (
      isContractEnded ||
      isSessionCancelled ||
      isSessionCompleted ||
      isSessionTerminated
    ) {
      return {
        label: "Inactive",
        badge: "bg-gray-100 text-gray-700",
      };
    }

    if (rawSessionStatus === "donefortoday") {
      return { label: "Done for today", badge: "bg-gray-100 text-gray-800" };
    }

    if (rawSessionStatus === "pendingconfirmation") {
      return {
        label: "Pending Confirmation",
        badge: "bg-amber-100 text-amber-800",
      };
    }

    // Show "Pending Reschedule" when therapist has proposed a new schedule
    if (rawSessionStatus === "pendingrescheduleapproval") {
      return {
        label: "Pending Reschedule",
        badge: "bg-blue-100 text-blue-800",
      };
    }

    // Show "Pending Reliever" when waiting for reliever to accept
    if (
      rawSessionStatus === "pendingrelieveracceptance" ||
      rawSessionStatus === "pendingrelieveacceptance"
    ) {
      return {
        label: "Pending Reliever",
        badge: "bg-amber-100 text-amber-800",
      };
    }

    // Check if session has been rescheduled - show "Rescheduled" instead of "Active"
    if (detail?.isRescheduled && rawSessionStatus === "scheduled") {
      return { label: "Rescheduled", badge: "bg-amber-100 text-amber-800" };
    }

    // For scheduled or in-progress sessions, show as "Active"
    if (rawSessionStatus === "scheduled" || rawSessionStatus === "inprogress") {
      return { label: "Active", badge: "bg-emerald-100 text-emerald-800" };
    }

    // Default fallback
    return { label: "—", badge: "bg-gray-100 text-gray-700" };
  }, [detail?.contractStatus, detail?.status, detail?.isRescheduled]); // Show end-contract options for active sessions only
  const isEnded = useMemo(() => {
    const cs = (detail?.contractStatus || "").toString().trim().toLowerCase();
    const ss = (detail?.status || "").toString().trim().toLowerCase();
    const endedContract = [
      "completed",
      "terminated",
      "cancelled",
      "canceled",
      "expired",
    ].includes(cs);
    return endedContract;
  }, [detail?.contractStatus]);

  const isDoneForToday = useMemo(() => {
    const normalized = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    return normalized === "donefortoday";
  }, [detail?.status]);

  const isCancelled = useMemo(() => {
    const ss = (detail?.status || "").toString().trim().toLowerCase();
    return ss === "cancelled" || ss === "canceled";
  }, [detail?.status]);

  const isPendingCancellation = useMemo(() => {
    const ss = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    const result = ss === "pendingcancellation";
    console.log("[SessionView] isPendingCancellation check:", {
      status: detail?.status,
      normalized: ss,
      result,
    });
    return result;
  }, [detail?.status]);

  const isCancellationAcknowledged = useMemo(() => {
    const ss = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    return ss === "cancellationacknowledged";
  }, [detail?.status]);

  const isPendingRescheduleApproval = useMemo(() => {
    const ss = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    return ss === "pendingrescheduleapproval";
  }, [detail?.status]);

  // Check if session is pending reliever acceptance
  const isPendingRelieverAcceptance = useMemo(() => {
    const ss = (detail?.status || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    return (
      ss === "pendingrelieveacceptance" || ss === "pendingrelieveracceptance"
    );
  }, [detail?.status]);

  // Fetch current therapist's profile to compare with relieverTherapistId
  const { data: myTherapist } = useQuery<MyTherapist | null>({
    queryKey: ["therapist", "me"],
    queryFn: () => fetchMyTherapist(),
    enabled: isCurrentUserTherapist,
  });

  // Check if current user is the reliever therapist for this session (regardless of status)
  // This is true when:
  // 1. Current user is a therapist
  // 2. Session has a reliever assigned
  // 3. Current therapist ID matches the relieverTherapistId
  const isCurrentUserReliever = useMemo(() => {
    if (!isCurrentUserTherapist) return false;
    if (!detail?.relieverTherapistId || !myTherapist?.id) return false;
    return Number(detail.relieverTherapistId) === Number(myTherapist.id);
  }, [isCurrentUserTherapist, detail?.relieverTherapistId, myTherapist?.id]);

  // Determine if current user is the reliever therapist reviewing a pending proposal
  const isRelieverReviewingProposal = useMemo(() => {
    if (!isCurrentUserReliever) return false;
    if (!isPendingRelieverAcceptance) return false;
    return true;
  }, [isCurrentUserReliever, isPendingRelieverAcceptance]);

  // hydrate timer from secure store, but only when session is not ended/done/cancelled and not loading
  useEffect(() => {
    (async () => {
      if (!sessionId) return;
      // Avoid rehydrating while loading or for ended/done/cancelled sessions
      if (isBusy || isEnded || isDoneForToday || isCancelled) return;
      try {
        const raw = await ssGet(`sessionTimer:${sessionId}`);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj?.startAtMs && Number.isFinite(obj.startAtMs)) {
            setTimerStartMs(obj.startAtMs);
          }
        }
      } catch {}
    })();
  }, [sessionId, isBusy, isEnded, isDoneForToday, isCancelled]);

  // If the session is ended/marked done/cancelled, force clear any running timer and storage
  useEffect(() => {
    (async () => {
      if (!sessionId) return;
      if (isEnded || isDoneForToday || isCancelled) {
        setTimerStartMs(null);
        setElapsed(0);
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn(
            "Failed to clear session timer storage on status change:",
            e,
          );
        }
      }
    })();
  }, [sessionId, isEnded, isDoneForToday, isCancelled]);

  // Automatic timer: start when scheduled time is reached
  useEffect(() => {
    // Don't auto-start if already running, session ended, done, or cancelled
    if (timerStartMs || isEnded || isDoneForToday || isCancelled || isBusy)
      return;
    if (!scheduleStartAt || !sessionId) return;

    const scheduledStartTime = new Date(scheduleStartAt).getTime();
    if (!Number.isFinite(scheduledStartTime)) return;

    const now = Date.now();

    // If scheduled time has passed, start the timer immediately
    if (now >= scheduledStartTime) {
      // Use the scheduled start time as the timer start, not current time
      setTimerStartMs(scheduledStartTime);
      (async () => {
        try {
          await ssSet(
            `sessionTimer:${sessionId}`,
            JSON.stringify({ startAtMs: scheduledStartTime }),
          );
        } catch {}
        // Call the start session API
        try {
          await startSessionApi(sessionId);
        } catch (e) {
          console.warn("Auto-start session API call failed:", e);
        }
      })();
      return;
    }

    // If scheduled time is in the future, set a timeout to start when it arrives
    const delay = scheduledStartTime - now;
    // Only set timeout if the delay is reasonable (within 24 hours)
    if (delay > 0 && delay <= 24 * 60 * 60 * 1000) {
      const timeoutId = setTimeout(() => {
        setTimerStartMs(scheduledStartTime);
        (async () => {
          try {
            await ssSet(
              `sessionTimer:${sessionId}`,
              JSON.stringify({ startAtMs: scheduledStartTime }),
            );
          } catch {}
          try {
            await startSessionApi(sessionId);
          } catch (e) {
            console.warn("Auto-start session API call failed:", e);
          }
        })();
      }, delay);
      return () => clearTimeout(timeoutId);
    }
  }, [
    scheduleStartAt,
    sessionId,
    timerStartMs,
    isEnded,
    isDoneForToday,
    isCancelled,
    isBusy,
  ]);

  const [showEndOptions, setShowEndOptions] = useState(false);
  // End Session confirmation modal state
  const [endSessionModalVisible, setEndSessionModalVisible] = useState(false);
  const [endSessionType, setEndSessionType] = useState<
    "Completed" | "Terminated" | null
  >(null);
  const [endSessionConfirmText, setEndSessionConfirmText] = useState("");
  const [endSessionReason, setEndSessionReason] = useState("");
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedCancelReasonId, setSelectedCancelReasonId] = useState<
    string | null
  >(null);
  const [cancelOnlyModalVisible, setCancelOnlyModalVisible] = useState(false);
  const [cancelOnlyReason, setCancelOnlyReason] = useState("");
  const [selectedCancelOnlyReasonId, setSelectedCancelOnlyReasonId] = useState<
    string | null
  >(null);
  const [selectedRescheduleStartAt, setSelectedRescheduleStartAt] = useState<
    string | null
  >(null);
  const [selectedRescheduleEndAt, setSelectedRescheduleEndAt] = useState<
    string | null
  >(null);
  const [isPickingRescheduleForCancel, setIsPickingRescheduleForCancel] =
    useState(false);
  const [
    isPickingRescheduleForAcknowledge,
    setIsPickingRescheduleForAcknowledge,
  ] = useState(false);
  const [showRescheduleError, setShowRescheduleError] = useState(false);
  const [showOngoingRescheduleWarning, setShowOngoingRescheduleWarning] =
    useState(false);

  // Reliever Therapist state
  const [enableReliever, setEnableReliever] = useState(false);
  const [selectedRelieverId, setSelectedRelieverId] = useState<number | null>(
    null,
  );
  const [relieverSubstitutionReason, setRelieverSubstitutionReason] =
    useState("");
  const [relieverSearchQuery, setRelieverSearchQuery] = useState("");
  const [showAllRelievers, setShowAllRelievers] = useState(false);

  // Check if there's an ongoing reschedule that blocks new reschedule actions
  const hasOngoingReschedule =
    isPendingCancellation || isPendingRescheduleApproval;

  // Rating state
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [hasRated, setHasRated] = useState(false);

  // Contract status helpers for rating display
  const contractStatusNormalized = (detail?.contractStatus || "")
    .toString()
    .trim()
    .toLowerCase();
  const isContractCompleted = contractStatusNormalized === "completed";
  const isContractTerminated = contractStatusNormalized === "terminated";
  // Only show Rate Contract button for patients (not therapists)
  const showRateButton =
    isCurrentUserPatient &&
    (isContractCompleted || isContractTerminated) &&
    !hasRated;

  // Sync hasRated from backend data when session detail loads
  useEffect(() => {
    if (detail) {
      // Patient view - check if patient has rated the therapist
      setHasRated(detail.hasBeenRatedByPatient ?? false);
    }
  }, [detail]);

  const endMutation = useMutation({
    mutationFn: async ({
      status,
      reason,
    }: {
      status: "Completed" | "Terminated";
      reason?: string;
    }) => {
      const contractId = detail?.contractId;
      if (!contractId) throw new Error("Missing contract identifier");
      await endContract(contractId, { Status: status, Reason: reason });
    },
    onSuccess: async (_, { status }) => {
      // Optimistically update list caches
      const updater = (data: any) => {
        if (!Array.isArray(data)) return data;
        return data.map((s: any) =>
          s.contractId === detail?.contractId
            ? { ...s, status, contractStatus: status }
            : s,
        );
      };
      queryClient.setQueryData(upcomingSessionsQueryKey, updater);
      queryClient.setQueryData(allSessionsQueryKey, updater);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      // Clear any running timer locally and in storage
      if (sessionId) ssDel && ssDel(`sessionTimer:${sessionId}`);
      setTimerStartMs(null);
      setElapsed(0);
      setShowEndOptions(false);
      Alert.alert(
        "Contract updated",
        `The contract has been marked as ${status}.`,
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't end the contract. Please try again.";
      Alert.alert("Unable to end contract", message);
    },
  });

  // Rating mutation - for therapists to rate patients after contract ends
  const ratingMutation = useMutation({
    mutationFn: async () => {
      if (!detail?.patientId) throw new Error("Missing patient information");
      if (!sessionId) throw new Error("Missing session identifier");
      if (ratingScore == null)
        throw new Error("Please select a score before submitting.");
      await submitPatientRating({
        PatientId: detail.patientId,
        SessionId: sessionId,
        Score: ratingScore,
        Comment: ratingComment?.trim() || null,
      });
    },
    onSuccess: async () => {
      setRatingModalVisible(false);
      setHasRated(true);
      setRatingScore(null);
      setRatingComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      Alert.alert("Thank you!", "Your rating has been submitted.");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't submit your rating. Please try again.";
      Alert.alert("Unable to submit rating", message);
    },
  });

  // Patient cancellation request mutation - puts session in PendingCancellation status
  const requestCancellationMutation = useMutation({
    mutationFn: async (params: { reason: string }) => {
      console.log(
        "[requestCancellationMutation] mutationFn called with:",
        params,
      );
      console.log("[requestCancellationMutation] sessionId:", sessionId);
      if (!sessionId) throw new Error("Missing session identifier");
      await requestCancellation(sessionId, params.reason);
    },
    onSuccess: async () => {
      console.log("[requestCancellationMutation] onSuccess called");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      setCancelModalVisible(false);
      setCancelReason("");
      Alert.alert(
        "Reschedule Request Submitted",
        "Your reschedule request has been submitted and is pending therapist review. You will be notified once a new schedule is proposed.",
      );
    },
    onError: (error: any) => {
      console.log("[requestCancellationMutation] onError called:", error);
      console.log(
        "[requestCancellationMutation] error.response:",
        error?.response,
      );
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't submit the reschedule request. Please try again.";
      Alert.alert("Unable to request reschedule", message);
    },
  });

  // Therapist acknowledge cancellation mutation
  const acknowledgeCancellationMutation = useMutation({
    mutationFn: async (params: {
      rescheduleStartAt?: string | null;
      rescheduleEndAt?: string | null;
    }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await acknowledgeCancellation(
        sessionId,
        params.rescheduleStartAt ?? null,
        params.rescheduleEndAt ?? null,
      );
      // Return params to use in onSuccess
      return params;
    },
    onSuccess: async (params) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      // Clear any running timer locally and in storage
      if (sessionId) {
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn(
            "Failed to clear session timer storage on acknowledge:",
            e,
          );
        }
      }
      setTimerStartMs(null);
      setElapsed(0);
      setIsPickingRescheduleForAcknowledge(false);

      // Different messages depending on action taken
      if (params.rescheduleStartAt && params.rescheduleEndAt) {
        Alert.alert(
          "Reschedule Proposal Sent",
          "Your reschedule proposal has been sent to the patient. They will be notified to approve or decline the new schedule.",
        );
      } else {
        Alert.alert(
          "Session Discontinued",
          "The session has been discontinued as requested.",
        );
      }
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't process the request. Please try again.";
      Alert.alert("Unable to process", message);
    },
  });

  // Direct cancel (no reschedule proposal) - available to both roles
  const cancelOnlyMutation = useMutation({
    mutationFn: async (params: { reason: string }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await cancelSession(sessionId, params.reason);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      setCancelOnlyModalVisible(false);
      setCancelOnlyReason("");
      setSelectedCancelOnlyReasonId(null);
      // Clear any running timer locally and in storage
      if (sessionId) {
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn(
            "Failed to clear session timer storage on cancel-only:",
            e,
          );
        }
      }
      setTimerStartMs(null);
      setElapsed(0);
      Alert.alert(
        "Session cancelled",
        "This session has been cancelled successfully.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't cancel the session. Please try again.";
      Alert.alert("Unable to cancel session", message);
    },
  });

  // Therapist direct cancel mutation (for therapist-initiated cancellations)
  const cancelMutation = useMutation({
    mutationFn: async (params: {
      reason: string;
      rescheduleStartAt?: string | null;
      rescheduleEndAt?: string | null;
      relieverTherapistId?: number | null;
      relieverSubstitutionReason?: string | null;
    }) => {
      if (!sessionId) throw new Error("Missing session identifier");

      const startDate = params.rescheduleStartAt
        ? new Date(params.rescheduleStartAt)
        : null;
      const endDate = params.rescheduleEndAt
        ? new Date(params.rescheduleEndAt)
        : null;

      const result = await cancelSession(
        sessionId,
        params.reason,
        startDate,
        endDate,
        params.relieverTherapistId ?? null,
        params.relieverSubstitutionReason ?? null,
      );
      return result;
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      setCancelModalVisible(false);
      setCancelReason("");
      // Clear any running timer locally and in storage
      if (sessionId) {
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn("Failed to clear session timer storage on cancel:", e);
        }
      }
      setTimerStartMs(null);
      setElapsed(0);

      // Show different message based on whether a reschedule was proposed
      if (selectedRescheduleStartAt) {
        const dateStr = formatDate(selectedRescheduleStartAt);
        const timeStr = formatTime(selectedRescheduleStartAt);

        const relieverInfo = variables.relieverTherapistId
          ? " with a reliever therapist"
          : "";

        addLog({
          level: "success",
          category: "Session",
          message: `Reschedule proposal sent for ${dateStr} at ${timeStr}${relieverInfo}`,
          sessionId,
        });

        Alert.alert(
          "Reschedule Proposal Sent",
          `Your reschedule proposal${relieverInfo} for ${dateStr} at ${timeStr} has been sent to the patient. They will need to approve or decline the new schedule.`,
        );
      } else {
        addLog({
          level: "info",
          category: "Session",
          message: "Session cancelled",
          sessionId,
        });

        Alert.alert(
          "Session Cancelled",
          "This session has been cancelled successfully.",
        );
      }
      // Clear the reschedule dates and reliever state after showing the alert
      setSelectedRescheduleStartAt(null);
      setSelectedRescheduleEndAt(null);
      setEnableReliever(false);
      setSelectedRelieverId(null);
      setRelieverSubstitutionReason("");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't cancel the session. Please try again.";
      Alert.alert("Unable to cancel session", message);
    },
  });

  // Approve reschedule mutation - for patients to approve therapist's reschedule proposal
  const approveRescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session identifier");
      return approveReschedule(sessionId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      Alert.alert(
        "Reschedule Approved",
        "You have accepted the new schedule. The session has been rescheduled successfully.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't approve the reschedule. Please try again.";
      Alert.alert("Unable to approve reschedule", message);
    },
  });

  // Decline reschedule mutation - for patients to decline therapist's reschedule proposal
  const declineRescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session identifier");
      return declineReschedule(sessionId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      Alert.alert(
        "Reschedule Declined",
        "You have declined the reschedule proposal. The session will remain on the original schedule.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't decline the reschedule. Please try again.";
      Alert.alert("Unable to decline reschedule", message);
    },
  });

  // Accept reliever proposal mutation - for reliever therapist to accept the proposal
  const acceptRelieverMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session identifier");
      return acceptRelieverProposal(sessionId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      Alert.alert(
        "Proposal Accepted",
        "You have accepted this reliever request. The patient will be notified about the reschedule.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't accept the proposal. Please try again.";
      Alert.alert("Unable to accept proposal", message);
    },
  });

  // Decline reliever proposal mutation - for reliever therapist to decline the proposal
  const declineRelieverMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session identifier");
      return declineRelieverProposal(sessionId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["reliever-proposals"] }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      Alert.alert(
        "Proposal Declined",
        "You have declined this reliever request. The original therapist will be notified.",
      );
      router.back();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't decline the proposal. Please try again.";
      Alert.alert("Unable to decline proposal", message);
    },
  });

  // Reschedule state
  const [reschedulePickerVisible, setReschedulePickerVisible] = useState(false);
  const [reschedulePickerDay, setReschedulePickerDay] = useState<number | null>(
    null,
  );
  const [reschedulePickerWeek, setReschedulePickerWeek] = useState<0 | 1>(0); // 0 = this week, 1 = next week
  // Store the selected day's target date to avoid recalculating
  const [selectedDayTargetDate, setSelectedDayTargetDate] =
    useState<Date | null>(null);
  const [pendingRescheduleSlot, setPendingRescheduleSlot] = useState<{
    dayDow: number;
    start: string;
    end: string;
    label: string;
    targetDate: Date; // The actual calendar date for this slot
  } | null>(null);
  const [confirmRescheduleModal, setConfirmRescheduleModal] = useState<{
    dayLabel: string;
    label: string;
  } | null>(null);

  const openReschedulePicker = useCallback((maybeForCancel?: any) => {
    // Handler may be called directly or as an onPress event. Accept boolean or event.
    const forCancel =
      typeof maybeForCancel === "boolean" ? maybeForCancel : false;
    setConfirmRescheduleModal(null);
    setPendingRescheduleSlot(null);
    setReschedulePickerDay(null);
    setSelectedDayTargetDate(null);
    setReschedulePickerWeek(0);
    setIsPickingRescheduleForCancel(forCancel);
    setReschedulePickerVisible(true);
  }, []);

  const closeReschedulePicker = useCallback(() => {
    setReschedulePickerVisible(false);
    setReschedulePickerDay(null);
    setSelectedDayTargetDate(null);
    setReschedulePickerWeek(0);
    setConfirmRescheduleModal(null);
    setPendingRescheduleSlot(null);
    // Reset quick add state
    setShowQuickAddSlot(false);
    setQuickAddStartTime("");
    setQuickAddEndTime("");
    setQuickAddSelectedDays({});
    setIsAddingSlot(false);
  }, []);

  // Quick Add Slot state for inline availability creation
  const [showQuickAddSlot, setShowQuickAddSlot] = useState(false);
  const [quickAddStartTime, setQuickAddStartTime] = useState("");
  const [quickAddEndTime, setQuickAddEndTime] = useState("");
  const [quickAddSelectedDays, setQuickAddSelectedDays] = useState<
    Record<string, boolean>
  >({});
  const [isAddingSlot, setIsAddingSlot] = useState(false);

  const DAY_LABELS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const dayLabelToDow: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  // Fetch therapist availability for rescheduling
  const therapistId = detail?.physicalTherapistId;

  const { data: availabilityBlocks, isLoading: isAvailabilityLoading } =
    useQuery<TherapistAvailability[]>({
      queryKey: ["availability", therapistId || ""],
      queryFn: () => fetchTherapistAvailability(therapistId as number),
      enabled: !!therapistId && reschedulePickerVisible,
    });

  // Quick Add Slot handler - after availabilityBlocks is defined
  const handleQuickAddSlot = useCallback(async () => {
    if (!therapistId) return;

    const selectedDaysList = DAY_LABELS.filter(
      (day) => quickAddSelectedDays[day],
    );
    if (selectedDaysList.length === 0) {
      Alert.alert("Select Days", "Please select at least one day.");
      return;
    }
    if (!quickAddStartTime || !quickAddEndTime) {
      Alert.alert(
        "Enter Times",
        "Please enter start and end times (e.g., 09:00).",
      );
      return;
    }

    // Parse times
    const parseTime = (t: string) => {
      const parts = t.split(":");
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };

    const startMinutes = parseTime(quickAddStartTime);
    const endMinutes = parseTime(quickAddEndTime);
    if (startMinutes === null || endMinutes === null) {
      Alert.alert("Invalid Time", "Please use HH:MM format (e.g., 09:00).");
      return;
    }
    if (endMinutes <= startMinutes) {
      Alert.alert("Invalid Time", "End time must be after start time.");
      return;
    }

    setIsAddingSlot(true);
    try {
      const now = new Date();
      const todayIdx = now.getDay(); // 0=Sunday..6=Saturday
      // Days since Monday: Sunday(0) -> 6, Monday(1) -> 0, etc. (matches schedule.tsx)
      const daysSinceMonday = todayIdx === 0 ? 6 : todayIdx - 1;

      // Calculate start of target week (Monday-starting week to match schedule page)
      const startOfTargetWeek = new Date(now);
      if (reschedulePickerWeek === 0) {
        // This week: go back to this Monday
        startOfTargetWeek.setDate(now.getDate() - daysSinceMonday);
      } else {
        // Next week: go to next Monday
        startOfTargetWeek.setDate(now.getDate() - daysSinceMonday + 7);
      }
      startOfTargetWeek.setHours(0, 0, 0, 0);

      const toHHmmss = (t: string) => {
        if (t.length === 5) return t + ":00";
        return t;
      };

      const newPayload: TherapistAvailabilityDto[] = selectedDaysList.map(
        (day) => {
          const dow = dayLabelToDow[day]; // 0=Sunday..6=Saturday
          // Convert from JS day (0=Sunday..6=Saturday) to Monday-starting offset (Monday=0..Sunday=6)
          const offsetFromMonday = dow === 0 ? 6 : dow - 1;
          let targetDate = new Date(startOfTargetWeek);
          targetDate.setDate(startOfTargetWeek.getDate() + offsetFromMonday);

          // If the target date is in the past, move to next week
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (targetDate < today) {
            targetDate.setDate(targetDate.getDate() + 7);
          }

          return {
            dayOfWeek: dow,
            startTime: toHHmmss(quickAddStartTime),
            endTime: toHHmmss(quickAddEndTime),
            isAvailable: true,
            specificDate: targetDate.toISOString().split("T")[0],
          };
        },
      );

      // Get existing availability
      const existingPayload = (availabilityBlocks || []).map((b) => {
        const numDow = typeof b.dayOfWeek === "number" ? b.dayOfWeek : 0;
        return {
          dayOfWeek: numDow,
          startTime: toHHmmss(b.startTime),
          endTime: toHHmmss(b.endTime),
          isAvailable: b.isAvailable,
          specificDate: (b as any).specificDate?.split?.("T")?.[0] ?? undefined,
          notes: b.notes ?? undefined,
        };
      });

      await upsertTherapistAvailability(therapistId, [
        ...existingPayload,
        ...newPayload,
      ]);
      await queryClient.invalidateQueries({
        queryKey: ["availability", therapistId],
      });

      // Reset form
      setShowQuickAddSlot(false);
      setQuickAddStartTime("");
      setQuickAddEndTime("");
      setQuickAddSelectedDays({});
      Alert.alert(
        "Success",
        "Availability added! You can now select a time slot.",
      );
    } catch (err) {
      console.error("Failed to add availability:", err);
      Alert.alert("Error", "Failed to add availability. Please try again.");
    } finally {
      setIsAddingSlot(false);
    }
  }, [
    therapistId,
    quickAddSelectedDays,
    quickAddStartTime,
    quickAddEndTime,
    reschedulePickerWeek,
    availabilityBlocks,
    queryClient,
    DAY_LABELS,
    dayLabelToDow,
  ]);

  const { data: bookedIntervals } = useQuery({
    queryKey: ["booked-intervals", therapistId || "", reschedulePickerWeek],
    queryFn: () => {
      const now = new Date();
      const { start, end } = getWeekRange(now, reschedulePickerWeek);
      const from = start.toISOString();
      const to = end.toISOString();
      return fetchBookedIntervals(therapistId!, from, to);
    },
    enabled: !!therapistId && reschedulePickerVisible,
  });

  const { data: recurringCommitments, isLoading: isRecurringLoading } =
    useQuery<RecurringCommitment[]>({
      queryKey: [
        "contracts",
        "recurring",
        therapistId || "",
        detail?.contractId ?? "none",
      ],
      queryFn: () =>
        fetchRecurringCommitments(
          therapistId as number,
          detail?.contractId
            ? { excludeContractId: detail.contractId }
            : undefined,
        ),
      enabled: !!therapistId && reschedulePickerVisible,
    });

  // Fetch therapist's trusted colleagues for reliever selection
  const { data: trustedColleagues } = useQuery<TherapistColleague[]>({
    queryKey: MY_COLLEAGUES_QUERY_KEY,
    queryFn: fetchMyColleagues,
    enabled: cancelModalVisible && enableReliever && isCurrentUserTherapist,
  });

  // Only show colleagues from the therapist's trusted network
  const availableTherapists = useMemo(() => {
    if (!trustedColleagues || trustedColleagues.length === 0) return [];

    // Convert colleagues to the TherapistListItem format for consistency
    // and sort by rating (highest first)
    return [...trustedColleagues]
      .map(
        (colleague) =>
          ({
            id: colleague.id,
            name: colleague.name,
            specializations: colleague.specializations,
            averageRating: colleague.averageRating,
            ratingCount: colleague.ratingCount,
          }) as TherapistListItem,
      )
      .sort((a, b) => {
        const aRating = a.averageRating || 0;
        const bRating = b.averageRating || 0;
        return bRating - aRating;
      });
  }, [trustedColleagues]);

  // Discretize availability into 1-hour slots
  // Only include specific-date blocks within this week
  // Store the actual date from the block to avoid recalculation issues
  const discretizedAvailability = useMemo(() => {
    return discretizeAvailabilityForWeek({
      availabilityBlocks: availabilityBlocks ?? [],
      now: new Date(),
      weekOffset: 0,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
    });
  }, [availabilityBlocks]);

  const dayOptions = useMemo(() => {
    const now = new Date();
    const { start: weekStartMonday } = getWeekRange(now, 0);

    return Object.entries(discretizedAvailability)
      .reduce<
        {
          dow: number;
          label: string;
          slots: { start: string; end: string }[];
          dateLabel?: string;
          targetDate: Date;
        }[]
      >((acc, [dowStr, slots]) => {
        const dow = Number(dowStr);
        const dayName = dowToDayLabel(dow);
        if (!dayName || slots.length === 0) return acc;

        const targetDate = getDateForDowInWeek(weekStartMonday, dow);
        if (!targetDate) return acc;
        targetDate.setHours(0, 0, 0, 0);

        const dateLabel = targetDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        const label = `${dayName} (${dateLabel})`;
        acc.push({ dow, label, slots, dateLabel, targetDate });
        return acc;
      }, [])
      .sort((a, b) => {
        const orderA = a.dow === 0 ? 7 : a.dow;
        const orderB = b.dow === 0 ? 7 : b.dow;
        return orderA - orderB;
      });
  }, [discretizedAvailability, dowToDayLabel]);

  const nextWeekDayOptions = useMemo(() => {
    const now = new Date();
    const { start: weekStartMonday } = getWeekRange(now, 1);
    const nextWeekDiscretizedAvailability = discretizeAvailabilityForWeek({
      availabilityBlocks: availabilityBlocks ?? [],
      now,
      weekOffset: 1,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
    });

    return Object.entries(nextWeekDiscretizedAvailability)
      .map(([dowStr, slots]) => {
        const dow = Number(dowStr);
        const dayName = dowToDayLabel(dow);
        if (!dayName || slots.length === 0) return null;

        const targetDate = getDateForDowInWeek(weekStartMonday, dow);
        if (!targetDate) return null;
        targetDate.setHours(0, 0, 0, 0);

        const dateLabel = targetDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        return {
          dow,
          label: `${dayName} (${dateLabel})`,
          slots,
          dateLabel,
          targetDate,
        } as {
          dow: number;
          label: string;
          slots: { start: string; end: string }[];
          dateLabel: string;
          targetDate: Date;
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const orderA = a.dow === 0 ? 7 : a.dow;
        const orderB = b.dow === 0 ? 7 : b.dow;
        return orderA - orderB;
      }) as {
      dow: number;
      label: string;
      slots: { start: string; end: string }[];
      dateLabel: string;
      targetDate: Date;
    }[];
  }, [availabilityBlocks, dowToDayLabel]);

  const selectedRescheduleDayOptions =
    reschedulePickerWeek === 0 ? dayOptions : nextWeekDayOptions;

  const conflictKeySet = useMemo(() => {
    return buildConflictKeySet({
      recurringCommitments,
      bookedIntervals,
    });
  }, [recurringCommitments, bookedIntervals]);

  // Compute original session slot key to disable it
  const originalSessionSlotKey = useMemo(() => {
    if (!detail?.startAt) return null;
    const startDate = new Date(detail.startAt);
    if (isNaN(startDate.getTime())) return null;
    const dow = startDate.getDay();
    const hours = startDate.getHours();
    const minutes = startDate.getMinutes();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad(hours)}:${pad(minutes)}`;
    return `${dow}-${start}`;
  }, [detail?.startAt]);

  const rescheduleSelectedDayLabel =
    reschedulePickerDay != null ? dowToDayLabel(reschedulePickerDay) : null;

  // Get slots from dayOptions/nextWeekDayOptions (which have clean slots without blockDate)
  const rescheduleCurrentDaySlots =
    reschedulePickerDay != null
      ? reschedulePickerWeek === 0
        ? (dayOptions.find((d) => d.dow === reschedulePickerDay)?.slots ?? [])
        : (nextWeekDayOptions.find((d) => d.dow === reschedulePickerDay)
            ?.slots ?? [])
      : [];
  const isSlotDataLoading = isAvailabilityLoading || isRecurringLoading;

  const rescheduleMutation = useMutation({
    mutationFn: async (params: { newStartAt: string; newEndAt: string }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      const result = await rescheduleSession(sessionId, {
        NewStartAt: params.newStartAt,
        NewEndAt: params.newEndAt,
      });
      return result;
    },
    onSuccess: async (data) => {
      // Backend updates the existing session, not creating a new one
      const updatedSessionId = data?.sessionId ?? sessionId;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        queryClient.invalidateQueries({
          queryKey: ["booked-intervals", therapistId || ""],
        }),
        updatedSessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(updatedSessionId),
            })
          : Promise.resolve(),
      ]);
      closeReschedulePicker();

      // Refresh the current session to show updated schedule
      Alert.alert(
        "Session Rescheduled",
        "The session has been rescheduled successfully. The patient has been notified of the new schedule.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't reschedule the session. Please try again.";
      Alert.alert("Unable to reschedule session", message);
    },
  });

  const markAsDoneMutation = useMutation({
    mutationFn: async ({
      startTime,
      endTime,
    }: {
      startTime: number;
      endTime: number;
    }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await markAsDone(sessionId);
      return { startTime, endTime };
    },
    onSuccess: async ({ startTime, endTime }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      // clear timer storage
      if (sessionId) {
        const startTimeISO = new Date(startTime).toISOString();
        const endTimeISO = new Date(endTime).toISOString();
        await logTodaySession(sessionId, startTimeISO, endTimeISO);
        // Refresh logs list after posting today's log
        await queryClient.invalidateQueries({
          queryKey: sessionLogsQueryKey(sessionId),
        });
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn(
            "Failed to clear session timer storage on markAsDone:",
            e,
          );
        }
      }
      setTimerStartMs(null);
      setElapsed(0);
      Alert.alert(
        "Session Logged",
        "The session has been marked as 'Done for Today'.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't mark the session as done. Please try again.";
      Alert.alert("Unable to Log Session", message);
    },
  });

  // Log-only mutation: creates a session log without changing status
  // Used when session is already marked as DoneForToday by the backend
  const logOnlyMutation = useMutation({
    mutationFn: async ({
      startTime,
      endTime,
    }: {
      startTime: number;
      endTime: number;
    }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      const startTimeISO = new Date(startTime).toISOString();
      const endTimeISO = new Date(endTime).toISOString();
      await logTodaySession(sessionId, startTimeISO, endTimeISO);
      return { startTime, endTime };
    },
    onSuccess: async () => {
      // Refresh logs list after posting today's log
      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: sessionLogsQueryKey(sessionId),
        });
      }
      Alert.alert(
        "Session Logged",
        "Today's session has been logged successfully.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't log the session. Please try again.";
      Alert.alert("Unable to Log Session", message);
    },
  });

  const startMutation = useMutation({
    mutationFn: async (): Promise<{ startAtMs: number }> => {
      if (!sessionId) throw new Error("Missing session identifier");
      const response = await startSessionApi(sessionId);
      // API now returns { startAtMs } for timer synchronization
      const startAtMs = response?.data?.startAtMs;
      return {
        startAtMs: Number.isFinite(startAtMs) ? startAtMs : getSyncedNow(),
      };
    },
    onSuccess: async (data) => {
      // Update timer with the server-provided startAtMs for synchronization
      const { startAtMs } = data;
      setTimerStartMs(startAtMs);
      setElapsed(Math.max(0, Math.floor((getSyncedNow() - startAtMs) / 1000)));
      if (sessionId) {
        try {
          await ssSet(
            `sessionTimer:${sessionId}`,
            JSON.stringify({ startAtMs }),
          );
        } catch (e) {
          console.warn("Failed to persist synced timer:", e);
        }
      }
    },
    onError: async (error: any) => {
      // If the API call fails, stop the timer and show an alert
      setTimerStartMs(null);
      setElapsed(0);
      if (sessionId) {
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch (e) {
          console.warn(
            "Failed to clear session timer storage on start error:",
            e,
          );
        }
      }

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't start the session. Please try again.";
      Alert.alert("Unable to start session", message);
    },
  });

  const startSession = useCallback(async () => {
    if (!sessionId) return;
    // Set an optimistic timer using scheduled start time or synced now,
    // will be corrected by onSuccess with server response
    const optimisticStart = scheduleStartAt
      ? Math.min(new Date(scheduleStartAt).getTime(), getSyncedNow())
      : getSyncedNow();
    setTimerStartMs(optimisticStart);
    try {
      await ssSet(
        `sessionTimer:${sessionId}`,
        JSON.stringify({ startAtMs: optimisticStart }),
      );
    } catch {}
    startMutation.mutate();
  }, [sessionId, scheduleStartAt, startMutation]);

  const quickMarkDone = useCallback(async () => {
    if (markAsDoneMutation.isPending || !sessionId) return;

    // Use scheduled times for quick completion
    const startTime = scheduleStartAt
      ? new Date(scheduleStartAt).getTime()
      : Date.now();
    const endTime = Date.now();

    markAsDoneMutation.mutate({ startTime, endTime });
  }, [markAsDoneMutation, sessionId, scheduleStartAt]);

  const onEndSessionPress = useCallback(async () => {
    if (markAsDoneMutation.isPending || !timerStartMs) return;

    const startTime = timerStartMs;
    const endTime = Date.now();
    // Stop timer immediately in UI and clear persisted state to avoid auto-rehydration on navigation
    setTimerStartMs(null);
    setElapsed(0);
    if (sessionId) {
      try {
        if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
      } catch {}
    }
    markAsDoneMutation.mutate({ startTime, endTime });
  }, [markAsDoneMutation, sessionId, timerStartMs]);

  // Log session only (no status change) - for when session is already DoneForToday
  const logSessionOnly = useCallback(async () => {
    if (logOnlyMutation.isPending || !sessionId) return;

    // Use scheduled times for logging
    const startTime = scheduleStartAt
      ? new Date(scheduleStartAt).getTime()
      : Date.now();
    const endTime = scheduleEndAt
      ? new Date(scheduleEndAt).getTime()
      : Date.now();

    logOnlyMutation.mutate({ startTime, endTime });
  }, [logOnlyMutation, sessionId, scheduleStartAt, scheduleEndAt]);

  // Check for overdue sessions and long-running timers
  const [hasShownOverdueWarning, setHasShownOverdueWarning] = useState(false);

  useEffect(() => {
    if (!detail || !scheduleEndAt || hasShownOverdueWarning) return;
    if (isDoneForToday || isCancelled || isEnded) return;

    const now = Date.now();
    const endTime = new Date(scheduleEndAt).getTime();
    const twelveHoursMs = 12 * 60 * 60 * 1000;

    // Check if session end time was more than 12 hours ago
    const isOverdue = now - endTime > twelveHoursMs;

    // Check if timer has been running for more than 12 hours
    const timerRunningTooLong =
      timerStartMs && now - timerStartMs > twelveHoursMs;

    if (isOverdue || timerRunningTooLong) {
      setHasShownOverdueWarning(true);
      const message = timerRunningTooLong
        ? "The session timer has been running for over 12 hours. Please mark this session as 'Done for Today' or stop the timer."
        : "This session ended more than 12 hours ago and hasn't been marked as complete. Please mark it as 'Done for Today'.";

      Alert.alert("Session Needs Attention", message, [
        {
          text: "Mark Done Now",
          onPress: () => {
            if (timerStartMs) {
              onEndSessionPress();
            } else {
              quickMarkDone();
            }
          },
        },
        {
          text: "Remind Me Later",
          style: "cancel",
        },
      ]);
    }
  }, [
    detail,
    scheduleEndAt,
    isDoneForToday,
    isCancelled,
    isEnded,
    timerStartMs,
    hasShownOverdueWarning,
    onEndSessionPress,
    quickMarkDone,
  ]);

  // Auto-complete session when timer reaches 1 hour (60 minutes)
  const [hasAutoCompleted, setHasAutoCompleted] = useState(false);
  const ONE_HOUR_SECONDS = 60 * 60; // 3600 seconds

  useEffect(() => {
    // Only auto-complete if:
    // - Timer is running
    // - Elapsed time >= 1 hour
    // - Session is not already done/cancelled/ended
    // - We haven't already triggered auto-complete
    if (
      !timerStartMs ||
      elapsed < ONE_HOUR_SECONDS ||
      isDoneForToday ||
      isCancelled ||
      isEnded ||
      hasAutoCompleted ||
      markAsDoneMutation.isPending
    ) {
      return;
    }

    setHasAutoCompleted(true);

    // Use the timer start time and exactly 1 hour later for the log
    const startTime = timerStartMs;
    const endTime = timerStartMs + ONE_HOUR_SECONDS * 1000;

    // Clear timer state immediately
    setTimerStartMs(null);
    setElapsed(0);
    if (sessionId) {
      (async () => {
        try {
          if (ssDel) await ssDel(`sessionTimer:${sessionId}`);
        } catch {}
      })();
    }

    // Mark as done
    markAsDoneMutation.mutate({ startTime, endTime });

    // Show notification after marking as done
    Alert.alert(
      "Session Complete",
      "The session has reached 1 hour and has been automatically marked as done for today.",
      [{ text: "OK" }],
      { cancelable: false },
    );
  }, [
    elapsed,
    timerStartMs,
    isDoneForToday,
    isCancelled,
    isEnded,
    hasAutoCompleted,
    markAsDoneMutation,
    sessionId,
  ]);

  if (!sessionId) {
    return (
      <SafeAreaView
        className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-white"}`}
      >
        {isDesktop ? (
          <WebHeader />
        ) : (
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-8 h-8 items-center justify-center"
            >
              <ArrowLeft color="#111" size={24} />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">Session</Text>
            <View className="w-8" />
          </View>
        )}

        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base font-semibold text-gray-900 text-center mb-2">
            Session not found
          </Text>
          <Text className="text-sm text-gray-600 text-center">
            We could not open this session.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isDetailError) {
    return (
      <SafeAreaView
        className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-white"}`}
      >
        {isDesktop ? (
          <WebHeader />
        ) : (
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-8 h-8 items-center justify-center"
            >
              <ArrowLeft color="#111" size={24} />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">Session</Text>
            <View className="w-8" />
          </View>
        )}

        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base font-semibold text-gray-900 text-center mb-2">
            Could not load session
          </Text>
          <Text className="text-sm text-gray-600 text-center mb-4">
            {getUserFacingSessionsErrorMessage(detailError)}
          </Text>
          <TouchableOpacity
            onPress={() => refetchDetail()}
            className="bg-[#089769] px-5 py-3 rounded-lg"
            activeOpacity={0.85}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isDesktop ? "bg-[#e6f5f0]" : "bg-white"}`}
    >
      {isDesktop ? (
        <WebHeader />
      ) : (
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-8 h-8 items-center justify-center"
          >
            <ArrowLeft color="#111" size={24} />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">Session</Text>
          <View className="w-8" />
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {isDesktop && (
          <View className="max-w-4xl mx-auto w-full px-4 pt-6">
            <View className="flex-row items-center mb-4">
              <TouchableOpacity
                onPress={() => router.back()}
                className="flex-row items-center bg-white rounded-full px-3 py-1.5 mr-3 border border-gray-200"
              >
                <ArrowLeft color="#089769" size={18} />
                <Text className="ml-1 text-sm font-semibold text-[#089769]">
                  Back
                </Text>
              </TouchableOpacity>
              <Text className="text-xs text-gray-500 uppercase tracking-widest">
                Session Details
              </Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              {(() => {
                console.log("[session-view TITLE]", {
                  isCurrentUserTherapist,
                  relieverTherapistName: detail?.relieverTherapistName,
                  therapistName: detail?.therapistName,
                  patientName: detail?.patientName,
                });
                if (isCurrentUserTherapist) {
                  return `Session with ${detail?.patientName || "Patient"}`;
                }
                if (detail?.relieverTherapistName) {
                  return `Session with ${detail.relieverTherapistName} (Substitute Therapist)`;
                }
                return `Session with ${detail?.therapistName || "Therapist"}`;
              })()}
            </Text>
          </View>
        )}
        <View
          className={`p-4 ${
            isDesktop
              ? "max-w-4xl mx-auto w-full"
              : "web:max-w-2xl web:mx-auto web:w-full"
          }`}
        >
          {isBusy ? (
            <ActivityIndicator color="#089769" className="self-center mb-4" />
          ) : null}

          {/* Reliever Review Banner - For reliever therapist reviewing a proposal */}
          {(isRelieverReviewingProposal ||
            fromRelieverRequest ||
            (isCurrentUserReliever && isPendingRescheduleApproval)) &&
            (() => {
              // Check if reliever has accepted (status is now PendingRescheduleApproval and user is the reliever)
              const hasAccepted =
                isCurrentUserReliever && isPendingRescheduleApproval;

              return (
                <View
                  className={
                    hasAccepted
                      ? "bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-4"
                      : "bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4"
                  }
                >
                  <View className="flex-row items-center justify-between mb-3">
                    <Text
                      className={
                        hasAccepted
                          ? "text-sm font-bold text-green-900"
                          : "text-sm font-bold text-amber-900"
                      }
                    >
                      👥 Reliever Request
                    </Text>
                    <View
                      className={
                        hasAccepted
                          ? "bg-green-100 px-2 py-1 rounded-full border border-green-300"
                          : "bg-amber-100 px-2 py-1 rounded-full border border-amber-300"
                      }
                    >
                      <Text
                        className={
                          hasAccepted
                            ? "text-[10px] font-bold text-green-700"
                            : "text-[10px] font-bold text-amber-700"
                        }
                      >
                        {hasAccepted ? "ACCEPTED" : "AWAITING YOUR RESPONSE"}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className={
                      hasAccepted
                        ? "text-xs text-green-800 mb-3"
                        : "text-xs text-amber-800 mb-3"
                    }
                  >
                    {hasAccepted
                      ? "You've accepted this reliever request. Waiting for patient approval of the reschedule."
                      : "You've been requested to substitute for this session. Review the details below and decide whether to accept."}
                  </Text>

                  {/* Original therapist info */}
                  <View
                    className={
                      hasAccepted
                        ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                        : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                    }
                  >
                    <Text
                      className={
                        hasAccepted
                          ? "text-xs text-green-700 font-medium mb-1"
                          : "text-xs text-amber-700 font-medium mb-1"
                      }
                    >
                      Requested by
                    </Text>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {detail?.therapistName || "Therapist"}
                    </Text>
                  </View>

                  {/* Patient info */}
                  <View
                    className={
                      hasAccepted
                        ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                        : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                    }
                  >
                    <Text
                      className={
                        hasAccepted
                          ? "text-xs text-green-700 font-medium mb-1"
                          : "text-xs text-amber-700 font-medium mb-1"
                      }
                    >
                      Patient
                    </Text>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {detail?.patientName || "Patient"}
                    </Text>
                  </View>

                  {/* Case info - always show */}
                  <View
                    className={
                      hasAccepted
                        ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                        : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                    }
                  >
                    <Text
                      className={
                        hasAccepted
                          ? "text-xs text-green-700 font-medium mb-1"
                          : "text-xs text-amber-700 font-medium mb-1"
                      }
                    >
                      Case
                    </Text>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {detail?.conditionCase || "Not specified"}
                    </Text>
                  </View>

                  {/* Proposed schedule - show proposed or current schedule */}
                  <View
                    className={
                      hasAccepted
                        ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                        : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                    }
                  >
                    <Text
                      className={
                        hasAccepted
                          ? "text-xs text-green-700 font-medium mb-1"
                          : "text-xs text-amber-700 font-medium mb-1"
                      }
                    >
                      {detail?.proposedRescheduleStartAt
                        ? "Reschedule Date/Time"
                        : "Current Schedule"}
                    </Text>
                    {detail?.proposedRescheduleStartAt || detail?.startAt ? (
                      <>
                        <Text className="text-sm text-gray-900 font-semibold">
                          {new Date(
                            detail?.proposedRescheduleStartAt ||
                              detail?.startAt ||
                              "",
                          ).toLocaleString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </Text>
                        <Text className="text-xs text-gray-600 mt-1">
                          {new Date(
                            detail?.proposedRescheduleStartAt ||
                              detail?.startAt ||
                              "",
                          ).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}{" "}
                          -{" "}
                          {new Date(
                            detail?.proposedRescheduleEndAt ||
                              detail?.endAt ||
                              "",
                          ).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-sm text-gray-500 italic">
                        Not scheduled yet
                      </Text>
                    )}
                  </View>

                  {/* Reason */}
                  {(detail?.rescheduleProposalReason ||
                    detail?.relieverSubstitutionReason) && (
                    <View
                      className={
                        hasAccepted
                          ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                          : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                      }
                    >
                      <Text
                        className={
                          hasAccepted
                            ? "text-xs text-green-700 font-medium mb-1"
                            : "text-xs text-amber-700 font-medium mb-1"
                        }
                      >
                        Reason
                      </Text>
                      <Text className="text-sm text-gray-700 italic">
                        {'"'}
                        {detail.relieverSubstitutionReason ||
                          detail.rescheduleProposalReason}
                        {'"'}
                      </Text>
                    </View>
                  )}

                  {/* Patient's Area */}
                  <View
                    className={
                      hasAccepted
                        ? "bg-white/70 rounded-lg p-3 mb-3 border border-green-200"
                        : "bg-white/70 rounded-lg p-3 mb-3 border border-amber-200"
                    }
                  >
                    <Text
                      className={
                        hasAccepted
                          ? "text-xs text-green-700 font-medium mb-1"
                          : "text-xs text-amber-700 font-medium mb-1"
                      }
                    >
                      Patient{"'"}s Area
                    </Text>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {detail?.patientBarangay ||
                        detail?.patientAddress
                          ?.split(",")
                          .slice(-2)
                          .join(",")
                          .trim() ||
                        detail?.effectiveAddress ||
                        "Location not specified"}
                    </Text>
                    {!hasAccepted && (
                      <Text className="text-xs text-amber-600 mt-1 italic">
                        📍 Full location details will be available after you
                        accept
                      </Text>
                    )}
                  </View>

                  {/* Accept/Decline buttons - only show if not yet accepted */}
                  {!hasAccepted && (
                    <View className="flex-row gap-2 mt-2">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setRelieverAcceptModalVisible(true);
                        }}
                        disabled={
                          acceptRelieverMutation.isPending ||
                          declineRelieverMutation.isPending
                        }
                        className="flex-1 bg-[#089769] py-3 px-4 rounded-lg items-center justify-center"
                        style={{
                          opacity:
                            acceptRelieverMutation.isPending ||
                            declineRelieverMutation.isPending
                              ? 0.6
                              : 1,
                        }}
                      >
                        {acceptRelieverMutation.isPending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text className="text-white font-semibold text-sm">
                            Accept Request
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => declineRelieverMutation.mutate()}
                        disabled={
                          acceptRelieverMutation.isPending ||
                          declineRelieverMutation.isPending
                        }
                        className="flex-1 border border-red-500 py-3 px-4 rounded-lg items-center justify-center"
                        style={{
                          opacity:
                            acceptRelieverMutation.isPending ||
                            declineRelieverMutation.isPending
                              ? 0.6
                              : 1,
                        }}
                      >
                        {declineRelieverMutation.isPending ? (
                          <ActivityIndicator color="#EF4444" size="small" />
                        ) : (
                          <Text className="text-red-600 font-semibold text-sm">
                            Decline
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })()}

          {/* Reschedule Proposal Banner - For patient when therapist proposes new schedule */}
          {isPendingRescheduleApproval &&
            isCurrentUserPatient &&
            detail?.proposedRescheduleStartAt &&
            detail?.proposedRescheduleEndAt &&
            (() => {
              const hasReliever = !!(
                detail?.relieverTherapistName || detail?.isRelieverProposed
              );
              const relieverName =
                detail?.relieverTherapistName || "Substitute Therapist";
              console.log("[session-view.tsx BANNER]", {
                hasReliever,
                relieverName,
                isRelieverProposed: detail?.isRelieverProposed,
                relieverTherapistId: detail?.relieverTherapistId,
                relieverTherapistName: detail?.relieverTherapistName,
              });
              return (
                <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <Text className="text-sm font-bold text-blue-800 mb-1">
                    📅 Reschedule Proposal
                  </Text>
                  <Text className="text-xs text-blue-800 mb-2">
                    Your therapist has requested to reschedule this session
                    {hasReliever
                      ? ` with substitute therapist ${relieverName}`
                      : ""}
                    .
                  </Text>
                  {detail?.rescheduleProposalReason ? (
                    <Text className="text-xs text-blue-700 mb-3 italic">
                      Reason: {'"'}
                      {detail.rescheduleProposalReason}
                      {'"'}
                    </Text>
                  ) : null}

                  {/* Show reliever therapist info if proposed */}
                  {(() => {
                    const shouldShow =
                      !!detail?.relieverTherapistName ||
                      !!detail?.isRelieverProposed;
                    return shouldShow;
                  })() && (
                    <View className="bg-teal-50 border-2 border-teal-300 rounded-lg p-3 mb-3">
                      <Text className="text-xs font-bold text-teal-900 mb-2">
                        👥 Substitute Therapist for This Session
                      </Text>
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full bg-teal-100 items-center justify-center mr-3">
                          <Text className="text-teal-700 font-bold text-base">
                            {(detail?.relieverTherapistName || "ST")
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-base font-bold text-teal-900">
                            {detail?.relieverTherapistName ||
                              "Substitute Therapist"}
                          </Text>
                          {detail?.relieverTherapistSpecialty && (
                            <Text className="text-xs text-teal-700">
                              {detail.relieverTherapistSpecialty}
                            </Text>
                          )}
                          <Text className="text-xs text-teal-600 mt-1">
                            Will handle this session on your behalf
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View className="bg-white rounded-lg p-3 mb-3 border border-blue-100">
                    <Text className="text-xs text-blue-600 font-medium mb-1">
                      Proposed New Schedule
                    </Text>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {new Date(
                        detail.proposedRescheduleStartAt,
                      ).toLocaleString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </Text>
                    <Text className="text-xs text-gray-600 mt-1">
                      {new Date(
                        detail.proposedRescheduleStartAt,
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      -{" "}
                      {new Date(
                        detail.proposedRescheduleEndAt,
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => approveRescheduleMutation.mutate()}
                    disabled={approveRescheduleMutation.isPending}
                    className="bg-blue-600 py-2.5 px-4 rounded-lg items-center justify-center mb-2"
                    style={{
                      opacity: approveRescheduleMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text className="text-white font-semibold text-sm">
                      {approveRescheduleMutation.isPending
                        ? "Acknowledging..."
                        : detail?.isRelieverProposed
                          ? "Accept Proposal with Reliever"
                          : "Acknowledge"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => declineRescheduleMutation.mutate()}
                    disabled={declineRescheduleMutation.isPending}
                    className="border border-red-500 py-2.5 px-4 rounded-lg items-center justify-center"
                    style={{
                      opacity: declineRescheduleMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text className="text-red-600 font-semibold text-sm">
                      {declineRescheduleMutation.isPending
                        ? "Declining..."
                        : "Decline"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

          {/* Reschedule Proposal Status Banner - For therapist when they've sent a reschedule proposal (not for reliever) */}
          {isPendingRescheduleApproval &&
            isCurrentUserTherapist &&
            !isCurrentUserReliever &&
            detail?.proposedRescheduleStartAt &&
            detail?.proposedRescheduleEndAt && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-bold text-amber-800">
                    Reschedule Request Sent
                  </Text>
                  <View className="bg-amber-100 px-2 py-1 rounded-full">
                    <Text className="text-xs font-semibold text-amber-700">
                      Awaiting Response
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-amber-700 mb-3">
                  Your reschedule proposal has been sent to the patient. Waiting
                  for their response.
                </Text>
                {detail?.rescheduleProposalReason ? (
                  <Text className="text-xs text-amber-700 mb-3 italic">
                    {`Your reason: "${detail.rescheduleProposalReason}"`}
                  </Text>
                ) : null}
                <View className="bg-white rounded-lg p-3 border border-amber-100">
                  <Text className="text-xs text-amber-600 font-medium mb-1">
                    Proposed New Schedule
                  </Text>
                  <Text className="text-sm text-gray-900 font-semibold">
                    {new Date(detail.proposedRescheduleStartAt).toLocaleString(
                      undefined,
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      },
                    )}
                  </Text>
                  <Text className="text-xs text-gray-600 mt-1">
                    {new Date(
                      detail.proposedRescheduleStartAt,
                    ).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}{" "}
                    -{" "}
                    {new Date(
                      detail.proposedRescheduleEndAt,
                    ).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </Text>
                </View>
                {/* Show reliever therapist information if one was proposed */}
                {detail?.isRelieverProposed &&
                  detail?.relieverTherapistName && (
                    <View className="bg-teal-50 rounded-lg p-3 border border-teal-200 mt-2">
                      <Text className="text-xs text-teal-700 font-medium mb-1">
                        Reliever Therapist Proposed
                      </Text>
                      <Text className="text-sm text-gray-900 font-semibold">
                        {detail.relieverTherapistName}
                      </Text>
                      {detail.relieverTherapistSpecialty && (
                        <Text className="text-xs text-gray-600 mt-0.5">
                          {detail.relieverTherapistSpecialty}
                        </Text>
                      )}
                      {detail.relieverSubstitutionReason && (
                        <Text className="text-xs text-teal-700 mt-2 italic">
                          Reason: {'"'}
                          {detail.relieverSubstitutionReason}
                          {'"'}
                        </Text>
                      )}
                    </View>
                  )}
                {detail?.rescheduleProposedAt && (
                  <Text className="text-[10px] text-amber-600 mt-2">
                    Sent on{" "}
                    {new Date(detail.rescheduleProposedAt).toLocaleString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      },
                    )}
                  </Text>
                )}
              </View>
            )}

          {/* Pending Reschedule Banner - For patient: shows "For Review", For therapist: shows action buttons */}
          {isPendingCancellation && (
            <View
              className={`${
                isCurrentUserPatient
                  ? "bg-amber-50 border-amber-200"
                  : "bg-blue-50 border-blue-200"
              } border rounded-xl p-3 mb-4`}
            >
              {isCurrentUserPatient ? (
                <>
                  <Text className="text-sm font-bold text-amber-800 mb-1">
                    Reschedule Request - For Review
                  </Text>
                  <Text className="text-xs text-amber-700">
                    Your reschedule request is pending review by your therapist.
                  </Text>
                  {detail?.patientCancellationReason ? (
                    <Text className="text-xs text-amber-700 mt-2 italic">{`Your reason: "${detail.patientCancellationReason}"`}</Text>
                  ) : null}
                  <Text className="text-xs text-amber-600 mt-2">
                    You will be notified once the therapist has reviewed and
                    proposed a new schedule.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-sm font-bold text-blue-800 mb-1">
                    Patient Requested to Reschedule
                  </Text>
                  <Text className="text-xs text-blue-700">
                    The patient has requested to reschedule this session and is
                    waiting for your review.
                  </Text>
                  {detail?.patientCancellationReason ? (
                    <Text className="text-xs text-blue-700 mt-2 italic">{`Patient's reason: "${detail.patientCancellationReason}"`}</Text>
                  ) : null}
                  <Text className="text-xs text-blue-600 mt-2 mb-3">
                    Propose a new schedule for this session.
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      // Open reschedule picker - will propose new schedule
                      setIsPickingRescheduleForAcknowledge(true);
                      openReschedulePicker(false);
                    }}
                    disabled={acknowledgeCancellationMutation.isPending}
                    className="bg-[#089769] py-2.5 px-4 rounded-lg items-center justify-center"
                  >
                    <Text className="text-white font-semibold text-sm">
                      {acknowledgeCancellationMutation.isPending
                        ? "Processing..."
                        : "Acknowledged and Reschedule"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Cancellation Acknowledged Banner - Shows after therapist acknowledges */}
          {isCancellationAcknowledged && (
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <Text className="text-sm font-bold text-blue-800 mb-1">
                ✓ Cancellation Acknowledged
              </Text>
              <Text className="text-xs text-blue-800">
                {isCurrentUserPatient
                  ? "Your cancellation request has been acknowledged by your therapist. Please wait for the reschedule date."
                  : "You have acknowledged the patient's cancellation request."}
              </Text>
              {detail?.patientCancellationReason ? (
                <Text className="text-xs text-blue-700 mt-2 italic">
                  {isCurrentUserPatient
                    ? `Your reason: "${detail.patientCancellationReason}"`
                    : `Patient's reason: "${detail.patientCancellationReason}"`}
                </Text>
              ) : null}
            </View>
          )}

          {/* Session Cancelled Banner */}
          {(() => {
            const sessionStatus = (detail?.status || "").toLowerCase();
            const contractStatus = (detail?.contractStatus || "").toLowerCase();
            const isCancelled =
              sessionStatus === "cancelled" || sessionStatus === "canceled";
            const isContractEnded =
              contractStatus === "completed" || contractStatus === "terminated";

            // Only show cancellation banner if session is cancelled AND contract is not completed/terminated
            if (isCancelled && !isContractEnded) {
              const wasPatientInitiated = detail?.cancelledBy === "Patient";
              const showAsAcknowledged =
                isCurrentUserPatient && wasPatientInitiated;

              return (
                <View
                  className={`${
                    showAsAcknowledged
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  } border rounded-xl p-3 mb-4`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      showAsAcknowledged ? "text-green-800" : "text-red-800"
                    } mb-1`}
                  >
                    {showAsAcknowledged
                      ? "Cancellation Request Acknowledged"
                      : "Session Cancelled"}
                  </Text>
                  <Text
                    className={`text-xs ${
                      showAsAcknowledged ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {showAsAcknowledged
                      ? "Your cancellation request has been acknowledged by your therapist."
                      : detail?.cancelledBy
                        ? `Cancelled by ${
                            detail.cancelledBy === "Therapist"
                              ? "Physical Therapist"
                              : "Patient"
                          }`
                        : "This session has been cancelled."}
                  </Text>
                  {detail?.cancellationReason && !showAsAcknowledged ? (
                    <Text className="text-xs text-red-700 mt-2 italic">{`"${detail.cancellationReason}"`}</Text>
                  ) : null}
                  {detail?.patientCancellationReason && showAsAcknowledged ? (
                    <Text className="text-xs text-green-700 mt-2 italic">{`Your reason: "${detail.patientCancellationReason}"`}</Text>
                  ) : null}
                  {/* Reschedule button - only show if not already rescheduled */}
                  {!detail?.isRescheduled && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={openReschedulePicker}
                      className="bg-[#089769] py-2.5 px-4 rounded-lg mt-3 items-center justify-center"
                    >
                      <Text className="text-white font-semibold text-sm">
                        Reschedule Session
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }
            return null;
          })()}

          {/* Participants (hidden for reliever therapists viewing proposals - info already in banner) */}
          {!fromRelieverRequest && (
            <View
              className={`border ${
                detail?.isRelieverSession
                  ? "border-amber-300"
                  : "border-gray-200"
              } rounded-xl p-4 ${
                detail?.isRelieverSession ? "bg-amber-50" : "bg-gray-50"
              } mb-4 ${
                isDesktop
                  ? `border-l-4 ${
                      detail?.isRelieverSession
                        ? "border-l-amber-500"
                        : "border-l-[#089769]"
                    }`
                  : ""
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs text-gray-500">Participants</Text>
                {detail?.isRelieverSession && (
                  <View className="bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    <Text className="text-[10px] font-semibold text-amber-700">
                      Substitute Session
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-col web:flex-row web:items-start web:justify-between gap-3 web:gap-0">
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center gap-1">
                    <Text
                      className={`text-[11px] ${
                        detail?.isRelieverSession
                          ? "text-amber-700 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {detail?.isRelieverSession
                        ? "Reliever Therapist"
                        : "Therapist"}
                    </Text>
                    {detail?.isRelieverSession && (
                      <View className="bg-amber-200 px-1.5 py-0.5 rounded">
                        <Text className="text-[9px] font-bold text-amber-800">
                          SUBSTITUTE
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User
                      size={16}
                      color={detail?.isRelieverSession ? "#D97706" : "#089769"}
                    />
                    <Text
                      className={`text-sm font-semibold ${
                        detail?.isRelieverSession
                          ? "text-amber-900"
                          : "text-gray-900"
                      }`}
                    >
                      {therapistName || "Therapist"}
                    </Text>
                  </View>
                </View>
                <View className="flex-1 pl-2 web:items-end">
                  <Text className="text-[11px] text-gray-500">Patient</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User size={16} color="#6B7280" />
                    <Text className="text-sm text-gray-900 font-semibold">
                      {patientName || "Patient"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Case (hidden for reliever therapists viewing proposals - info already in banner) */}
          {!fromRelieverRequest && detail?.conditionCase ? (
            <View
              className={`mb-3 border border-gray-200 rounded-xl p-4 bg-white ${
                isDesktop ? "border-l-4 border-l-[#089769]" : ""
              }`}
            >
              <Text className="text-xs text-gray-500 mb-1">Case</Text>
              <View className="flex-row items-center">
                <FileText size={16} color="#089769" />
                <Text className="text-gray-700 ml-2 flex-1">
                  {detail.conditionCase}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Schedule (hidden for reliever therapists viewing proposals - info already in banner) */}
          {!fromRelieverRequest && (
            <View
              className={`mb-3 border ${
                detail?.isRescheduled ? "border-amber-300" : "border-gray-200"
              } rounded-xl p-4 ${
                detail?.isRescheduled ? "bg-amber-50" : "bg-white"
              } ${
                isDesktop
                  ? `border-l-4 ${
                      detail?.isRescheduled
                        ? "border-l-amber-500"
                        : "border-l-[#089769]"
                    }`
                  : ""
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-xs text-gray-500">
                    {detail?.isRescheduled ? "Rescheduled on" : "Schedule"}
                  </Text>
                  {detail?.isRescheduled && detail?.rescheduledAt && (
                    <View className="bg-amber-100 px-2 py-0.5 rounded">
                      <Text className="text-[10px] font-semibold text-amber-700">
                        {new Date(detail.rescheduledAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full ${statusMeta.badge}`}
                >
                  {statusMeta.label}
                </Text>
              </View>
              <View className="flex-row items-center mb-1">
                <Calendar
                  size={16}
                  color={detail?.isRescheduled ? "#D97706" : "#089769"}
                />
                <Text
                  className={
                    detail?.isRescheduled
                      ? "text-amber-900 ml-2 font-medium"
                      : "text-gray-700 ml-2"
                  }
                >
                  {formatDate(scheduleStartAt)}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock
                  size={16}
                  color={detail?.isRescheduled ? "#D97706" : "#089769"}
                />
                <Text
                  className={
                    detail?.isRescheduled
                      ? "text-amber-900 ml-2 font-medium"
                      : "text-gray-700 ml-2"
                  }
                >
                  {formatTimeRange(scheduleStartAt, scheduleEndAt)}
                </Text>
              </View>
            </View>
          )}

          {/* Location with embedded map */}
          {(() => {
            // Determine destination coordinates - prioritize patient's saved location
            const lat =
              detail?.patientLatitude ??
              detail?.effectiveLatitude ??
              detail?.latitude;
            const lng =
              detail?.patientLongitude ??
              detail?.effectiveLongitude ??
              detail?.longitude;
            const address =
              detail?.patientAddress ??
              detail?.effectiveAddress ??
              detail?.locationAddress;
            const barangay = detail?.patientBarangay;

            // Therapist's saved location for routing
            const therapistLat = detail?.therapistLatitude;
            const therapistLng = detail?.therapistLongitude;
            let therapistCoord: [number, number] | null = null;
            if (
              therapistLat != null &&
              therapistLng != null &&
              Number.isFinite(therapistLat) &&
              Number.isFinite(therapistLng)
            ) {
              therapistCoord = [therapistLng, therapistLat];
            }

            // Normalize coordinates if swapped
            let destCoord: [number, number] | null = null;
            if (
              lat != null &&
              lng != null &&
              Number.isFinite(lat) &&
              Number.isFinite(lng)
            ) {
              let finalLat = lat;
              let finalLng = lng;
              if (Math.abs(finalLat) > 90 && Math.abs(finalLng) <= 90) {
                const tmp = finalLat;
                finalLat = finalLng;
                finalLng = tmp;
              }
              if (Math.abs(finalLat) <= 90 && Math.abs(finalLng) <= 180) {
                destCoord = [finalLng, finalLat];
              }
            }

            const hasLocation = address || destCoord;

            // Hide location card for reliever therapists (info is in the banner)
            if (fromRelieverRequest || isRelieverReviewingProposal) return null;

            if (!hasLocation) return null;

            return (
              <View className="mb-3">
                {/* Therapist location sharing notification - Patient only */}
                {!isCurrentUserTherapist && isLocationSharing && (
                  <View className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 mb-3 shadow-sm">
                    <View className="flex-row items-center gap-3 mb-2">
                      <View className="relative">
                        <View
                          className="w-4 h-4 rounded-full bg-green-500"
                          style={{
                            shadowColor: "#10B981",
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.8,
                            shadowRadius: 4,
                            elevation: 4,
                          }}
                        />
                        <View className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-green-400 opacity-40 animate-ping" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-green-900">
                          🚗 Live Tracking Active
                        </Text>
                        <Text className="text-xs text-green-800 font-medium">
                          {detail?.therapistName || "Your therapist"} is sharing
                          their real-time location
                        </Text>
                      </View>
                      <View className="bg-green-200 px-3 py-1 rounded-full border border-green-400">
                        <Text className="text-[10px] font-bold text-green-800">
                          LIVE GPS
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-green-700 bg-green-100 p-2 rounded-lg text-center">
                      💚 Live tracking enabled • You can see their location on
                      the map
                    </Text>
                  </View>
                )}

                <View
                  className={`border border-gray-200 rounded-xl bg-white overflow-hidden ${
                    isDesktop ? "border-l-4 border-l-[#089769]" : ""
                  }`}
                >
                  <View className="p-4 pb-2">
                    <Text className="text-xs text-gray-500 mb-1">
                      {isRelieverReviewingProposal || fromRelieverRequest
                        ? "Patient's Area"
                        : isCurrentUserTherapist
                          ? "Patient's Location"
                          : "Location"}
                    </Text>
                    <View className="flex-row items-center">
                      <MapPin size={16} color="#089769" />
                      <Text className="text-gray-700 ml-2 flex-1">
                        {isRelieverReviewingProposal || fromRelieverRequest
                          ? barangay ||
                            address?.split(",").slice(-2).join(",").trim() ||
                            address ||
                            "Location not specified"
                          : address}
                      </Text>
                    </View>
                    {(isRelieverReviewingProposal || fromRelieverRequest) && (
                      <Text className="text-xs text-amber-600 mt-2 italic">
                        📍 Full location details will be available after you
                        accept the proposal
                      </Text>
                    )}
                  </View>
                  {/* Only show map if not reliever reviewing proposal */}
                  {!isRelieverReviewingProposal &&
                  !fromRelieverRequest &&
                  (destCoord || address) ? (
                    <EmbeddedLocationMap
                      dest={destCoord}
                      address={address ?? undefined}
                      isPatient={selectedRole === "Patient"}
                      therapistSavedLocation={therapistCoord}
                      patientSavedLocation={destCoord}
                      onOpenFullMap={() => {
                        router.push({
                          pathname: "/session-map",
                          params: {
                            lat: String(destCoord?.[1] ?? ""),
                            lng: String(destCoord?.[0] ?? ""),
                            address: address ?? undefined,
                            barangay: barangay ?? undefined,
                            sessionId: sessionId
                              ? String(sessionId)
                              : undefined,
                            profileId: detail?.patientId
                              ? String(detail.patientId)
                              : undefined,
                            // Pass therapist saved location for routing
                            therapistLat: therapistCoord
                              ? String(therapistCoord[1])
                              : undefined,
                            therapistLng: therapistCoord
                              ? String(therapistCoord[0])
                              : undefined,
                            // Pass location sharing state
                            isSharing: isLocationSharing ? "true" : "false",
                          },
                        });
                      }}
                    />
                  ) : null}
                </View>
              </View>
            );
          })()}

          {/* Share My Location Toggle - Therapist Only (hidden for reliever therapists) */}
          {isCurrentUserTherapist &&
          sessionId &&
          !isEnded &&
          !isCancelled &&
          !isCurrentUserReliever &&
          !fromRelieverRequest ? (
            <View
              className={`mb-3 border ${
                isLocationSharing
                  ? "border-green-300 bg-green-50"
                  : "border-gray-200 bg-white"
              } rounded-xl p-4 ${
                isDesktop
                  ? `border-l-4 ${
                      isLocationSharing
                        ? "border-l-green-500"
                        : "border-l-[#089769]"
                    }`
                  : ""
              }`}
            >
              <TouchableOpacity
                onPress={() => {
                  console.log("🔘 [SessionView] Location toggle pressed");
                  console.log(
                    "  - Current isLocationSharing:",
                    isLocationSharing,
                  );
                  console.log("  - About to call toggleLocationSharing");
                  toggleLocationSharing();
                  console.log("  - toggleLocationSharing called");
                }}
                activeOpacity={0.85}
                className="flex-row items-center justify-between"
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`w-3 h-3 rounded-full ${
                        isLocationSharing ? "bg-green-500" : "bg-gray-300"
                      }`}
                      style={{
                        ...(isLocationSharing && {
                          shadowColor: "#10B981",
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 4,
                          elevation: 4,
                        }),
                      }}
                    />
                    <Text
                      className={`text-sm font-semibold ${
                        isLocationSharing ? "text-green-900" : "text-gray-900"
                      }`}
                    >
                      {isLocationSharing
                        ? "📍 Sharing Live Location"
                        : "Share My Location"}
                    </Text>
                    {isLocationSharing && (
                      <View className="bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300 ml-2">
                        <Text className="text-[10px] font-bold text-blue-700">
                          YOU
                        </Text>
                      </View>
                    )}
                    {isLocationSharing && (
                      <View className="bg-green-100 px-2 py-0.5 rounded-full border border-green-300">
                        <Text className="text-[10px] font-bold text-green-700">
                          LIVE
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    className={`text-xs mt-1 ml-5 ${
                      isLocationSharing ? "text-green-700" : "text-gray-500"
                    }`}
                  >
                    {isLocationSharing
                      ? "Patient can see your real-time location"
                      : "Let patient track your arrival"}
                  </Text>
                </View>
                <View
                  className={`w-12 h-7 rounded-full flex-row items-center px-1 transition-colors duration-200 ${
                    isLocationSharing
                      ? "bg-green-500 justify-end"
                      : "bg-gray-300 justify-start"
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full transition-shadow duration-200 ${
                      isLocationSharing ? "bg-white shadow-lg" : "bg-white"
                    }`}
                  />
                </View>
              </TouchableOpacity>
              {isLocationSharing && (
                <View className="mt-3 bg-green-100 border border-green-200 rounded-lg p-3">
                  <View className="flex-row items-center justify-center gap-2">
                    <View
                      className="w-2 h-2 rounded-full bg-green-500 opacity-80"
                      style={{
                        shadowColor: "#10B981",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 3,
                        elevation: 3,
                      }}
                    />
                    <Text className="text-xs text-green-800 font-medium text-center">
                      Broadcasting location • Updates active
                    </Text>
                  </View>
                  <Text className="text-[10px] text-green-600 text-center mt-1">
                    GPS tracking enabled
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Cost breakdown */}
          {detail?.totalFee != null ||
          detail?.professionalFee != null ||
          detail?.locationFee != null ||
          detail?.miscellaneousFee != null ||
          detail?.patientFee != null ? (
            <View
              className={`mb-3 border border-gray-200 rounded-xl p-4 bg-white ${
                isDesktop ? "border-l-4 border-l-[#089769]" : ""
              }`}
            >
              <Text className="text-xs text-gray-500 mb-2">Cost breakdown</Text>

              {detail?.professionalFee != null ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-gray-700">Professional fee</Text>
                  <Text className="text-gray-900 font-semibold">
                    {formatPeso(detail.professionalFee) ?? "—"}
                  </Text>
                </View>
              ) : null}

              {detail?.locationFee != null ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-gray-700">Location fee</Text>
                  <Text className="text-gray-900 font-semibold">
                    {formatPeso(detail.locationFee) ?? "—"}
                  </Text>
                </View>
              ) : null}

              {detail?.miscellaneousFee != null ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-gray-700">Tools/Misc</Text>
                  <Text className="text-gray-900 font-semibold">
                    {formatPeso(detail.miscellaneousFee) ?? "—"}
                  </Text>
                </View>
              ) : null}

              {detail?.patientFee != null ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-gray-700">Patient total</Text>
                  <Text className="text-gray-900 font-semibold">
                    {formatPeso(detail.patientFee) ?? "—"}
                  </Text>
                </View>
              ) : null}

              {detail?.totalFee != null ? (
                <View className="mt-2 pt-2 border-t border-gray-200 flex-row items-center justify-between">
                  <Text className="text-gray-900 font-semibold">Total</Text>
                  <Text className="text-gray-900 font-bold">
                    {formatPeso(detail.totalFee) ?? "—"}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Session Logs (hidden for reliever therapists viewing proposals) */}
          {sessionId && !fromRelieverRequest ? (
            <View
              className={`mb-3 border border-gray-200 rounded-xl p-4 bg-white ${
                isDesktop ? "border-l-4 border-l-[#089769]" : ""
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs text-gray-500">Session logs</Text>
                {isLogsLoading || isLogsFetching ? (
                  <ActivityIndicator color="#089769" />
                ) : null}
              </View>
              {(!sessionLogs || sessionLogs.length === 0) &&
              !(isLogsLoading || isLogsFetching) ? (
                <Text className="text-gray-500 text-sm">No logs yet.</Text>
              ) : null}
              {Array.isArray(sessionLogs) && sessionLogs.length > 0 ? (
                <View className="mt-1">
                  {sessionLogs.map((log, idx) => (
                    <View
                      key={log.id ?? idx}
                      className="py-2 border-b border-gray-100 last:border-0"
                    >
                      <Text className="text-[11px] text-gray-500 mb-0.5">
                        {formatDate(log.date)}
                      </Text>
                      <Text className="text-gray-800">
                        {formatTimeRange(log.startTime, log.endTime)}
                        {Number.isFinite(log.durationMinutes as any) ? (
                          <Text className="text-gray-500">
                            {" "}
                            •{" "}
                            {(() => {
                              const totalMinutes =
                                log.durationMinutes as number;
                              const mins = Math.floor(totalMinutes);
                              const secs = Math.round(
                                (totalMinutes - mins) * 60,
                              );
                              return secs > 0
                                ? `${mins} mins ${secs} secs`
                                : `${mins} mins`;
                            })()}
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      {/* Start/End Session + End Contract controls (hidden for reliever therapists) */}
      {!isBusy && !isEnded && !isCurrentUserReliever && !fromRelieverRequest ? (
        <View className="border-t border-gray-200 bg-white">
          <View
            className={`p-4 ${
              isDesktop
                ? "max-w-4xl mx-auto w-full"
                : "web:max-w-2xl web:mx-auto web:w-full"
            }`}
          >
            {/* Reschedule Session button - only show for therapist when cancellation is acknowledged */}
            {isCancellationAcknowledged && isCurrentUserTherapist ? (
              <TouchableOpacity
                onPress={() => {
                  setIsPickingRescheduleForAcknowledge(true);
                  openReschedulePicker(false);
                }}
                className="bg-[#089769] py-3.5 rounded-lg items-center justify-center mb-2"
                activeOpacity={0.85}
              >
                <Text className="text-white font-semibold text-base">
                  Reschedule Session
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* End Session Early - only show when not done and not cancelled */}
            {!isCancelled && !isDoneForToday && !isCancellationAcknowledged ? (
              <TouchableOpacity
                onPress={quickMarkDone}
                disabled={markAsDoneMutation.isPending}
                className="bg-[#089769] py-3.5 rounded-lg items-center justify-center mb-2"
                activeOpacity={0.85}
              >
                {markAsDoneMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    End Session Early
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
            {/* Log Session button removed - no longer needed when session is "Done for today" */}

            {/* End Session - Hidden when timer is running */}
            {!timerStartMs && !showEndOptions && !isCancellationAcknowledged ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowEndOptions(true)}
                  className="bg-amber-500 py-3.5 rounded-lg items-center justify-center"
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold text-base">
                    End Session
                  </Text>
                </TouchableOpacity>
                {!isCancelled ? (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        if (hasOngoingReschedule) {
                          setShowOngoingRescheduleWarning(true);
                        } else {
                          setCancelModalVisible(true);
                        }
                      }}
                      className="mt-2 py-3.5 rounded-lg items-center justify-center border border-orange-600"
                      activeOpacity={0.85}
                    >
                      <Text className="text-orange-700 font-semibold text-base">
                        Reschedule Session
                      </Text>
                    </TouchableOpacity>
                    {!isCurrentUserTherapist && (
                      <TouchableOpacity
                        onPress={() => {
                          if (hasOngoingReschedule) {
                            setShowOngoingRescheduleWarning(true);
                          } else {
                            setCancelOnlyModalVisible(true);
                          }
                        }}
                        className="mt-2 py-3.5 rounded-lg items-center justify-center border border-red-600"
                        activeOpacity={0.85}
                      >
                        <Text className="text-red-700 font-semibold text-base">
                          Cancel Session
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : null}
              </>
            ) : !timerStartMs && showEndOptions ? (
              <View>
                <View className="flex-row items-stretch mb-2">
                  <TouchableOpacity
                    onPress={() => {
                      setEndSessionType("Completed");
                      setEndSessionConfirmText("");
                      setEndSessionReason("");
                      setEndSessionModalVisible(true);
                    }}
                    disabled={endMutation.isPending}
                    className="flex-1 bg-[#089769] py-3.5 rounded-lg items-center justify-center mr-2"
                    activeOpacity={0.85}
                  >
                    {endMutation.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold text-base">
                        Completed
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEndSessionType("Terminated");
                      setEndSessionConfirmText("");
                      setEndSessionReason("");
                      setEndSessionModalVisible(true);
                    }}
                    disabled={endMutation.isPending}
                    className="flex-1 bg-red-600 py-3.5 rounded-lg items-center justify-center ml-2"
                    activeOpacity={0.85}
                  >
                    {endMutation.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold text-base">
                        Discontinued
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEndOptions(false)}
                  disabled={endMutation.isPending}
                  className="py-3.5 rounded-lg items-center justify-center bg-gray-400"
                  activeOpacity={0.85}
                >
                  <Text className="text-white font-semibold text-base">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!timerStartMs && showEndOptions && !isCancelled ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    if (hasOngoingReschedule) {
                      setShowOngoingRescheduleWarning(true);
                    } else {
                      setCancelModalVisible(true);
                    }
                  }}
                  className="mt-2 py-3.5 rounded-lg items-center justify-center border border-orange-600"
                  activeOpacity={0.85}
                >
                  <Text className="text-orange-700 font-semibold text-base">
                    Reschedule Session
                  </Text>
                </TouchableOpacity>
                {!isCurrentUserTherapist && (
                  <TouchableOpacity
                    onPress={() => {
                      if (hasOngoingReschedule) {
                        setShowOngoingRescheduleWarning(true);
                      } else {
                        setCancelOnlyModalVisible(true);
                      }
                    }}
                    className="mt-2 py-3.5 rounded-lg items-center justify-center border border-red-600"
                    activeOpacity={0.85}
                  >
                    <Text className="text-red-700 font-semibold text-base">
                      Cancel Session
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Cancel Session Modal (Direct Cancel) */}
      {(isCurrentUserPatient || isCurrentUserTherapist) && (
        <InAppModal
          visible={cancelOnlyModalVisible}
          large
          title="Cancel Session"
          message="Please select a reason for cancelling this session. This will cancel the session immediately."
          confirmText={
            cancelOnlyMutation.isPending ? "Cancelling..." : "Cancel Session"
          }
          cancelText="Go Back"
          showCancel
          onCancel={() => {
            if (cancelOnlyMutation.isPending) return;
            setCancelOnlyModalVisible(false);
            setCancelOnlyReason("");
            setSelectedCancelOnlyReasonId(null);
          }}
          onConfirm={() => {
            if (cancelOnlyMutation.isPending) return;
            if (!isReasonValid(selectedCancelOnlyReasonId, cancelOnlyReason)) {
              Alert.alert(
                "Reason Required",
                "Please select a reason for cancelling.",
              );
              return;
            }
            const r = getFinalReasonText(
              selectedCancelOnlyReasonId,
              cancelOnlyReason,
              isCurrentUserTherapist,
            );
            if (!r) {
              Alert.alert(
                "Reason Required",
                "Please provide a reason for cancelling.",
              );
              return;
            }
            cancelOnlyMutation.mutate({ reason: r });
          }}
          isConfirmDisabled={
            cancelOnlyMutation.isPending ||
            !isReasonValid(selectedCancelOnlyReasonId, cancelOnlyReason)
          }
          isDestructive
        >
          <CancellationReasonSelector
            isTherapist={isCurrentUserTherapist}
            selectedReasonId={selectedCancelOnlyReasonId}
            onSelectReason={setSelectedCancelOnlyReasonId}
            otherText={cancelOnlyReason}
            onOtherTextChange={setCancelOnlyReason}
          />
        </InAppModal>
      )}

      {/* Patient Reschedule Request Modal */}
      {isCurrentUserPatient && (
        <InAppModal
          visible={cancelModalVisible}
          large
          title="Request to Reschedule"
          message="Please select a reason for rescheduling this session. Your therapist will review your request and propose a new date."
          confirmText={
            requestCancellationMutation.isPending
              ? "Submitting..."
              : "Submit Request"
          }
          cancelText="Go Back"
          showCancel
          onCancel={() => {
            setCancelModalVisible(false);
            setCancelReason("");
            setSelectedCancelReasonId(null);
          }}
          onConfirm={() => {
            if (requestCancellationMutation.isPending) return;
            if (!isReasonValid(selectedCancelReasonId, cancelReason)) {
              Alert.alert(
                "Reason Required",
                "Please select a reason for rescheduling.",
              );
              return;
            }
            const r = getFinalReasonText(
              selectedCancelReasonId,
              cancelReason,
              false,
            );
            if (!r) {
              Alert.alert(
                "Reason Required",
                "Please provide a reason for rescheduling.",
              );
              return;
            }
            requestCancellationMutation.mutate({ reason: r });
          }}
          isConfirmDisabled={
            requestCancellationMutation.isPending ||
            !isReasonValid(selectedCancelReasonId, cancelReason)
          }
        >
          <CancellationReasonSelector
            isTherapist={false}
            selectedReasonId={selectedCancelReasonId}
            onSelectReason={setSelectedCancelReasonId}
            otherText={cancelReason}
            onOtherTextChange={setCancelReason}
          />
          <Text className="text-xs text-gray-500 mt-2">
            Note: Your therapist will review this request and propose a new
            schedule.
          </Text>
        </InAppModal>
      )}

      {/* Therapist Cancel Modal - Direct cancel with reschedule proposal */}
      {isCurrentUserTherapist && (
        <InAppModal
          visible={cancelModalVisible}
          large
          title="Reschedule Session"
          message="Select a reason and propose a new date and time for this session. The patient will need to accept your proposal."
          confirmText={cancelMutation.isPending ? "Sending..." : "Continue"}
          cancelText="Go Back"
          showCancel
          onCancel={() => {
            setCancelModalVisible(false);
            setShowRescheduleError(false);
            setCancelReason("");
            setSelectedCancelReasonId(null);
            // Reset reliever state
            setEnableReliever(false);
            setSelectedRelieverId(null);
            setRelieverSubstitutionReason("");
            setRelieverSearchQuery("");
            setShowAllRelievers(false);
          }}
          onConfirm={() => {
            if (cancelMutation.isPending) return;
            if (!isReasonValid(selectedCancelReasonId, cancelReason)) {
              Alert.alert(
                "Reason Required",
                "Please select a reason for rescheduling.",
              );
              return;
            }
            if (!selectedRescheduleStartAt) {
              setShowRescheduleError(true);
              return;
            }
            // If reliever is enabled but no therapist selected, show error
            if (enableReliever && !selectedRelieverId) {
              Alert.alert(
                "Reliever Required",
                "Please select a reliever therapist.",
              );
              return;
            }
            const r = getFinalReasonText(
              selectedCancelReasonId,
              cancelReason,
              true,
            );
            cancelMutation.mutate({
              reason: r || "Rescheduled",
              rescheduleStartAt: selectedRescheduleStartAt,
              rescheduleEndAt: selectedRescheduleEndAt,
              relieverTherapistId: enableReliever ? selectedRelieverId : null,
              relieverSubstitutionReason: enableReliever ? r : null,
            });
          }}
          isConfirmDisabled={
            cancelMutation.isPending ||
            !isReasonValid(selectedCancelReasonId, cancelReason) ||
            (enableReliever && !selectedRelieverId)
          }
        >
          <CancellationReasonSelector
            isTherapist={true}
            selectedReasonId={selectedCancelReasonId}
            onSelectReason={setSelectedCancelReasonId}
            otherText={cancelReason}
            onOtherTextChange={setCancelReason}
          />

          {/* Reliever Therapist Toggle */}
          <TouchableOpacity
            onPress={() => {
              setEnableReliever(!enableReliever);
              if (enableReliever) {
                // Reset reliever selections when disabling
                setSelectedRelieverId(null);
                setRelieverSearchQuery("");
                setShowAllRelievers(false);
              }
            }}
            className={`flex-row items-center p-3 mb-3 border-2 rounded-lg ${
              enableReliever
                ? "border-[#089769] bg-[#089769]/5"
                : "border-gray-300 bg-white"
            }`}
          >
            <View
              className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${
                enableReliever
                  ? "bg-[#089769] border-[#089769]"
                  : "border-gray-400"
              }`}
            >
              {enableReliever && (
                <Text className="text-white text-xs font-bold">✓</Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">
                👥 Suggest a Reliever Therapist
              </Text>
              <Text className="text-xs text-gray-600 mt-0.5">
                Assign another qualified therapist to continue the session
              </Text>
            </View>
          </TouchableOpacity>

          {/* Reliever Section - shown when enabled */}
          {enableReliever && (
            <View className="mb-3">
              <View className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <Text className="text-xs text-blue-700">
                  💡 The patient will see your rescheduling reason when
                  reviewing the reliever proposal.
                </Text>
              </View>

              <Text className="text-sm font-semibold text-gray-900 mb-2">
                Select Reliever Therapist
              </Text>

              {/* Search Input */}
              <View className="mb-3">
                <TextInput
                  placeholder="Search colleagues by name..."
                  placeholderTextColor="#9CA3AF"
                  value={relieverSearchQuery}
                  onChangeText={setRelieverSearchQuery}
                  className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900"
                />
              </View>

              {availableTherapists && availableTherapists.length > 0 ? (
                <View>
                  <ScrollView style={{ maxHeight: 250 }}>
                    {(() => {
                      // Filter therapists based on search query
                      const filteredTherapists = relieverSearchQuery.trim()
                        ? availableTherapists.filter(
                            (t) =>
                              t.id !== therapistId &&
                              (t.name
                                ?.toLowerCase()
                                .includes(relieverSearchQuery.toLowerCase()) ||
                                t.specializations?.some((s) =>
                                  s
                                    .toLowerCase()
                                    .includes(
                                      relieverSearchQuery.toLowerCase(),
                                    ),
                                )),
                          )
                        : availableTherapists.filter(
                            (t) => t.id !== therapistId,
                          );

                      // Show limited or all based on state
                      const displayTherapists = showAllRelievers
                        ? filteredTherapists
                        : filteredTherapists.slice(0, 5);

                      if (filteredTherapists.length === 0) {
                        return (
                          <View className="p-4 bg-gray-100 rounded-lg">
                            <Text className="text-sm text-gray-500 text-center">
                              No colleagues found matching {'"'}
                              {relieverSearchQuery}
                              {'"'}
                            </Text>
                          </View>
                        );
                      }

                      return (
                        <>
                          {displayTherapists.map((therapist) => (
                            <TouchableOpacity
                              key={therapist.id}
                              onPress={() =>
                                setSelectedRelieverId(
                                  selectedRelieverId === therapist.id
                                    ? null
                                    : therapist.id,
                                )
                              }
                              className={`flex-row items-center p-3 mb-2 border-2 rounded-lg ${
                                selectedRelieverId === therapist.id
                                  ? "border-[#089769] bg-[#089769]/5"
                                  : "border-gray-200 bg-white"
                              }`}
                            >
                              <View className="w-12 h-12 rounded-full bg-[#089769] items-center justify-center mr-3">
                                <Text className="text-white font-bold text-lg">
                                  {therapist.name?.charAt(0) || "?"}
                                </Text>
                              </View>
                              <View className="flex-1">
                                <Text className="text-sm font-semibold text-gray-900">
                                  {therapist.name || "Unknown"}
                                </Text>
                                <Text className="text-xs text-gray-600">
                                  {therapist.specializations?.[0] ||
                                    "Physical Therapist"}
                                </Text>
                                <View className="flex-row items-center mt-1">
                                  <Text className="text-xs text-amber-600 mr-1">
                                    ⭐
                                  </Text>
                                  <Text className="text-xs text-gray-600">
                                    {therapist.averageRating?.toFixed(1) ||
                                      "N/A"}{" "}
                                    ({therapist.ratingCount || 0} reviews)
                                  </Text>
                                </View>
                              </View>
                              {selectedRelieverId === therapist.id && (
                                <View className="w-6 h6 rounded-full bg-[#089769] items-center justify-center ml-2">
                                  <Text className="text-white font-bold text-sm">
                                    ✓
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}

                          {/* Show More/Less Button */}
                          {!relieverSearchQuery.trim() &&
                            filteredTherapists.length > 5 && (
                              <TouchableOpacity
                                onPress={() =>
                                  setShowAllRelievers(!showAllRelievers)
                                }
                                className="py-2 items-center"
                              >
                                <Text
                                  className="text-sm font-semibold"
                                  style={{ color: "#089769" }}
                                >
                                  {showAllRelievers
                                    ? `Show Less ↑`
                                    : `Show All (${filteredTherapists.length} colleagues) ↓`}
                                </Text>
                              </TouchableOpacity>
                            )}
                        </>
                      );
                    })()}
                  </ScrollView>
                </View>
              ) : (
                <View className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Text className="text-sm text-amber-700 text-center">
                    No colleagues in your network. Add trusted colleagues from
                    your profile to select them as relievers.
                  </Text>
                </View>
              )}

              <View className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <Text className="text-xs text-blue-700">
                  💡 The patient will be notified about the reliever therapist
                  and the new schedule. They can approve or decline the
                  proposal.
                </Text>
              </View>
            </View>
          )}

          <View className="mb-2">
            <TouchableOpacity
              onPress={() => {
                openReschedulePicker(true);
                setShowRescheduleError(false);
              }}
              className={`px-4 py-3 rounded-lg border-2 items-center ${
                selectedRescheduleStartAt
                  ? "border-[#089769] bg-[#089769]/5"
                  : "border-gray-300 bg-white"
              }`}
            >
              {selectedRescheduleStartAt ? (
                <View className="w-full">
                  <Text className="text-xs font-semibold text-[#089769] mb-1">
                    PROPOSED RESCHEDULE
                  </Text>
                  <Text className="text-base font-bold text-gray-900">
                    {formatDate(selectedRescheduleStartAt)}
                  </Text>
                  <Text className="text-sm font-semibold text-gray-700 mt-0.5">
                    {formatTime(selectedRescheduleStartAt)}
                  </Text>
                </View>
              ) : (
                <Text className="text-sm text-gray-700">
                  Add reschedule proposal
                </Text>
              )}
            </TouchableOpacity>
            {selectedRescheduleStartAt ? (
              <TouchableOpacity
                onPress={() => {
                  setSelectedRescheduleStartAt(null);
                  setSelectedRescheduleEndAt(null);
                }}
                className="mt-2"
              >
                <Text className="text-xs text-gray-500 underline">
                  Remove proposed reschedule
                </Text>
              </TouchableOpacity>
            ) : null}
            {showRescheduleError && !selectedRescheduleStartAt ? (
              <Text className="text-xs text-red-600 mt-2">
                Please add a reschedule proposal before cancelling.
              </Text>
            ) : null}
          </View>
        </InAppModal>
      )}

      {/* Ongoing Reschedule Warning Modal */}
      <InAppModal
        visible={showOngoingRescheduleWarning}
        title="Reschedule Already in Progress"
        message={
          isPendingCancellation
            ? "There is already a reschedule request pending review. Please wait for it to be processed before requesting another reschedule."
            : "There is already a reschedule proposal awaiting approval. Please wait for a response before initiating a new reschedule request."
        }
        confirmText="Understood"
        onConfirm={() => setShowOngoingRescheduleWarning(false)}
        onCancel={() => setShowOngoingRescheduleWarning(false)}
      />

      {/* Reschedule Picker Modal */}
      <Modal
        visible={reschedulePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReschedulePicker}
      >
        <View className="flex-1 bg-black/45 items-center justify-center p-5">
          <View className="w-full max-w-lg bg-white rounded-2xl p-5">
            <View className="mb-2.5">
              <Text className="text-lg font-bold text-gray-900">
                {reschedulePickerDay == null
                  ? "Reschedule: Select Day"
                  : `Reschedule: ${rescheduleSelectedDayLabel ?? ""}`}
              </Text>
            </View>

            {/* Week toggle */}
            {reschedulePickerDay == null ? (
              <View className="flex-row gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setReschedulePickerWeek(0)}
                  className={`px-3 py-2 rounded-lg ${
                    reschedulePickerWeek === 0 ? "bg-[#089769]" : "bg-gray-100"
                  }`}
                >
                  <Text
                    className={`${
                      reschedulePickerWeek === 0
                        ? "text-white"
                        : "text-gray-700"
                    } font-semibold text-sm`}
                  >
                    This Week
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setReschedulePickerWeek(1)}
                  className={`px-3 py-2 rounded-lg ${
                    reschedulePickerWeek === 1 ? "bg-[#089769]" : "bg-gray-100"
                  }`}
                >
                  <Text
                    className={`${
                      reschedulePickerWeek === 1
                        ? "text-white"
                        : "text-gray-700"
                    } font-semibold text-sm`}
                  >
                    Next Week
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Note about original time being disabled */}
            {originalSessionSlotKey ? (
              <View className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                <Text className="text-xs text-amber-700">
                  Note: The original cancelled time slot is disabled. Please
                  select a different time.
                </Text>
              </View>
            ) : null}

            {isSlotDataLoading ? (
              <View className="py-12 items-center justify-center">
                <ActivityIndicator color="#089769" />
                <Text className="text-xs text-gray-500 mt-2">
                  Loading availability...
                </Text>
              </View>
            ) : reschedulePickerDay == null ? (
              selectedRescheduleDayOptions.length === 0 ? (
                <View className="py-4">
                  <View className="items-center">
                    <Text className="text-sm text-gray-500 text-center mb-3">
                      No availability found for{" "}
                      {reschedulePickerWeek === 0 ? "this week" : "next week"}.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        closeReschedulePicker();
                        setCancelModalVisible(false);
                        router.push("/(therapist)/schedule" as any);
                      }}
                      className="mt-2 py-2 items-center"
                    >
                      <Text className="text-sm text-[#089769] font-medium">
                        Need more slots? Go to Schedule →
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <ScrollView style={{ maxHeight: 360 }}>
                    {selectedRescheduleDayOptions.map((day) => {
                      const isOriginalDay = Boolean(
                        originalSessionSlotKey &&
                        String(originalSessionSlotKey).startsWith(
                          `${day.dow}-`,
                        ),
                      );

                      // Calculate slot availability details
                      const now = new Date();
                      const today = now.getDay();

                      let availableCount = 0;
                      let pastCount = 0;
                      let bookedCount = 0;

                      day.slots.forEach((slot) => {
                        const slotKey = `${day.dow}-${slot.start}`;
                        const isBooked = conflictKeySet.has(slotKey);
                        const isOriginal = slotKey === originalSessionSlotKey;

                        // Check if past (only for "This Week" and today)
                        let isPastSlot = false;
                        if (reschedulePickerWeek === 0 && day.dow === today) {
                          const [slotHour, slotMin] = slot.start
                            .split(":")
                            .map(Number);
                          const slotDate = new Date();
                          slotDate.setHours(slotHour, slotMin, 0, 0);
                          isPastSlot = slotDate < now;
                        }

                        if (isBooked || isOriginal) bookedCount++;
                        else if (isPastSlot) pastCount++;
                        else availableCount++;
                      });

                      const hasNoAvailableSlots = availableCount === 0;
                      const allSlotsPassed =
                        pastCount > 0 &&
                        bookedCount === 0 &&
                        availableCount === 0;
                      const allSlotsBooked =
                        bookedCount > 0 &&
                        pastCount === 0 &&
                        availableCount === 0;
                      const mixedUnavailable =
                        hasNoAvailableSlots && pastCount > 0 && bookedCount > 0;

                      // Calculate if this day is in the past (before today)
                      const dayIsPast = (() => {
                        const startOfToday = new Date();
                        startOfToday.setHours(0, 0, 0, 0);
                        const targetDate = new Date(day.targetDate);
                        targetDate.setHours(0, 0, 0, 0);
                        return targetDate < startOfToday;
                      })();

                      // Determine the status label
                      let statusLabel = "";
                      if (dayIsPast) {
                        statusLabel = "Past";
                      } else if (allSlotsPassed) {
                        statusLabel = "All slots passed";
                      } else if (allSlotsBooked) {
                        statusLabel = "Fully booked";
                      } else if (mixedUnavailable) {
                        statusLabel = "No slots available";
                      } else if (hasNoAvailableSlots) {
                        statusLabel = "No slots available";
                      }

                      // Only disable for past days or fully booked
                      const isClickDisabled = dayIsPast || allSlotsBooked;
                      const isGreyedOut = dayIsPast || allSlotsBooked;

                      return (
                        <TouchableOpacity
                          key={day.dow}
                          className={`flex-row justify-between items-center px-3 py-2 border rounded-lg mb-2 ${
                            isGreyedOut
                              ? "border-gray-100 bg-gray-50"
                              : allSlotsPassed
                                ? "border-amber-200 bg-amber-50"
                                : isOriginalDay
                                  ? "border-blue-200 bg-blue-50"
                                  : "border-gray-200 bg-white"
                          }`}
                          activeOpacity={isClickDisabled ? 1 : 0.8}
                          disabled={isClickDisabled}
                          onPress={() => {
                            if (!isClickDisabled) {
                              setReschedulePickerDay(day.dow);
                              setSelectedDayTargetDate(day.targetDate);
                            }
                          }}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              isGreyedOut
                                ? "text-gray-400"
                                : allSlotsPassed
                                  ? "text-amber-700"
                                  : "text-gray-900"
                            }`}
                          >
                            {dowToDayLabel(day.dow)}
                          </Text>
                          <View className="flex-row items-center gap-1.5">
                            {day.dateLabel ? (
                              <Text
                                className={`text-xs ${
                                  isGreyedOut
                                    ? "text-gray-400"
                                    : "text-gray-500"
                                }`}
                              >
                                ({day.dateLabel})
                              </Text>
                            ) : null}
                            {statusLabel ? (
                              <Text
                                className={`text-xs italic ${
                                  allSlotsPassed
                                    ? "text-amber-600"
                                    : "text-gray-400"
                                }`}
                              >
                                {statusLabel}
                              </Text>
                            ) : (
                              <>
                                <Text className="text-xs text-gray-500">
                                  {availableCount} slot
                                  {availableCount !== 1 ? "s" : ""}
                                </Text>
                                <ChevronRight size={16} color="#4B5563" />
                              </>
                            )}
                            {allSlotsPassed && !isClickDisabled && (
                              <ChevronRight size={16} color="#D97706" />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => {
                      closeReschedulePicker();
                      setCancelModalVisible(false);
                      router.push("/(therapist)/schedule" as any);
                    }}
                    className="mt-3 py-2 items-center"
                  >
                    <Text className="text-xs text-[#089769] font-medium">
                      Need more slots? Go to Schedule →
                    </Text>
                  </TouchableOpacity>
                </>
              )
            ) : rescheduleCurrentDaySlots.length === 0 ? (
              <Text className="text-xs text-gray-500">
                No 1-hour slots available on {rescheduleSelectedDayLabel}.
              </Text>
            ) : (
              <>
                {/* Banner when all slots have passed */}
                {(() => {
                  const now = new Date();
                  const today = now.getDay();
                  if (
                    reschedulePickerWeek === 0 &&
                    reschedulePickerDay === today
                  ) {
                    const allPast = rescheduleCurrentDaySlots.every((slot) => {
                      const [slotHour, slotMin] = slot.start
                        .split(":")
                        .map(Number);
                      const slotDate = new Date();
                      slotDate.setHours(slotHour, slotMin, 0, 0);
                      return slotDate < now;
                    });
                    if (allPast) {
                      return (
                        <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                          <Text className="text-sm text-amber-700 font-medium mb-2">
                            All slots for today have passed
                          </Text>
                          <TouchableOpacity
                            onPress={() => setReschedulePickerWeek(1)}
                            className="bg-amber-600 px-3 py-2 rounded-lg self-start"
                          >
                            <Text className="text-white text-xs font-semibold">
                              View Next Week
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                  }
                  return null;
                })()}
                <ScrollView style={{ maxHeight: 360 }}>
                  <View className="flex-row flex-wrap gap-2">
                    {rescheduleCurrentDaySlots.map((slot) => {
                      const slotKey = `${reschedulePickerDay}-${slot.start}`;
                      const isTaken = conflictKeySet.has(slotKey);
                      const isOriginalSlot = slotKey === originalSessionSlotKey;

                      // Check if this slot is in the past
                      const now = new Date();
                      const today = now.getDay();
                      let isPastSlot = false;
                      if (
                        reschedulePickerWeek === 0 &&
                        reschedulePickerDay === today
                      ) {
                        const [slotHour, slotMin] = slot.start
                          .split(":")
                          .map(Number);
                        const slotDate = new Date();
                        slotDate.setHours(slotHour, slotMin, 0, 0);
                        isPastSlot = slotDate < now;
                      }

                      const isDisabled =
                        isTaken || isOriginalSlot || isPastSlot;
                      const label = `${hhmmTo12(slot.start)} - ${hhmmTo12(
                        slot.end,
                      )}`;
                      const isSelected =
                        !isDisabled &&
                        pendingRescheduleSlot?.dayDow === reschedulePickerDay &&
                        pendingRescheduleSlot?.start === slot.start &&
                        pendingRescheduleSlot?.end === slot.end;
                      const chipClasses = isOriginalSlot
                        ? "bg-amber-100 border-amber-300"
                        : isPastSlot
                          ? "bg-gray-100 border-gray-200"
                          : isTaken
                            ? "bg-red-100 border-red-200"
                            : isSelected
                              ? "bg-[#089769] border-[#089769]"
                              : "bg-gray-100 border-transparent";
                      return (
                        <TouchableOpacity
                          key={slotKey}
                          disabled={isDisabled}
                          activeOpacity={isDisabled ? 1 : 0.85}
                          onPress={() => {
                            if (isDisabled) return;
                            if (isSelected) {
                              setPendingRescheduleSlot(null);
                              return;
                            }
                            const dayDow = reschedulePickerDay!;

                            if (!selectedDayTargetDate) {
                              console.error(
                                "[SlotSelection] ERROR: No selectedDayTargetDate set!",
                              );
                              return;
                            }

                            const targetDate = new Date(selectedDayTargetDate);
                            targetDate.setHours(0, 0, 0, 0);

                            setPendingRescheduleSlot({
                              dayDow,
                              start: slot.start,
                              end: slot.end,
                              label,
                              targetDate,
                            });
                          }}
                          className={`py-2 px-3 rounded-full border ${chipClasses}`}
                          style={
                            isDisabled
                              ? { opacity: 0.7 }
                              : isSelected
                                ? {
                                    shadowColor: "#089769",
                                    shadowOpacity: 0.35,
                                    shadowRadius: 6,
                                  }
                                : undefined
                          }
                        >
                          <Text
                            className={`text-xs font-semibold ${
                              isOriginalSlot
                                ? "text-amber-600"
                                : isPastSlot
                                  ? "text-gray-400"
                                  : isTaken
                                    ? "text-red-500"
                                    : isSelected
                                      ? "text-white"
                                      : "text-gray-900"
                            }`}
                          >
                            {label}
                          </Text>
                          {isOriginalSlot ? (
                            <Text className="text-[10px] text-amber-600 mt-1 text-center">
                              Original
                            </Text>
                          ) : isPastSlot ? (
                            <Text className="text-[10px] text-gray-400 mt-1 text-center">
                              Past
                            </Text>
                          ) : isTaken ? (
                            <Text className="text-[10px] text-red-500 mt-1 text-center">
                              Booked
                            </Text>
                          ) : isSelected ? (
                            <Text className="text-[10px] text-white mt-1 text-center">
                              Selected
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            <View className="h-3" />
            {reschedulePickerDay == null ? (
              <TouchableOpacity
                onPress={closeReschedulePicker}
                className="self-end bg-gray-800 px-3.5 py-2.5 rounded-lg"
              >
                <Text className="text-white font-semibold">Close</Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row justify-end gap-2">
                <TouchableOpacity
                  onPress={() => setReschedulePickerDay(null)}
                  className="px-3.5 py-2.5 rounded-lg border border-gray-300"
                >
                  <Text className="text-gray-700 font-semibold">Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={
                    !pendingRescheduleSlot ||
                    pendingRescheduleSlot.dayDow !== reschedulePickerDay ||
                    rescheduleMutation.isPending
                  }
                  onPress={() => {
                    if (!pendingRescheduleSlot) return;
                    const dayName = dowToDayLabel(pendingRescheduleSlot.dayDow);
                    if (!dayName) return;
                    // Include the actual date in the label
                    const dateLabel =
                      pendingRescheduleSlot.targetDate.toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                        },
                      );
                    const dayLabel = `${dayName}, ${dateLabel}`;
                    setConfirmRescheduleModal({
                      dayLabel,
                      label: pendingRescheduleSlot.label,
                    });
                  }}
                  className={`px-3.5 py-2.5 rounded-lg ${
                    pendingRescheduleSlot &&
                    pendingRescheduleSlot.dayDow === reschedulePickerDay
                      ? "bg-[#089769]"
                      : "bg-[#089769]/40"
                  }`}
                  style={{
                    opacity:
                      !pendingRescheduleSlot ||
                      pendingRescheduleSlot.dayDow !== reschedulePickerDay
                        ? 0.6
                        : 1,
                  }}
                >
                  <Text className="text-white font-semibold">
                    {rescheduleMutation.isPending
                      ? "Processing..."
                      : "Reschedule"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Confirm Reschedule Modal */}
      <InAppModal
        visible={confirmRescheduleModal != null}
        title="Confirm Reschedule"
        message={
          confirmRescheduleModal
            ? `Reschedule this session to ${confirmRescheduleModal.dayLabel} at ${confirmRescheduleModal.label}? The patient will be notified.`
            : undefined
        }
        confirmText={
          rescheduleMutation.isPending ? "Rescheduling..." : "Yes, reschedule"
        }
        cancelText="Go back"
        showCancel
        isConfirmDisabled={rescheduleMutation.isPending}
        onCancel={() => setConfirmRescheduleModal(null)}
        onConfirm={() => {
          if (!confirmRescheduleModal || !pendingRescheduleSlot) {
            Alert.alert("Error", "Missing reschedule data. Please try again.");
            return;
          }

          // Use the stored target date from the slot selection
          const targetDate = new Date(pendingRescheduleSlot.targetDate);

          const [startHours, startMinutes] = pendingRescheduleSlot.start
            .split(":")
            .map(Number);
          const [endHours, endMinutes] = pendingRescheduleSlot.end
            .split(":")
            .map(Number);

          const newStartAt = new Date(targetDate);
          newStartAt.setHours(startHours, startMinutes, 0, 0);

          const newEndAt = new Date(targetDate);
          newEndAt.setHours(endHours, endMinutes, 0, 0);

          // Format date and time for log message
          const dateStr = targetDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          const timeStr = pendingRescheduleSlot.start;

          if (isPickingRescheduleForCancel) {
            // Store the proposed reschedule for the cancel flow
            setSelectedRescheduleStartAt(newStartAt.toISOString());
            setSelectedRescheduleEndAt(newEndAt.toISOString());
            setIsPickingRescheduleForCancel(false);
            setConfirmRescheduleModal(null);
            closeReschedulePicker();

            addLog({
              level: "info",
              category: "Session",
              message: `Reschedule proposal set for ${dateStr} at ${timeStr}`,
              sessionId,
            });
          } else if (isPickingRescheduleForAcknowledge) {
            // Proposing reschedule in response to patient's request
            acknowledgeCancellationMutation.mutate({
              rescheduleStartAt: newStartAt.toISOString(),
              rescheduleEndAt: newEndAt.toISOString(),
            });
            setConfirmRescheduleModal(null);
            closeReschedulePicker();

            addLog({
              level: "success",
              category: "Session",
              message: `Reschedule proposal sent for ${dateStr} at ${timeStr}`,
              sessionId,
            });
          } else {
            // Regular reschedule flow
            rescheduleMutation.mutate({
              newStartAt: newStartAt.toISOString(),
              newEndAt: newEndAt.toISOString(),
            });

            addLog({
              level: "success",
              category: "Session",
              message: `Session rescheduled to ${dateStr} at ${timeStr}`,
              sessionId,
            });

            setConfirmRescheduleModal(null);
          }
        }}
      />

      {/* End Session Confirmation Modal - Type to Confirm */}
      <Modal
        visible={endSessionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEndSessionModalVisible(false);
          setEndSessionType(null);
          setEndSessionConfirmText("");
          setEndSessionReason("");
        }}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-5">
          <View className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
            {/* Header with warning icon */}
            <View className="items-center mb-4">
              <View
                className="w-14 h-14 rounded-full items-center justify-center mb-3"
                style={{
                  backgroundColor:
                    endSessionType === "Completed" ? "#DEF7EC" : "#FEE2E2",
                }}
              >
                <Text style={{ fontSize: 28 }}>
                  {endSessionType === "Completed" ? "✓" : "⚠️"}
                </Text>
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center">
                {endSessionType === "Completed"
                  ? "Complete Treatment"
                  : "Discontinued Treatment"}
              </Text>
              <Text className="text-sm text-gray-500 text-center mt-2">
                {endSessionType === "Completed"
                  ? "Mark this treatment as successfully completed. The patient has achieved their treatment goals."
                  : "End this treatment early. The patient will be notified and all future sessions will be cancelled."}
              </Text>
            </View>

            {/* Warning box */}
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <Text className="text-xs text-amber-800 font-medium text-center">
                ⚠️ This action cannot be undone. Please confirm you want to
                proceed.
              </Text>
            </View>

            {/* Reason input */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Reason{" "}
              {endSessionType === "Terminated" ? "(required)" : "(optional)"}
            </Text>
            <TextInput
              placeholder={
                endSessionType === "Completed"
                  ? "e.g., Patient achieved full range of motion..."
                  : "e.g., Patient requested to stop, unable to continue..."
              }
              placeholderTextColor="#9CA3AF"
              value={endSessionReason}
              onChangeText={setEndSessionReason}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
              className="border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
            />

            {/* Type to confirm */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Type <Text className="font-bold text-red-600">CONFIRM</Text> to
              proceed
            </Text>
            <TextInput
              placeholder="Type CONFIRM here"
              placeholderTextColor="#9CA3AF"
              value={endSessionConfirmText}
              onChangeText={setEndSessionConfirmText}
              autoCapitalize="characters"
              className="border-2 rounded-xl px-4 py-3 text-base text-gray-900 font-semibold mb-5 text-center"
              style={{
                borderColor:
                  endSessionConfirmText.toUpperCase() === "CONFIRM"
                    ? "#089769"
                    : "#D1D5DB",
                backgroundColor:
                  endSessionConfirmText.toUpperCase() === "CONFIRM"
                    ? "#ECFDF5"
                    : "#FFFFFF",
              }}
            />

            {/* Action buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setEndSessionModalVisible(false);
                  setEndSessionType(null);
                  setEndSessionConfirmText("");
                  setEndSessionReason("");
                }}
                className="flex-1 py-3.5 rounded-xl border border-gray-300 items-center justify-center"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={
                  endMutation.isPending ||
                  endSessionConfirmText.toUpperCase() !== "CONFIRM" ||
                  (endSessionType === "Terminated" && !endSessionReason.trim())
                }
                onPress={async () => {
                  if (!endSessionType) return;
                  await endMutation.mutateAsync({
                    status: endSessionType,
                    reason: endSessionReason.trim() || undefined,
                  });
                  setEndSessionModalVisible(false);
                  setEndSessionType(null);
                  setEndSessionConfirmText("");
                  setEndSessionReason("");
                  setShowEndOptions(false);
                }}
                className="flex-1 py-3.5 rounded-xl items-center justify-center"
                style={{
                  backgroundColor:
                    endSessionConfirmText.toUpperCase() === "CONFIRM" &&
                    (endSessionType !== "Terminated" || endSessionReason.trim())
                      ? endSessionType === "Completed"
                        ? "#089769"
                        : "#DC2626"
                      : "#D1D5DB",
                  opacity:
                    endMutation.isPending ||
                    endSessionConfirmText.toUpperCase() !== "CONFIRM" ||
                    (endSessionType === "Terminated" &&
                      !endSessionReason.trim())
                      ? 0.6
                      : 1,
                }}
              >
                {endMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">
                    {endSessionType === "Completed"
                      ? "Complete"
                      : "Discontinued"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rate Contract Button - shown when contract is ended and therapist hasn't rated */}
      {showRateButton && (
        <View className="px-4.5 py-4 border-t border-gray-100">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setRatingModalVisible(true)}
            style={{ backgroundColor: "#089769" }}
            className="py-3.5 rounded-xl items-center justify-center"
          >
            <Text className="text-white font-semibold text-base">
              Rate Contract
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Rating Modal - With WebHeader for Desktop */}
      <Modal
        visible={ratingModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View
          className="flex-1"
          style={{ backgroundColor: isDesktop ? "#e6f5f0" : "#F9FAFB" }}
        >
          {/* Desktop: WebHeader, Mobile: Simple Header */}
          {isDesktop ? (
            <WebHeader />
          ) : (
            <SafeAreaView edges={["top"]} className="bg-white">
              <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
                <TouchableOpacity
                  onPress={() => {
                    setRatingModalVisible(false);
                    setRatingScore(null);
                    setRatingComment("");
                  }}
                  className="p-2 -ml-2"
                >
                  <ArrowLeft size={24} color="#111827" />
                </TouchableOpacity>
                <Text className="text-lg font-bold text-gray-900 ml-2">
                  Rate Contract
                </Text>
              </View>
            </SafeAreaView>
          )}

          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              isDesktop ? { paddingBottom: 40 } : undefined
            }
          >
            {/* Desktop: Centered container with max-width */}
            <View
              className={
                isDesktop ? "w-full max-w-screen-md mx-auto px-6 pt-8" : ""
              }
            >
              {/* Desktop: Page Header */}
              {isDesktop && (
                <View className="flex-row items-center mb-6">
                  <TouchableOpacity
                    className="flex-row items-center px-4 py-2 rounded-xl bg-white border border-emerald-100 mr-4"
                    onPress={() => {
                      setRatingModalVisible(false);
                      setRatingScore(null);
                      setRatingComment("");
                    }}
                  >
                    <ArrowLeft size={18} color="#089769" />
                    <Text
                      style={{ color: "#089769" }}
                      className="font-semibold ml-2"
                    >
                      Back
                    </Text>
                  </TouchableOpacity>
                  <View className="flex-1">
                    <Text
                      style={{ color: "#089769" }}
                      className="text-xs font-semibold uppercase tracking-wide mb-1"
                    >
                      Feedback
                    </Text>
                    <Text className="text-2xl font-bold text-gray-900">
                      Rate Contract
                    </Text>
                  </View>
                </View>
              )}

              {/* Patient Info Card */}
              <View
                className={`bg-white rounded-xl border border-gray-200 p-4 ${
                  isDesktop ? "" : "mx-4 mt-4"
                }`}
              >
                <View className="flex-row items-center">
                  {/* Avatar with initials */}
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "#E0E7FF" }}
                  >
                    <Text
                      className="text-base font-bold"
                      style={{ color: "#4F46E5" }}
                    >
                      {(patientName || "P")
                        .split(" ")
                        .map((n) => n[0]?.toUpperCase() || "")
                        .join("")
                        .slice(0, 2)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">
                      {patientName || "Patient"}
                    </Text>
                    <Text className="text-sm text-gray-500">
                      {detail?.conditionCase || "Session"}
                    </Text>
                  </View>
                </View>

                {/* Contract ended date */}
                <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100">
                  <Calendar size={16} color="#6B7280" />
                  <Text className="text-sm text-gray-500 ml-2">
                    Contract ended on{" "}
                    {new Date().toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </View>

              {/* Rating Section */}
              <View
                className={`bg-white rounded-xl border border-gray-200 p-5 ${
                  isDesktop ? "mt-4" : "mx-4 mt-4"
                }`}
              >
                <Text className="text-base font-semibold text-gray-900 mb-1">
                  How was your experience?
                </Text>
                <Text className="text-sm text-gray-500 mb-6">
                  Your feedback helps us improve our service
                </Text>

                {/* Star Rating */}
                <View className="items-center mb-2">
                  <View className="flex-row justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const selected = (ratingScore ?? 0) >= n;
                      return (
                        <TouchableOpacity
                          key={n}
                          onPress={() => setRatingScore(n)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Star
                            size={36}
                            strokeWidth={1.5}
                            color={selected ? "#F59E0B" : "#D1D5DB"}
                            fill={selected ? "#F59E0B" : "none"}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View className="flex-row justify-between w-full mt-2 px-1">
                    <Text className="text-xs text-gray-400">Poor</Text>
                    <Text className="text-xs text-gray-400">Excellent</Text>
                  </View>
                </View>

                {/* Additional Comments */}
                <View className="mt-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    Additional Comments (Optional)
                  </Text>
                  <TextInput
                    placeholder="Share your experience with this patient..."
                    placeholderTextColor="#9CA3AF"
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white"
                    style={{ minHeight: 100 }}
                  />
                </View>
              </View>

              {/* Desktop: Submit Button inside scroll area */}
              {isDesktop && (
                <View className="mt-6">
                  <TouchableOpacity
                    onPress={() => ratingMutation.mutate()}
                    disabled={ratingMutation.isPending || ratingScore == null}
                    style={{
                      backgroundColor:
                        ratingScore != null ? "#089769" : "#9CA3AF",
                      opacity: ratingMutation.isPending ? 0.7 : 1,
                    }}
                    className="py-4 rounded-xl items-center justify-center"
                  >
                    {ratingMutation.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold text-base">
                        Submit Rating
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Mobile: Fixed Submit Button at bottom */}
          {!isDesktop && (
            <SafeAreaView
              edges={["bottom"]}
              className="bg-white border-t border-gray-100"
            >
              <View className="px-4 py-4">
                <TouchableOpacity
                  onPress={() => ratingMutation.mutate()}
                  disabled={ratingMutation.isPending || ratingScore == null}
                  style={{
                    backgroundColor:
                      ratingScore != null ? "#089769" : "#9CA3AF",
                    opacity: ratingMutation.isPending ? 0.7 : 1,
                  }}
                  className="py-4 rounded-xl items-center justify-center"
                >
                  {ratingMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold text-base">
                      Submit Rating
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          )}
        </View>
      </Modal>

      <InAppModal
        visible={relieverAcceptModalVisible}
        title="Accept Reliever Request"
        message="Are you sure you want to accept this reliever request? You will be assigned as the substitute therapist for this session."
        confirmText="Accept"
        cancelText="Cancel"
        showCancel={true}
        onConfirm={() => {
          acceptRelieverMutation.mutate();
          setRelieverAcceptModalVisible(false);
        }}
        onCancel={() => setRelieverAcceptModalVisible(false)}
        isDestructive={false}
        variant="confirm"
      />
    </SafeAreaView>
  );
}
