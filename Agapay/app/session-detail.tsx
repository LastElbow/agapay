import Mapbox from "@rnmapbox/maps";
import apiClient from "@/api/client";
import { getTokens } from "@/src/auth/session";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  IdCard,
  MapPin,
  Star,
  User,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import InAppModal from "@/src/components/InAppModal";
import EmbeddedLocationMap from "@/src/components/EmbeddedLocationMap";
import CancellationReasonSelector, {
  getFinalReasonText,
  isReasonValid,
} from "@/src/components/CancellationReasonSelector";
import { submitRating, submitPatientRating } from "@/src/services/ratings";
import {
  allSessionsQueryKey,
  approveReschedule,
  cancelSession,
  completeSession,
  declineReschedule,
  fetchSessionDetail,
  rescheduleSession,
  sessionDetailQueryKey,
  upcomingSessionsQueryKey,
} from "@/src/services/sessions";
import {
  fetchTherapistById,
  fetchTherapistByUserId,
  fetchMyTherapist,
  therapistDetailQueryKey,
  type TherapistDetailDto,
} from "@/src/services/therapists";
import { useRole } from "@/src/providers/RoleProvider";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { formatPeso, parseMoneyString } from "@/src/utils/money";
import { buildSessionProposalChatContent } from "@/src/features/chat/core/sessionProposal";
import { toDisplayStatus } from "@/src/utils/statusLabels";
import {
  fetchTherapistAvailability,
  type TherapistAvailability,
  fetchBookedIntervals,
} from "@/src/services/availability";
import { discretizeAvailabilityForWeek } from "@/src/features/scheduling/core/slotting";
import { buildConflictKeySet } from "@/src/features/scheduling/core/conflicts";
import {
  fetchRecurringCommitments,
  getContractsForPatient,
  type RecurringCommitment,
} from "@/src/services/contracts";
import { useSessionRealtime } from "@/src/hooks/useSessionRealtime";
import { getUserFacingSessionsErrorMessage } from "@/src/features/sessions/core/userFacingErrors";

type ContractSummary = {
  id: number;
  physicalTherapistId: number;
  status: string;
};

// Block creating new proposals if there's already an active, pending, or draft contract
const CONTRACT_BLOCKING_STATUSES = new Set([
  "pendingconfirmation",
  "active",
  "draft",
]);
const CONTRACT_CONCLUDED_STATUSES = new Set([
  "cancelled",
  "completed",
  "expired",
  "terminated",
]);

const normalizeContractStatus = (status: string | null | undefined) =>
  String(status ?? "")
    .trim()
    .toLowerCase();

const isBlockingContractStatus = (status: string | null | undefined) => {
  const normalized = normalizeContractStatus(status);
  if (!normalized) return false;
  if (CONTRACT_CONCLUDED_STATUSES.has(normalized)) return false;
  return CONTRACT_BLOCKING_STATUSES.has(normalized);
};

const isConcludedContractStatus = (status: string | null | undefined) => {
  const normalized = normalizeContractStatus(status);
  if (!normalized) return false;
  return CONTRACT_CONCLUDED_STATUSES.has(normalized);
};

type Params = {
  therapistName?: string;
  therapistLicense?: string;
  patientName?: string;
  patientAge?: string;
  caseTitle?: string;
  address?: string;
  barangay?: string;
  barangayName?: string;
  lat?: string;
  lng?: string;
  day?: string;
  timeRange?: string;
  duration?: string;
  fee?: string;
  locFee?: string;
  toolsFee?: string;
  total?: string;
  referralName?: string;
  referralUri?: string;
  editable?: string; // "1" to enable therapist editing
  conversationId?: string;
  profileId?: string;
  sessionId?: string;
  contractId?: string;
  startAt?: string;
  endAt?: string;
};

const SLOT_DURATION_MINUTES = 60;

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { selectedRole } = useRole();
  const isEditable = params.editable === "true";
  const rawSessionId = params.sessionId ? Number(params.sessionId) : NaN;
  const sessionId = Number.isFinite(rawSessionId) ? rawSessionId : undefined;
  const rawContractId = params.contractId ? Number(params.contractId) : NaN;
  const contractId = Number.isFinite(rawContractId) ? rawContractId : undefined;
  const profileIdParam = params.profileId;
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  // Initialize Mapbox token on native only
  if (
    Platform.OS !== "web" &&
    Mapbox &&
    typeof (Mapbox as any).setAccessToken === "function"
  ) {
    Mapbox.setAccessToken(
      (Constants.expoConfig as any)?.extra?.mapboxAccessToken || "",
    );
  }

  const [resolved, setResolved] = useState<{
    address?: string;
    barangay?: string;
    lat?: number;
    lng?: number;
  }>({});
  const {
    data: sessionDetail,
    isLoading: isSessionDetailLoading,
    isFetching: isSessionDetailFetching,
    isError: isSessionDetailError,
    error: sessionDetailError,
    refetch: refetchSessionDetail,
  } = useQuery({
    queryKey: sessionDetailQueryKey(sessionId ?? 0),
    queryFn: () => fetchSessionDetail(sessionId!),
    enabled: !!sessionId,
    refetchOnWindowFocus: false, // Disabled to prevent unmounting during button press
    refetchOnMount: false, // Disabled to prevent unnecessary refetches
    refetchOnReconnect: true,
    staleTime: 30000, // 30 seconds - rely on SignalR for real-time updates instead
  });

  // Enable real-time updates for this session
  useSessionRealtime(sessionId);

  // Try to resolve a contract id even when this screen was opened
  // without a sessionId/contractId (e.g., from Messages propose flow)
  const [fallbackContract, setFallbackContract] = useState<{
    id: number;
    status: string;
  } | null>(null);

  const resolvedContractId =
    sessionDetail?.contractId ?? contractId ?? fallbackContract?.id;
  const isSessionDetailBusy = isSessionDetailLoading || isSessionDetailFetching;
  useEffect(() => {
    if (sessionDetail) {
      console.log("sessionDetail:", JSON.stringify(sessionDetail, null, 2));
    }
  }, [sessionDetail]);

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedCancelReasonId, setSelectedCancelReasonId] = useState<
    string | null
  >(null);
  const [cancelSessionModalVisible, setCancelSessionModalVisible] =
    useState(false);
  const [cancelSessionReason, setCancelSessionReason] = useState("");
  const [selectedCancelSessionReasonId, setSelectedCancelSessionReasonId] =
    useState<string | null>(null);
  const [showEndContractOptions, setShowEndContractOptions] = useState(false);
  const [isEndingContract, setIsEndingContract] = useState(false);
  // End Session confirmation modal state
  const [endSessionModalVisible, setEndSessionModalVisible] = useState(false);
  const [endSessionType, setEndSessionType] = useState<
    "Completed" | "Terminated" | null
  >(null);
  const [endSessionConfirmText, setEndSessionConfirmText] = useState("");
  const [endSessionReason, setEndSessionReason] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasSentConfirm, setHasSentConfirm] = useState(
    () => isSessionDetailBusy || !sessionDetail,
  );
  const [confirmInfoModalVisible, setConfirmInfoModalVisible] = useState(false);
  const [activeSessionWarningVisible, setActiveSessionWarningVisible] =
    useState(false);
  const [conflictWithOtherTherapist, setConflictWithOtherTherapist] =
    useState(false);
  const [schedulePickerVisible, setSchedulePickerVisible] = useState(false);
  const [schedulePickerDay, setSchedulePickerDay] = useState<number | null>(
    null,
  );
  const [pendingSlotSelection, setPendingSlotSelection] = useState<{
    dayDow: number;
    start: string;
    end: string;
    label: string;
  } | null>(null);
  const [confirmSlotModal, setConfirmSlotModal] = useState<{
    dayLabel: string;
    label: string;
  } | null>(null);
  const pendingConfirmationContracts = useRef<Set<number>>(new Set());
  // Cache contract ID to prevent unmounting of End Session section during refetch
  const contractIdCache = useRef<number | null>(null);
  const [pendingPatientAction, setPendingPatientAction] = useState<
    "accept" | "decline" | null
  >(null);

  // Rating state (patient)
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [hasRated, setHasRated] = useState(false);

  // Reschedule state (therapist only - for cancelled sessions)
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [reschedulePickerVisible, setReschedulePickerVisible] = useState(false);
  const [reschedulePickerDay, setReschedulePickerDay] = useState<number | null>(
    null,
  );
  const [pendingRescheduleSlot, setPendingRescheduleSlot] = useState<{
    dayDow: number;
    start: string;
    end: string;
    label: string;
  } | null>(null);
  const [confirmRescheduleModal, setConfirmRescheduleModal] = useState<{
    dayLabel: string;
    label: string;
  } | null>(null);
  const [selectedRescheduleStartAt, setSelectedRescheduleStartAt] = useState<
    string | null
  >(null);
  const [selectedRescheduleEndAt, setSelectedRescheduleEndAt] = useState<
    string | null
  >(null);
  const [isPickingRescheduleForCancel, setIsPickingRescheduleForCancel] =
    useState(false);

  // Update hasRated based on sessionDetail from backend
  useEffect(() => {
    if (sessionDetail) {
      const isTherapist =
        (selectedRole || "").toLowerCase() === "physicaltherapist";
      if (isTherapist) {
        setHasRated(sessionDetail.hasBeenRatedByTherapist ?? false);
      } else {
        setHasRated(sessionDetail.hasBeenRatedByPatient ?? false);
      }
    }
  }, [sessionDetail, selectedRole]);

  const openSchedulePicker = useCallback(() => {
    setConfirmSlotModal(null);
    setPendingSlotSelection(null);
    setSchedulePickerDay(null);
    setSchedulePickerVisible(true);
  }, []);

  const closeSchedulePicker = useCallback(() => {
    setSchedulePickerVisible(false);
    setSchedulePickerDay(null);
    setConfirmSlotModal(null);
    setPendingSlotSelection(null);
  }, []);

  // Reschedule picker handlers
  const openReschedulePicker = useCallback((maybeForCancel?: any) => {
    const forCancel =
      typeof maybeForCancel === "boolean" ? maybeForCancel : false;
    setRescheduleMode(true);
    setConfirmRescheduleModal(null);
    setPendingRescheduleSlot(null);
    setReschedulePickerDay(null);
    setIsPickingRescheduleForCancel(forCancel);
    setReschedulePickerVisible(true);
  }, []);

  const closeReschedulePicker = useCallback(() => {
    setReschedulePickerVisible(false);
    setReschedulePickerDay(null);
    setConfirmRescheduleModal(null);
    setPendingRescheduleSlot(null);
    setRescheduleMode(false);
  }, []);

  const handleEndContract = useCallback(
    async (status: "Completed" | "Terminated", reason?: string) => {
      const cid =
        sessionDetail?.contractId ?? contractId ?? fallbackContract?.id;
      if (!cid) {
        Alert.alert(
          "Unable to end contract",
          "We couldn't determine the contract linked to this session.",
        );
        return;
      }
      try {
        setIsEndingContract(true);
        const { endContract } = await import("@/src/services/contracts");
        await endContract(cid, { Status: status, Reason: reason });

        // Update cached session statuses immediately
        const newSessionStatus = status;
        const updateSessions = (data: any[]) => {
          if (Array.isArray(data)) {
            return data.map((session) =>
              session.contractId === cid
                ? {
                    ...session,
                    status: newSessionStatus,
                    contractStatus: newSessionStatus,
                  }
                : session,
            );
          }
          return data;
        };

        queryClient.setQueryData(upcomingSessionsQueryKey, updateSessions);
        queryClient.setQueryData(allSessionsQueryKey, updateSessions);

        setShowEndContractOptions(false);
        Alert.alert(
          "Contract updated",
          `The contract has been marked as ${status}.`,
        );

        // Invalidate contracts cache for the patient to ensure conflict detection works
        const patientId = sessionDetail?.patientId;

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
          queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
          patientId
            ? queryClient.invalidateQueries({
                queryKey: ["contracts", "patient", patientId],
              })
            : Promise.resolve(),
          sessionId
            ? queryClient.invalidateQueries({
                queryKey: sessionDetailQueryKey(sessionId),
              })
            : Promise.resolve(),
        ]);

        // Clear the active session warning since we just ended the contract
        setActiveSessionWarningVisible(false);
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.Message ||
          error?.message ||
          "We couldn't end the contract. Please try again.";
        Alert.alert("Unable to end contract", message);
      } finally {
        setIsEndingContract(false);
      }
    },
    [
      sessionDetail?.contractId,
      sessionDetail?.patientId,
      contractId,
      fallbackContract?.id,
      queryClient,
      sessionId,
    ],
  );

  const cancelMutation = useMutation({
    mutationFn: async (params: {
      reason: string;
      rescheduleStartAt?: string | null;
      rescheduleEndAt?: string | null;
    }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await cancelSession(
        sessionId,
        params.reason,
        params.rescheduleStartAt ? new Date(params.rescheduleStartAt) : null,
        params.rescheduleEndAt ? new Date(params.rescheduleEndAt) : null,
      );
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
      setCancelModalVisible(false);
      setCancelReason("");
      Alert.alert(
        selectedRescheduleStartAt
          ? "Reschedule Proposal Sent"
          : "Session cancelled",
        selectedRescheduleStartAt
          ? "Your reschedule proposal has been sent to the patient. They will need to accept or decline the new schedule."
          : "This session has been cancelled successfully.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't process the reschedule request. Please try again.";
      Alert.alert("Unable to reschedule session", message);
    },
  });

  // Cancel-only mutation (no reschedule proposal)
  const cancelSessionMutation = useMutation({
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
      setCancelSessionModalVisible(false);
      setCancelSessionReason("");
      setSelectedCancelSessionReasonId(null);
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

  // Reschedule mutation - for therapists to reschedule cancelled sessions
  const rescheduleMutation = useMutation({
    mutationFn: async (params: { newStartAt: string; newEndAt: string }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      return rescheduleSession(sessionId, {
        NewStartAt: params.newStartAt,
        NewEndAt: params.newEndAt,
      });
    },
    onSuccess: async (data) => {
      const updatedSessionId = data?.sessionId ?? sessionId;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        updatedSessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(updatedSessionId),
            })
          : Promise.resolve(),
      ]);
      closeReschedulePicker();

      Alert.alert(
        "Session Rescheduled",
        "The session has been rescheduled successfully. The patient has been notified of the new schedule.",
        [{ text: "OK", onPress: () => router.back() }],
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

  const handleOpenCancelModal = useCallback(() => {
    setCancelModalVisible(true);
  }, []);

  const handleCloseCancelModal = useCallback(() => {
    setCancelModalVisible(false);
    setCancelReason("");
    setSelectedCancelReasonId(null);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    if (!isReasonValid(selectedCancelReasonId, cancelReason)) {
      Alert.alert(
        "Reason Required",
        "Please select a reason for rescheduling.",
      );
      return;
    }
    if (!selectedRescheduleStartAt || !selectedRescheduleEndAt) {
      Alert.alert(
        "Reschedule Date Required",
        "Please select a new date and time for this session.",
      );
      return;
    }
    const reason = getFinalReasonText(
      selectedCancelReasonId,
      cancelReason,
      true,
    );
    cancelMutation.mutate({
      reason: reason || "Rescheduling session",
      rescheduleStartAt: selectedRescheduleStartAt,
      rescheduleEndAt: selectedRescheduleEndAt,
    });
  }, [
    cancelMutation,
    cancelReason,
    selectedCancelReasonId,
    selectedRescheduleStartAt,
    selectedRescheduleEndAt,
  ]);

  const handleOpenCancelSessionModal = useCallback(() => {
    setCancelSessionModalVisible(true);
  }, []);

  const handleCloseCancelSessionModal = useCallback(() => {
    setCancelSessionModalVisible(false);
    setCancelSessionReason("");
    setSelectedCancelSessionReasonId(null);
  }, []);

  const handleConfirmCancelSession = useCallback(() => {
    if (cancelSessionMutation.isPending) return;
    if (!isReasonValid(selectedCancelSessionReasonId, cancelSessionReason)) {
      Alert.alert("Reason Required", "Please select a reason for cancelling.");
      return;
    }
    const reason = getFinalReasonText(
      selectedCancelSessionReasonId,
      cancelSessionReason,
      isTherapistUser,
    );
    if (!reason) {
      Alert.alert("Reason Required", "Please provide a reason for cancelling.");
      return;
    }
    cancelSessionMutation.mutate({ reason });
  }, [
    cancelSessionMutation,
    cancelSessionReason,
    isTherapistUser,
    selectedCancelSessionReasonId,
  ]);

  // Destructure params so dependency arrays reference stable primitives
  const {
    therapistName: pTherapistName,
    therapistLicense: pTherapistLicense,
    patientName: pPatientName,
    patientAge: pPatientAge,
    caseTitle: pCaseTitle,
    address: pAddress,
    barangay: pBarangay,
    barangayName: pBarangayName,
    lat: pLat,
    lng: pLng,
    day: pDay,
    timeRange: pTimeRange,
    duration: pDuration,
    fee: pFee,
    locFee: pLocFee,
    toolsFee: pToolsFee,
    total: pTotal,
    referralName: pReferralName,
    referralUri: pReferralUri,
  } = params;

  const baseData = useMemo(() => {
    let lat = Number(pLat ?? 14.5995);
    let lng = Number(pLng ?? 120.9842);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const looksLikeLat = Math.abs(lat) <= 90;
      if (!looksLikeLat && Math.abs(lng) <= 90) {
        const tmp = lat;
        lat = lng;
        lng = tmp;
      }
    }
    if (Number.isFinite(resolved.lat as any)) lat = resolved.lat as number;
    if (Number.isFinite(resolved.lng as any)) lng = resolved.lng as number;
    const barangay = (pBarangay ?? pBarangayName) as string | undefined;
    const baseAddressRaw =
      resolved.address ??
      pAddress ??
      "Blk 25 Lot 56 Upper Diho IV Subdivision, QC";
    const barangayResolved = resolved.barangay ?? barangay;
    const addressLine = barangayResolved
      ? `${baseAddressRaw}${baseAddressRaw ? ", " : ""}${barangayResolved}`
      : baseAddressRaw;
    return {
      therapistName: pTherapistName ?? "",
      therapistLicense: pTherapistLicense,
      patientName: pPatientName ?? "",
      patientAge: pPatientAge ?? "21",
      caseTitle: pCaseTitle ?? "Muscle Strain",
      address: addressLine,
      rawAddress: baseAddressRaw,
      barangay: barangayResolved,
      coord: {
        latitude: Number.isFinite(lat) ? lat : 14.5995,
        longitude: Number.isFinite(lng) ? lng : 120.9842,
      },
      day: pDay ?? "Saturday",
      timeRange: pTimeRange ?? "12:30 AM - 1:30 AM",
      duration: pDuration ?? "60 mins",

      fee: pFee ?? "₱ 1000.00",
      locFee: pLocFee ?? "₱ 100.00",
      toolsFee: pToolsFee ?? "₱ 150.00",
      total: pTotal ?? "₱ 1250.00",
      referralName: pReferralName ?? "doctor_referral.jpg",
      referralUri: pReferralUri,
      // Default to null - will be populated from sessionDetail if available
      therapistSavedLocation: null as {
        latitude: number;
        longitude: number;
      } | null,
      patientSavedLocation: null as {
        latitude: number;
        longitude: number;
      } | null,
    };
  }, [
    pTherapistName,
    pTherapistLicense,
    pPatientName,
    pPatientAge,
    pCaseTitle,
    pAddress,
    pBarangay,
    pBarangayName,
    pLat,
    pLng,
    pDay,
    pTimeRange,
    pDuration,
    pFee,
    pLocFee,
    pToolsFee,
    pTotal,
    pReferralName,
    pReferralUri,
    resolved,
  ]);

  const sessionDerived = useMemo(() => {
    if (!sessionDetail) return null;

    const safeDate = (value?: string) => {
      if (!value) return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const startAt = safeDate(sessionDetail.startAt);
    const endAt = safeDate(sessionDetail.endAt);

    const formatDay = (date: Date) =>
      date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

    const formatTime = (date: Date) =>
      date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

    const effectiveAddress = sessionDetail.effectiveAddress ?? baseData.address;
    const rawAddress = sessionDetail.effectiveAddress ?? baseData.rawAddress;

    // DEBUG: Trace coordinate sources
    console.log("[sessionDerived] Coordinates debug:", {
      latitude: sessionDetail.latitude,
      longitude: sessionDetail.longitude,
      patientLatitude: sessionDetail.patientLatitude,
      patientLongitude: sessionDetail.patientLongitude,
      therapistLatitude: sessionDetail.therapistLatitude, // Onboarding location
      effectiveLatitude: sessionDetail.effectiveLatitude,
      baseDistLat: baseData.coord.latitude,
      isTherapistOnboardingLoc:
        sessionDetail.effectiveLatitude === sessionDetail.therapistLatitude,
    });

    // Prioritize patient's saved location for the map
    const safeLatitude =
      typeof sessionDetail.patientLatitude === "number"
        ? sessionDetail.patientLatitude
        : typeof sessionDetail.effectiveLatitude === "number"
          ? sessionDetail.effectiveLatitude
          : typeof sessionDetail.latitude === "number"
            ? sessionDetail.latitude
            : baseData.coord.latitude;
    const safeLongitude =
      typeof sessionDetail.patientLongitude === "number"
        ? sessionDetail.patientLongitude
        : typeof sessionDetail.effectiveLongitude === "number"
          ? sessionDetail.effectiveLongitude
          : typeof sessionDetail.longitude === "number"
            ? sessionDetail.longitude
            : baseData.coord.longitude;

    const professionalFee = (() => {
      const raw = sessionDetail.professionalFee;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      const total = Number(sessionDetail.totalFee) || 0;
      const location = Number(sessionDetail.locationFee) || 0;
      const misc = Number(sessionDetail.miscellaneousFee) || 0;
      const derived = total - location - misc;
      return derived >= 0 ? derived : total;
    })();
    const locationFee = sessionDetail.locationFee ?? undefined;
    const miscFee = sessionDetail.miscellaneousFee ?? undefined;

    const referralUri =
      sessionDetail.doctorReferralImageUrl ?? baseData.referralUri ?? undefined;
    const referralName = sessionDetail.doctorReferralImageUrl
      ? (sessionDetail.doctorReferralImageUrl.split(/[\\/]/).pop() ??
        sessionDetail.doctorReferralImageUrl)
      : baseData.referralName;

    return {
      therapistName: sessionDetail.therapistName ?? baseData.therapistName,
      therapistLicense:
        sessionDetail.therapistLicenseNo ?? baseData.therapistLicense,
      patientName: sessionDetail.patientName ?? baseData.patientName,
      caseTitle: sessionDetail.conditionCase ?? baseData.caseTitle,
      day: startAt ? formatDay(startAt) : baseData.day,
      timeRange:
        startAt && endAt
          ? `${formatTime(startAt)} - ${formatTime(endAt)}`
          : baseData.timeRange,
      duration: sessionDetail.durationMinutes
        ? `${sessionDetail.durationMinutes} mins`
        : baseData.duration,
      address: effectiveAddress,
      rawAddress,
      barangay: sessionDetail.patientBarangay ?? baseData.barangay,
      coord: {
        latitude: Number.isFinite(safeLatitude)
          ? (safeLatitude as number)
          : baseData.coord.latitude,
        longitude: Number.isFinite(safeLongitude)
          ? (safeLongitude as number)
          : baseData.coord.longitude,
      },
      // Therapist's saved profile location (for routing from therapist's location)
      therapistSavedLocation:
        typeof sessionDetail.therapistLatitude === "number" &&
        typeof sessionDetail.therapistLongitude === "number" &&
        Number.isFinite(sessionDetail.therapistLatitude) &&
        Number.isFinite(sessionDetail.therapistLongitude)
          ? {
              latitude: sessionDetail.therapistLatitude,
              longitude: sessionDetail.therapistLongitude,
            }
          : null,
      // Patient's saved profile location
      patientSavedLocation:
        typeof sessionDetail.patientLatitude === "number" &&
        typeof sessionDetail.patientLongitude === "number" &&
        Number.isFinite(sessionDetail.patientLatitude) &&
        Number.isFinite(sessionDetail.patientLongitude)
          ? {
              latitude: sessionDetail.patientLatitude,
              longitude: sessionDetail.patientLongitude,
            }
          : null,
      fee: formatPeso(professionalFee),
      locFee: formatPeso(locationFee) ?? baseData.locFee,
      toolsFee: formatPeso(miscFee) ?? baseData.toolsFee,
      total: formatPeso(sessionDetail.totalFee) ?? baseData.total,
      referralName,
      referralUri,
    };
  }, [sessionDetail, baseData]);

  const data = useMemo(() => {
    if (!sessionDerived) return baseData;
    return { ...baseData, ...sessionDerived };
  }, [baseData, sessionDerived]);

  // Helpers to parse/format peso amounts (centralized)
  const parseMoney = (v?: string) => parseMoneyString(v);
  const formatMoney = (n: number) =>
    formatPeso(n) ?? `? ${Number(n).toFixed(2)}`;

  // Form state for editable details (therapist view)
  const [form, setForm] = useState({
    caseTitle: data.caseTitle,
    day: data.day,
    timeRange: data.timeRange,
    professionalFee: parseMoney(data.fee),
    locationFee: parseMoney(data.locFee),
    toolsFee: parseMoney(data.toolsFee),
    total: parseMoney(data.total),
  });

  // Role and therapist context
  // Determine if current user is a therapist and resolve therapist data we may need
  const isTherapistUser =
    (selectedRole || "").toLowerCase() === "physicaltherapist";
  const rawProfileId = params.profileId;
  const parsedProfileId = rawProfileId != null ? Number(rawProfileId) : NaN;
  const patientProfileId = Number.isFinite(parsedProfileId)
    ? parsedProfileId
    : undefined;
  const therapistIdFromSession =
    sessionDetail?.physicalTherapistId != null
      ? Number.isFinite(Number(sessionDetail.physicalTherapistId))
        ? Number(sessionDetail.physicalTherapistId)
        : undefined
      : undefined;

  const { data: myTherapist } = useQuery({
    queryKey: ["therapist", "me"],
    queryFn: () => fetchMyTherapist(),
    enabled: isTherapistUser,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const therapistUserId = !isTherapistUser
    ? (params.conversationId as string | undefined)
    : undefined;
  const { data: therapistByUser } = useQuery({
    queryKey: ["therapist", "by-user", therapistUserId || ""],
    queryFn: () => fetchTherapistByUserId(therapistUserId!),
    enabled: !!therapistUserId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const therapistIdForDetail = !isTherapistUser
    ? (therapistIdFromSession ??
      ((therapistByUser as any)?.id != null
        ? Number((therapistByUser as any).id)
        : undefined))
    : undefined;

  const { data: therapistDetail } = useQuery<TherapistDetailDto | null>({
    queryKey: therapistDetailQueryKey(
      therapistIdForDetail ? String(therapistIdForDetail) : "",
    ),
    queryFn: () => fetchTherapistById(therapistIdForDetail!),
    enabled: Boolean(therapistIdForDetail) && !isTherapistUser,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const handleTherapistPress = () => {
    if (isTherapistUser) {
      router.push("/(therapist)/(tabs)/profile");
      return;
    }

    const resolvedId =
      therapistIdFromSession ?? therapistIdForDetail ?? undefined;

    if (resolvedId != null) {
      router.push(`/(patient)/therapists/${resolvedId}`);
    }
  };

  const handlePatientPress = () => {
    if (!isTherapistUser) {
      // Patient users navigate to their own edit profile screen
      router.push("/(patient)/edit-profile");
      return;
    }

    // Therapists can view patient details
    const idFromSession = sessionDetail?.patientId;
    const resolvedId = idFromSession ?? patientProfileId;
    if (resolvedId == null) return;

    // Navigate to patient detail screen
    router.push(`/patient-detail?id=${resolvedId}`);
  };

  // Create or update a contract for this patient/therapist pair and send for confirmation.
  const createOrPrepareContract = async () => {
    try {
      const { conflict, patientId, therapistId, existingContracts } =
        await detectActiveSessionConflict();

      if (!patientId || !therapistId || conflict) return undefined;

      const { createContract, updateBlueprint, sendForConfirmation } =
        await import("@/src/services/contracts");

      const existing = existingContracts ?? [];

      const candidate = existing.find(
        (c) =>
          Number(c.physicalTherapistId) === therapistId &&
          !isConcludedContractStatus(c.status),
      );

      let nextContractId: number | undefined = candidate?.id;
      if (!nextContractId) {
        const now = new Date();
        const horizon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7 * 8);
        const created = await createContract({
          PatientId: patientId,
          PhysicalTherapistId: therapistId,
          StartDate: now.toISOString(),
          EndDate: horizon.toISOString(),
        });
        nextContractId = created.id;
      }

      if (!nextContractId) return undefined;

      const parseTime = (raw?: string) => {
        if (!raw) return undefined as string | undefined;
        const s = raw.trim();
        const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
        if (!m) return undefined as string | undefined;
        let hh = Number(m[1]);
        const mm = Number(m[2] ?? 0);
        const mer = m[3].toUpperCase();
        if (mer === "AM") {
          if (hh === 12) hh = 0;
        } else if (mer === "PM") {
          if (hh !== 12) hh += 12;
        }
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(hh)}:${pad(mm)}:00`;
      };

      const [startRaw, endRaw] = String(form.timeRange || "")
        .split("-")
        .map((p) => p.trim());
      const startTime = parseTime(startRaw);
      const endTime = parseTime(endRaw);

      const payload: Record<string, any> = {};
      if (form.caseTitle) payload.CaseToTreat = form.caseTitle;
      if (form.day) payload.SessionDays = form.day;
      if (startTime) payload.SessionStartTime = startTime;
      if (endTime) payload.SessionEndTime = endTime;

      // Include the specific proposed date if available (from params or session detail)
      // This ensures the session is created for the exact date therapist proposed
      const proposedDateStr =
        (params.startAt as string | undefined) || sessionDetail?.startAt;
      if (proposedDateStr) {
        const proposedDate = new Date(String(proposedDateStr));
        if (!Number.isNaN(proposedDate.getTime())) {
          payload.ProposedSessionDate = proposedDate.toISOString();
        }
      }

      if (Number.isFinite(form.professionalFee))
        payload.ProfessionalFee = form.professionalFee;
      if (Number.isFinite(form.locationFee))
        payload.LocationFee = form.locationFee;
      if (Number.isFinite(form.toolsFee))
        payload.MiscellaneousFee = form.toolsFee;
      if (Number.isFinite(form.total)) payload.TotalFee = form.total;

      if (Object.keys(payload).length > 0) {
        await updateBlueprint(nextContractId, payload);
      }

      await sendForConfirmation(nextContractId);

      // If we have a conversation context, proactively send the proposal message via hub.
      const conversationId = params.conversationId as string | undefined;
      if (conversationId) {
        const proposal = {
          contractId: nextContractId,
          caseTitle: form.caseTitle,
          day: form.day,
          timeRange: form.timeRange,
          total: formatMoney(
            Number.isFinite(form.total) ? (form.total as any) : 0,
          ),
        };
        try {
          const { HubConnectionBuilder, HttpTransportType } =
            await import("@microsoft/signalr");
          const baseURL = (apiClient.defaults.baseURL ?? "").replace(
            /\/+$/,
            "",
          );
          const hubBase = baseURL.replace(/\/?api$/i, "");
          const accessToken: string | undefined =
            getTokens().accessToken ||
            (apiClient.defaults.headers.common as any)?.Authorization?.replace(
              /^Bearer\s+/i,
              "",
            );
          if (hubBase && accessToken) {
            const connection = new HubConnectionBuilder()
              .withUrl(`${hubBase}/hubs/chat`, {
                accessTokenFactory: () => {
                  // Use latest token for reconnection safety
                  const currentToken = getTokens().accessToken;
                  return currentToken || accessToken || "";
                },
                transport: HttpTransportType.WebSockets,
                skipNegotiation: true,
              })
              .withAutomaticReconnect()
              .build();
            try {
              await connection.start();
              const content = buildSessionProposalChatContent(proposal);
              await connection.invoke("SendMessage", {
                receiverId: conversationId,
                content,
                messageType: "TEXT",
              });
            } catch (err) {
              console.warn(
                "Failed to send proposal chat message (session-detail)",
                err,
              );
            } finally {
              try {
                await connection.stop();
              } catch {}
            }
          }
        } catch (err) {
          console.warn(
            "Realtime proposal send unavailable (session-detail)",
            err,
          );
        }
      }

      return nextContractId;
    } catch (e) {
      console.warn("Failed to prepare contract for confirmation", e);
      Alert.alert(
        "Error",
        "Failed to prepare contract for confirmation. Please try again later.",
      );
      return undefined;
    }
  };

  const formatLicense = (license?: string) => {
    if (!license) return "-";
    const cleaned = license.trim();
    if (/^\d{7}$/.test(cleaned))
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    if (/^\d{8}$/.test(cleaned))
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    return cleaned;
  };

  const rawSessionStatus = (sessionDetail?.status ?? "")
    .toString()
    .trim()
    .toLowerCase();
  const normalizedSessionStatus = rawSessionStatus.replace(/\s+/g, "");
  const isSessionCancelled = rawSessionStatus === "cancelled";
  const isSessionCompleted = rawSessionStatus === "completed";
  const isSessionTerminated = rawSessionStatus === "terminated";
  const isPendingRescheduleApproval =
    rawSessionStatus === "pendingrescheduleapproval" ||
    normalizedSessionStatus === "pendingrescheduleapproval";
  const isDoneForToday =
    rawSessionStatus === "done for today" ||
    normalizedSessionStatus === "donefortoday";
  const contractStatus = sessionDetail?.contractStatus?.toLowerCase() ?? null;
  const isContractEnded =
    contractStatus === "completed" || contractStatus === "terminated";
  const isContractActive = !contractStatus || contractStatus === "active";
  const shouldApplySessionLocks = Boolean(sessionId);
  const isLockedBySessionStatus =
    shouldApplySessionLocks &&
    (isSessionCancelled ||
      isSessionCompleted ||
      isSessionTerminated ||
      isContractEnded);
  const canEditSession = isEditable && !isLockedBySessionStatus;
  const canCancelSession = Boolean(
    sessionId &&
    sessionDetail &&
    !isSessionCancelled &&
    !isSessionCompleted &&
    !isSessionTerminated &&
    !isContractEnded &&
    !isDoneForToday,
  );
  const isCanceling = cancelMutation.isPending;
  // Allow the Confirm button for editable therapist view even when a conversationId
  // param isn't present — we can prepare/send a contract using session or profile data.
  const showConfirmButton = canEditSession;
  const showCancelButton = canCancelSession;
  const showBottomActions = showConfirmButton || showCancelButton;

  // Cache the contract ID to prevent section unmounting during refetch
  useEffect(() => {
    if (sessionDetail?.contractId) {
      contractIdCache.current = sessionDetail.contractId;
    }
  }, [sessionDetail?.contractId]);

  // Stable condition for showing End Session section - uses cached contract ID
  const shouldShowEndSessionSection = useMemo(() => {
    const hasContractId = Boolean(
      sessionDetail?.contractId || contractIdCache.current,
    );
    return (
      isTherapistUser &&
      hasContractId &&
      !isSessionCancelled &&
      !isSessionCompleted &&
      !isSessionTerminated &&
      (isContractActive || isDoneForToday)
    );
  }, [
    isTherapistUser,
    sessionDetail?.contractId,
    isSessionCancelled,
    isSessionCompleted,
    isSessionTerminated,
    isContractActive,
    isDoneForToday,
  ]);

  // Debug: Track End Session section visibility and state
  useEffect(() => {
    console.log("🔍 End Session Debug:", {
      shouldShow: shouldShowEndSessionSection,
      showOptions: showEndContractOptions,
      isDoneForToday,
      isContractActive,
      contractId: sessionDetail?.contractId,
      cachedContractId: contractIdCache.current,
    });
  }, [
    shouldShowEndSessionSection,
    showEndContractOptions,
    isDoneForToday,
    isContractActive,
    sessionDetail?.contractId,
  ]);

  // Patient-side accept/decline when a pending contract exists
  const contractStatusLower = (
    sessionDetail?.contractStatus ||
    fallbackContract?.status ||
    ""
  )
    .toString()
    .toLowerCase();
  const fallbackStatusLower =
    fallbackContract?.status?.toString().toLowerCase() ?? "";
  const isContractPending =
    contractStatusLower === "pendingconfirmation" ||
    fallbackStatusLower === "pendingconfirmation";

  const awaitingPatientConfirmation =
    Boolean(sessionDetail?.isAwaitingPatientConfirmation) ||
    (Boolean(sessionDetail?.detailsProposedAt) &&
      !sessionDetail?.detailsConfirmedAt) ||
    isContractPending;

  const patientResponded =
    Boolean(sessionDetail?.detailsConfirmedAt) ||
    ["cancelled", "completed", "terminated", "declined"].includes(
      contractStatusLower || "",
    );

  const resolveParticipantIds = useCallback(() => {
    let resolvedPatientId = patientProfileId;
    let resolvedTherapistId = isTherapistUser
      ? (myTherapist as any)?.id != null
        ? Number((myTherapist as any).id)
        : undefined
      : (therapistByUser as any)?.id != null
        ? Number((therapistByUser as any).id)
        : undefined;

    if ((!resolvedPatientId || !resolvedTherapistId) && sessionDetail) {
      if (!resolvedPatientId && sessionDetail.patientId) {
        const pid = Number(sessionDetail.patientId);
        if (Number.isFinite(pid)) resolvedPatientId = pid;
      }
      if (!resolvedTherapistId && sessionDetail.physicalTherapistId) {
        const tid = Number(sessionDetail.physicalTherapistId);
        if (Number.isFinite(tid)) resolvedTherapistId = tid;
      }
    }

    return {
      patientId: resolvedPatientId,
      therapistId: resolvedTherapistId,
    };
  }, [
    patientProfileId,
    isTherapistUser,
    myTherapist,
    therapistByUser,
    sessionDetail,
  ]);

  const detectActiveSessionConflict = useCallback(async () => {
    const { patientId, therapistId } = resolveParticipantIds();
    if (!patientId || !therapistId) {
      setActiveSessionWarningVisible(false);
      setConflictWithOtherTherapist(false);
      return {
        conflict: false,
        patientId,
        therapistId,
        existingContracts: [] as ContractSummary[],
      };
    }

    try {
      // Invalidate the contracts cache before fetching to ensure fresh data
      await queryClient.invalidateQueries({
        queryKey: ["contracts", "patient", patientId],
      });

      const existing = await getContractsForPatient(patientId);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        try {
          console.log("[detectActiveSessionConflict] contracts", {
            patientId,
            therapistId,
            contracts: (existing ?? []).map((c: any) => ({
              id: c?.id,
              physicalTherapistId: c?.physicalTherapistId,
              status: c?.status,
            })),
          });
        } catch {
          // ignore log failures
        }
      }

      // A patient can only have one therapist at a time.
      // Only treat as a conflict when the blocking contract is with a DIFFERENT therapist.
      // If the blocking contract is with the current therapist, allow updating/resending.
      const blockingContracts = existing.filter((c) =>
        isBlockingContractStatus(c.status),
      );

      const blockingWithOtherTherapist = blockingContracts.find(
        (c) => Number(c.physicalTherapistId) !== therapistId,
      );

      if (blockingWithOtherTherapist) {
        setActiveSessionWarningVisible(true);
        setConflictWithOtherTherapist(true);
        return {
          conflict: true,
          patientId,
          therapistId,
          existingContracts: existing,
          isWithOtherTherapist: true,
        };
      }

      setActiveSessionWarningVisible(false);
      setConflictWithOtherTherapist(false);

      return {
        conflict: false,
        patientId,
        therapistId,
        existingContracts: existing,
      };
    } catch (err) {
      console.warn("Failed to detect active session conflict", err);
      return {
        conflict: false,
        patientId,
        therapistId,
        existingContracts: [] as ContractSummary[],
      };
    }
  }, [resolveParticipantIds, queryClient]);

  useEffect(() => {
    let cancelled = false;
    const resolveFallback = async () => {
      if (sessionId || contractId) return;
      const patientId = patientProfileId;
      const therapistNumericId = isTherapistUser
        ? (myTherapist as any)?.id != null
          ? Number((myTherapist as any).id)
          : undefined
        : (therapistByUser as any)?.id != null
          ? Number((therapistByUser as any).id)
          : undefined;
      if (!patientId || therapistNumericId == null) return;
      try {
        const list = await getContractsForPatient(patientId);
        if (cancelled) return;
        const candidate = list.find(
          (c) =>
            Number(c.physicalTherapistId) === Number(therapistNumericId) &&
            !String(c.status).match(/Cancelled|Completed|Expired|Terminated/i),
        );
        setFallbackContract(
          candidate
            ? { id: candidate.id, status: String(candidate.status) }
            : null,
        );
      } catch {
        if (!cancelled) setFallbackContract(null);
      }
    };
    resolveFallback();
    return () => {
      cancelled = true;
    };
  }, [
    sessionId,
    contractId,
    rawProfileId,
    isTherapistUser,
    myTherapist,
    therapistByUser,
    patientProfileId,
  ]);

  useEffect(() => {
    if (!contractId) return;
    const numericId = Number(contractId);
    if (!Number.isFinite(numericId)) return;
    let cancelled = false;

    const resolveByContractId = async () => {
      try {
        const { getContract } = await import("@/src/services/contracts");
        const data = await getContract(numericId);
        if (cancelled) return;
        const rawStatus = (data as any)?.status ?? (data as any)?.Status ?? "";
        setFallbackContract({
          id: Number(data?.id ?? numericId),
          status: String(rawStatus),
        });
      } catch (err) {
        if (cancelled) return;
        console.warn("Failed to resolve contract by id", err);
        setFallbackContract((prev) =>
          prev && prev.id === numericId
            ? prev
            : (prev ?? { id: numericId, status: "" }),
        );
      }
    };

    resolveByContractId();
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  useEffect(() => {
    if (isSessionDetailBusy) {
      setHasSentConfirm(true);
      return;
    }

    const id = resolvedContractId;
    const pendingContracts = pendingConfirmationContracts.current;
    if (!id) {
      setHasSentConfirm(Boolean(awaitingPatientConfirmation));
      return;
    }

    if (awaitingPatientConfirmation) {
      pendingContracts.add(id);
      setHasSentConfirm(true);
      return;
    }

    if (pendingContracts.has(id) && !patientResponded) {
      setHasSentConfirm(true);
      return;
    }

    pendingContracts.delete(id);
    setHasSentConfirm(false);
  }, [
    awaitingPatientConfirmation,
    isSessionDetailBusy,
    resolvedContractId,
    patientResponded,
  ]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session identifier");
      await completeSession(sessionId);
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
      Alert.alert("Session completed", "The session has been marked complete.");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't complete the session. Please try again.";
      Alert.alert("Unable to complete session", message);
    },
  });

  const ratingMutation = useMutation({
    mutationFn: async () => {
      console.log("🚀 Rating mutation started", {
        sessionId,
        ratingScore,
        isTherapistUser,
      });

      if (!sessionId) {
        console.error("❌ Missing session identifier");
        throw new Error("Missing session identifier");
      }

      if (ratingScore == null) {
        console.error("❌ No rating score selected");
        throw new Error("Please select a score before submitting.");
      }

      if (isTherapistUser) {
        // Therapist rating a patient
        console.log("👨‍⚕️ Therapist rating patient...");
        if (!sessionDetail?.patientId) {
          console.error("❌ Missing patient information");
          throw new Error("Missing patient information");
        }

        const patientRatingData = {
          PatientId: sessionDetail.patientId,
          SessionId: sessionId ?? null,
          Score: ratingScore,
          Comment: ratingComment?.trim() || null,
        };
        console.log(
          "📤 Submitting therapist rating with data:",
          patientRatingData,
        );
        await submitPatientRating(patientRatingData);
      } else {
        // Patient rating a therapist
        console.log("👤 Patient rating therapist...");
        if (!sessionDetail?.physicalTherapistId) {
          console.error("❌ Missing therapist information");
          throw new Error("Missing therapist information");
        }

        const ratingData = {
          TherapistId: sessionDetail.physicalTherapistId,
          SessionId: sessionId ?? null,
          Score: ratingScore,
          Comment: ratingComment?.trim() || null,
        };
        console.log("📤 Submitting patient rating with data:", ratingData);
        await submitRating(ratingData);
        console.log("✅ submitRating completed without error");
      }
    },
    onSuccess: async () => {
      console.log("✅✅✅ Rating submitted successfully to backend!");
      console.log("🔄 Updating UI state...");
      setRatingModalVisible(false);
      setHasRated(true);
      setRatingScore(null);
      setRatingComment("");

      console.log("🔄 Invalidating queries...");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);

      // Show success alert with option to go back or stay
      console.log("📢 Showing success alert");
      Alert.alert(
        "Rating Submitted! ⭐",
        "Thank you for your feedback. Your rating has been saved successfully.",
        [
          {
            text: "Back to Reviews",
            onPress: () => router.back(),
            style: "default",
          },
          {
            text: "Stay Here",
            style: "cancel",
          },
        ],
      );
    },
    onError: (error: any) => {
      console.error("❌❌❌ Rating mutation error:", error);
      console.error("Error type:", typeof error);
      console.error("Error keys:", Object.keys(error || {}));
      console.error("Error response:", error?.response);
      console.error("Error data:", error?.response?.data);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);

      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't submit your rating. Please try again.";

      console.error("📢 Showing error alert:", message);
      Alert.alert("Unable to submit rating", message);
    },
  });

  const redirectToConversation = useCallback(() => {
    router.back();
  }, [router]);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const cid = resolvedContractId;
      if (!cid) throw new Error("Missing contract identifier");
      const { default: apiClient } = await import("@/api/client");
      await apiClient.post(`/api/contracts/${cid}/confirm`);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: upcomingSessionsQueryKey });
      await queryClient.refetchQueries({ queryKey: allSessionsQueryKey });

      const id = resolvedContractId;
      if (id) pendingConfirmationContracts.current.delete(id);
      setPendingPatientAction(null);
      redirectToConversation();
    },
    onError: (error: any) => {
      setPendingPatientAction(null);
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't confirm the contract. Please try again.";
      Alert.alert("Unable to confirm", message);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const cid = resolvedContractId;
      if (!cid) throw new Error("Missing contract identifier");

      const { default: apiClient } = await import("@/api/client");
      const { getContract } = await import("@/src/services/contracts");

      let statusLower = "";
      try {
        const contract = await getContract(cid);
        statusLower =
          contract?.status?.toString().replace(/\s+/g, "")?.toLowerCase() ?? "";
      } catch {
        statusLower = "";
      }

      if (statusLower && statusLower !== "pendingconfirmation") {
        const err = new Error(
          "This contract is no longer awaiting confirmation, so it can't be declined.",
        );
        (err as any).response = {
          data: {
            message:
              "This contract is no longer awaiting confirmation, so it can't be declined.",
          },
        };
        throw err;
      }

      await apiClient.post(`/api/contracts/${cid}/decline`);
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
      const id = resolvedContractId;
      if (id) pendingConfirmationContracts.current.delete(id);
      setPendingPatientAction(null);
      redirectToConversation();
    },
    onError: (error: any) => {
      setPendingPatientAction(null);
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.Message ||
        error?.message ||
        "We couldn't decline the contract. Please try again.";
      Alert.alert("Unable to decline", message);
    },
  });

  const isPatientActionProcessing =
    acceptMutation.isPending || declineMutation.isPending;

  // Resolve numeric therapist id for availability lookups
  const therapistNumericIdForAvail = useMemo(() => {
    if (isTherapistUser) {
      const id = (myTherapist as any)?.id;
      return id != null ? Number(id) : undefined;
    }
    const id = (therapistByUser as any)?.id;
    return id != null ? Number(id) : undefined;
  }, [isTherapistUser, myTherapist, therapistByUser]);
  const { data: bookedIntervals } = useQuery({
    queryKey: ["booked-intervals", therapistNumericIdForAvail || ""],
    queryFn: () => {
      const now = new Date();
      const from = now.toISOString();
      const to = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      return fetchBookedIntervals(therapistNumericIdForAvail!, from, to);
    },
    enabled: !!therapistNumericIdForAvail,
  });

  // Fetch therapist weekly availability
  const {
    data: availabilityBlocks,
    isLoading: isAvailabilityLoading,
    isFetching: isAvailabilityFetching,
  } = useQuery<TherapistAvailability[]>({
    queryKey: ["availability", therapistNumericIdForAvail || ""],
    queryFn: () =>
      fetchTherapistAvailability(therapistNumericIdForAvail as number),
    enabled: !!therapistNumericIdForAvail,
  });

  const excludeContractId =
    resolvedContractId != null && Number.isFinite(resolvedContractId)
      ? Number(resolvedContractId)
      : undefined;

  const {
    data: recurringCommitments,
    isLoading: isRecurringLoading,
    isFetching: isRecurringFetching,
  } = useQuery<RecurringCommitment[]>({
    queryKey: [
      "contracts",
      "recurring",
      therapistNumericIdForAvail || "",
      excludeContractId ?? "none",
    ],
    queryFn: () =>
      fetchRecurringCommitments(
        therapistNumericIdForAvail as number,
        excludeContractId != null ? { excludeContractId } : undefined,
      ),
    enabled: !!therapistNumericIdForAvail && canEditSession,
    staleTime: 60 * 1000,
  });

  // Helpers to present availability
  const dowToDayLabel = useCallback((dow: number): string | null => {
    switch (Number(dow)) {
      case 0:
        return "Sunday";
      case 1:
        return "Monday";
      case 2:
        return "Tuesday";
      case 3:
        return "Wednesday";
      case 4:
        return "Thursday";
      case 5:
        return "Friday";
      case 6:
        return "Saturday";
      default:
        return null;
    }
  }, []);

  const hhmmTo12 = useCallback((hhmm: string) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const mer = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, "0")} ${mer}`;
  }, []);

  type DiscretizedSlot = { start: string; end: string };

  const discretizedAvailability = useMemo(() => {
    return discretizeAvailabilityForWeek({
      availabilityBlocks: availabilityBlocks ?? [],
      now: new Date(),
      weekOffset: 0,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
      includeRecurringWhenNoSpecificDate: false,
    }) as Record<number, DiscretizedSlot[]>;
  }, [availabilityBlocks]);

  const dayOptions = useMemo(() => {
    const now = new Date();
    const todayIndex = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate start of this week (Monday) - matching create-session.tsx
    const daysSinceMonday = todayIndex === 0 ? 6 : todayIndex - 1;
    const startOfWeekMonday = new Date(now);
    startOfWeekMonday.setDate(now.getDate() - daysSinceMonday);
    startOfWeekMonday.setHours(0, 0, 0, 0);

    return (
      Object.entries(discretizedAvailability)
        .reduce<
          {
            dow: number;
            label: string;
            slots: DiscretizedSlot[];
            dateLabel?: string;
          }[]
        >((acc, [dowStr, slots]) => {
          const dow = Number(dowStr);
          const dayName = dowToDayLabel(dow);
          if (!dayName || slots.length === 0) return acc;

          // Calculate the date for this day within the current calendar week (Monday to Sunday)
          // Convert from JS day (0=Sunday..6=Saturday) to Monday-starting offset (Monday=0..Sunday=6)
          const offsetFromMonday = dow === 0 ? 6 : dow - 1;
          const targetDate = new Date(startOfWeekMonday);
          targetDate.setDate(startOfWeekMonday.getDate() + offsetFromMonday);
          targetDate.setHours(0, 0, 0, 0);

          const dateLabel = targetDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          const label = `${dayName} (${dateLabel})`;
          acc.push({ dow, label, slots, dateLabel });
          return acc;
        }, [])
        // Sort to put Sunday at the end (like the Schedule page: Mon, Tue, ..., Sat, Sun)
        .sort((a, b) => {
          // Convert to Monday-based order: Mon=1->1, Tue=2->2, ..., Sat=6->6, Sun=0->7
          const orderA = a.dow === 0 ? 7 : a.dow;
          const orderB = b.dow === 0 ? 7 : b.dow;
          return orderA - orderB;
        })
    );
  }, [discretizedAvailability, dowToDayLabel]);

  const conflictKeySet = useMemo(() => {
    return buildConflictKeySet({
      recurringCommitments,
      bookedIntervals,
    });
  }, [recurringCommitments, bookedIntervals]);

  // Compute the original session's slot key to disable it in reschedule mode
  const originalSessionSlotKey = useMemo(() => {
    if (!sessionDetail?.startAt) return null;
    const startDate = new Date(sessionDetail.startAt);
    if (isNaN(startDate.getTime())) return null;
    const dow = startDate.getDay();
    const hours = startDate.getHours();
    const minutes = startDate.getMinutes();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad(hours)}:${pad(minutes)}`;
    return `${dow}-${start}`;
  }, [sessionDetail?.startAt]);

  // For reschedule picker: day label and slots similar to schedule picker
  const rescheduleSelectedDayLabel =
    reschedulePickerDay != null ? dowToDayLabel(reschedulePickerDay) : null;
  const rescheduleCurrentDaySlots =
    reschedulePickerDay != null
      ? (discretizedAvailability[reschedulePickerDay] ?? [])
      : [];

  const selectedDayLabel =
    schedulePickerDay != null ? dowToDayLabel(schedulePickerDay) : null;
  const currentDaySlots =
    schedulePickerDay != null
      ? (discretizedAvailability[schedulePickerDay] ?? [])
      : [];
  const isSlotDataLoading =
    isAvailabilityLoading ||
    isAvailabilityFetching ||
    isRecurringLoading ||
    isRecurringFetching;

  useEffect(() => {
    if (schedulePickerDay == null) {
      if (pendingSlotSelection !== null) {
        setPendingSlotSelection(null);
      }
      return;
    }

    const slots = discretizedAvailability[schedulePickerDay] ?? [];
    const dayLabel = dowToDayLabel(schedulePickerDay);

    if (
      pendingSlotSelection &&
      (pendingSlotSelection.dayDow !== schedulePickerDay ||
        !slots.some(
          (slot) =>
            slot.start === pendingSlotSelection.start &&
            slot.end === pendingSlotSelection.end,
        ))
    ) {
      setPendingSlotSelection(null);
      return;
    }

    if (
      dayLabel &&
      form.day &&
      form.timeRange &&
      dayLabel.toLowerCase() === form.day.toLowerCase()
    ) {
      const match = slots.find((slot) => {
        const label = `${hhmmTo12(slot.start)} - ${hhmmTo12(slot.end)}`;
        return label === form.timeRange;
      });
      if (match) {
        const nextSelection = {
          dayDow: schedulePickerDay,
          start: match.start,
          end: match.end,
          label: `${hhmmTo12(match.start)} - ${hhmmTo12(match.end)}`,
        };
        if (
          !pendingSlotSelection ||
          pendingSlotSelection.dayDow !== nextSelection.dayDow ||
          pendingSlotSelection.start !== nextSelection.start ||
          pendingSlotSelection.end !== nextSelection.end
        ) {
          setPendingSlotSelection(nextSelection);
        }
      }
    }
  }, [
    schedulePickerDay,
    discretizedAvailability,
    dowToDayLabel,
    form.day,
    form.timeRange,
    hhmmTo12,
    pendingSlotSelection,
  ]);

  const confirmPendingSlot = useCallback(() => {
    if (!pendingSlotSelection) return;
    const dayLabel = dowToDayLabel(pendingSlotSelection.dayDow);
    if (!dayLabel) return;
    setConfirmSlotModal({ dayLabel, label: pendingSlotSelection.label });
  }, [pendingSlotSelection, dowToDayLabel]);

  useEffect(() => {
    // Only therapist side needs to initialize/update form from data
    // Patient side will just display session detail values directly
    if (!isTherapistUser) return;

    const newForm = {
      caseTitle: data.caseTitle,
      day: data.day,
      timeRange: data.timeRange,
      professionalFee: parseMoney(data.fee),
      locationFee: parseMoney(data.locFee),
      toolsFee: parseMoney(data.toolsFee),
      total: parseMoney(data.total),
    };

    if (myTherapist?.feePerSession) {
      newForm.professionalFee = myTherapist.feePerSession;
    }

    setForm(newForm);
  }, [
    data.caseTitle,
    data.day,
    data.timeRange,
    data.fee,
    data.locFee,
    data.toolsFee,
    data.total,
    isTherapistUser,
    myTherapist,
  ]);

  useEffect(() => {
    // Recompute total whenever fee components change (therapist only)
    if (!isTherapistUser) return;

    setForm((s) => {
      const nextTotal =
        (s.professionalFee || 0) + (s.locationFee || 0) + (s.toolsFee || 0);
      if (nextTotal === s.total) return s; // no change, avoid extra render
      return { ...s, total: nextTotal };
    });
  }, [form.locationFee, form.toolsFee, form.professionalFee, isTherapistUser]);

  // If we lack coordinates or address but have a profileId, fetch the patient profile to resolve address + coords
  useEffect(() => {
    const missingLatLng = !params.lat || !params.lng;
    const missingAddress = !params.address || !params.barangay;
    const canFetch = (missingLatLng || missingAddress) && rawProfileId;
    let cancelled = false;
    (async () => {
      if (!canFetch) return;
      try {
        const { default: apiClient } = await import("@/api/client");
        const res = await apiClient.get(
          `/api/patient/profiles/${rawProfileId}`,
        );
        const p = res?.data ?? {};
        let lat = Number(p?.latitude);
        let lng = Number(p?.longitude);
        if (Number.isFinite(lat) && Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
          const tmp = lat;
          lat = lng;
          lng = tmp;
        }
        const addr = (p?.address as string) || undefined;
        const brgy = (p?.barangay as string) || undefined;
        if (!cancelled) {
          setResolved({
            lat: Number.isFinite(lat) ? lat : undefined,
            lng: Number.isFinite(lng) ? lng : undefined,
            address: addr,
            barangay: brgy,
          });
        }
      } catch (e) {
        // non-fatal; keep defaults
        console.warn("Failed to resolve patient profile for session detail", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawProfileId, params.lat, params.lng, params.address, params.barangay]);

  if (!sessionId) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-8 h-8 items-center justify-center"
          >
            <ArrowLeft color="#111" size={24} />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">
            Session Detail
          </Text>
          <View className="w-8" />
        </View>

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

  if (isSessionDetailError) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-8 h-8 items-center justify-center"
          >
            <ArrowLeft color="#111" size={24} />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">
            Session Detail
          </Text>
          <View className="w-8" />
        </View>

        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base font-semibold text-gray-900 text-center mb-2">
            Could not load session
          </Text>
          <Text className="text-sm text-gray-600 text-center mb-4">
            {getUserFacingSessionsErrorMessage(sessionDetailError)}
          </Text>
          <TouchableOpacity
            onPress={() => refetchSessionDetail()}
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-8 h-8 items-center justify-center"
        >
          <ArrowLeft color="#111" size={24} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">
          Session Detail
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View className="web:px-4">
          {sessionId && (isSessionDetailLoading || isSessionDetailFetching) ? (
            <ActivityIndicator color="#0D9488" className="self-center mb-4" />
          ) : null}

          {/* Banner for contract ended (Completed or Terminated) - visible to patients */}
          {!isTherapistUser &&
            sessionDetail?.contractStatus &&
            (sessionDetail.contractStatus.toLowerCase() === "completed" ||
              sessionDetail.contractStatus.toLowerCase() === "terminated") && (
              <View
                className="rounded-xl p-4 mb-4 border"
                style={{
                  backgroundColor:
                    sessionDetail.contractStatus.toLowerCase() === "completed"
                      ? "#ECFDF5"
                      : "#FEF2F2",
                  borderColor:
                    sessionDetail.contractStatus.toLowerCase() === "completed"
                      ? "#A7F3D0"
                      : "#FECACA",
                }}
              >
                <View className="flex-row items-center mb-2">
                  <Text style={{ fontSize: 20, marginRight: 8 }}>
                    {sessionDetail.contractStatus.toLowerCase() === "completed"
                      ? "✓"
                      : "⚠️"}
                  </Text>
                  <Text
                    className="text-base font-bold"
                    style={{
                      color:
                        sessionDetail.contractStatus.toLowerCase() ===
                        "completed"
                          ? "#065F46"
                          : "#991B1B",
                    }}
                  >
                    Treatment{" "}
                    {sessionDetail.contractStatus.toLowerCase() === "completed"
                      ? "Completed"
                      : "Discontinued"}
                  </Text>
                </View>
                <Text
                  className="text-sm mb-2"
                  style={{
                    color:
                      sessionDetail.contractStatus.toLowerCase() === "completed"
                        ? "#047857"
                        : "#B91C1C",
                  }}
                >
                  {sessionDetail.contractStatus.toLowerCase() === "completed"
                    ? "Your therapist has marked this treatment as successfully completed."
                    : "Your therapist has discontinued this treatment."}
                </Text>
                {sessionDetail.contractEndReason && (
                  <View
                    className="rounded-lg p-3 mt-1"
                    style={{
                      backgroundColor:
                        sessionDetail.contractStatus.toLowerCase() ===
                        "completed"
                          ? "#D1FAE5"
                          : "#FEE2E2",
                    }}
                  >
                    <Text
                      className="text-xs font-medium mb-1"
                      style={{
                        color:
                          sessionDetail.contractStatus.toLowerCase() ===
                          "completed"
                            ? "#065F46"
                            : "#991B1B",
                      }}
                    >
                      Reason:
                    </Text>
                    <Text
                      className="text-sm"
                      style={{
                        color:
                          sessionDetail.contractStatus.toLowerCase() ===
                          "completed"
                            ? "#047857"
                            : "#B91C1C",
                      }}
                    >
                      {sessionDetail.contractEndReason}
                    </Text>
                  </View>
                )}
                {sessionDetail.contractEndedAt && (
                  <Text
                    className="text-xs mt-2"
                    style={{
                      color:
                        sessionDetail.contractStatus.toLowerCase() ===
                        "completed"
                          ? "#6EE7B7"
                          : "#FCA5A5",
                    }}
                  >
                    {new Date(sessionDetail.contractEndedAt).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </Text>
                )}
              </View>
            )}

          {/* Therapist-side banner for pending reschedule approval */}
          {isTherapistUser && isPendingRescheduleApproval ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <Text className="text-sm font-bold text-amber-800 mb-1">
                Reschedule Proposal Sent
              </Text>
              <Text className="text-xs text-amber-800 mb-2">
                You have proposed a new time for this session. Waiting for
                patient to respond.
              </Text>
              {/* DEBUG: Check why dates might be missing */}
              {(!sessionDetail?.proposedRescheduleStartAt ||
                !sessionDetail?.proposedRescheduleEndAt) && (
                <Text className="text-xs text-red-600 mb-2 font-bold">
                  DEBUG: Dates missing from server response. Status:{" "}
                  {sessionDetail?.status}
                </Text>
              )}

              {sessionDetail?.relieverTherapistId ? (
                <View className="bg-white border border-amber-100 rounded-lg p-3 mb-3">
                  <Text className="text-xs text-amber-600 font-medium mb-2">
                    Substitute Therapist
                  </Text>
                  <View className="flex-row items-center mb-2">
                    <View className="w-10 h-10 rounded-full bg-amber-600 items-center justify-center mr-3">
                      <Text className="text-white font-bold text-base">
                        {sessionDetail.relieverTherapistName?.charAt(0) || "?"}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900">
                        {sessionDetail.relieverTherapistName || "Unknown"}
                      </Text>
                      <Text className="text-xs text-gray-600">
                        {sessionDetail.relieverTherapistSpecialty ||
                          "Physical Therapist"}
                      </Text>
                    </View>
                  </View>
                  {sessionDetail.relieverSubstitutionReason ? (
                    <View className="bg-gray-50 p-2 rounded-md border border-gray-100">
                      <Text className="text-xs text-gray-800 italic">
                        {'"'}
                        {sessionDetail.relieverSubstitutionReason}
                        {'"'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="bg-white rounded-lg p-3 border border-amber-100">
                <Text className="text-xs text-amber-600 font-medium mb-1">
                  Proposed New Schedule
                </Text>
                {sessionDetail?.proposedRescheduleStartAt ? (
                  <View>
                    <Text className="text-sm text-gray-900 font-semibold">
                      {new Date(
                        sessionDetail.proposedRescheduleStartAt,
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
                        sessionDetail.proposedRescheduleStartAt,
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      -{" "}
                      {sessionDetail?.proposedRescheduleEndAt
                        ? new Date(
                            sessionDetail.proposedRescheduleEndAt,
                          ).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : "???"}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-sm text-gray-500 italic">
                    No date info available
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          {/* Patient-side banner for pending reschedule approval */}

          {!isTherapistUser &&
          isPendingRescheduleApproval &&
          sessionDetail?.proposedRescheduleStartAt &&
          sessionDetail?.proposedRescheduleEndAt
            ? (() => {
                const hasReliever =
                  sessionDetail?.isRelieverProposed ||
                  !!sessionDetail?.relieverTherapistId ||
                  !!sessionDetail?.relieverTherapistName;
                const relieverName =
                  sessionDetail?.relieverTherapistName ||
                  "Substitute Therapist";
                console.log("[session-detail.tsx BANNER]", {
                  hasReliever,
                  relieverName,
                  isRelieverProposed: sessionDetail?.isRelieverProposed,
                  relieverTherapistId: sessionDetail?.relieverTherapistId,
                  relieverTherapistName: sessionDetail?.relieverTherapistName,
                });

                return (
                  <View className="bg-teal-50 border border-blue-200 rounded-xl p-4 mb-4">
                    <Text className="text-sm font-bold text-blue-800 mb-1">
                      📅 Reschedule Proposal
                    </Text>
                    <Text className="text-xs text-red-600 font-bold mb-1">
                      🔴 TEST: relieverTherapistName ={" "}
                      {sessionDetail?.relieverTherapistName || "NULL"},
                      isRelieverProposed ={" "}
                      {String(sessionDetail?.isRelieverProposed)}
                    </Text>
                    <Text className="text-xs text-blue-800 mb-2">
                      Your therapist has requested to reschedule this session
                      {hasReliever
                        ? ` with substitute therapist ${relieverName}`
                        : ""}
                      .
                    </Text>
                    {sessionDetail?.rescheduleProposalReason ? (
                      <Text className="text-xs text-blue-700 mb-3 italic">
                        {`"${sessionDetail.rescheduleProposalReason}"`}
                      </Text>
                    ) : null}

                    {/* Show reliever therapist info if proposed */}
                    {hasReliever && (
                      <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                        <Text className="text-xs font-semibold text-amber-800 mb-1">
                          👥 Reliever Therapist Assigned
                        </Text>
                        <View className="flex-row items-center mt-1">
                          <View className="w-8 h-8 rounded-full bg-amber-100 items-center justify-center mr-2">
                            <Text className="text-amber-700 font-bold text-sm">
                              {(sessionDetail?.relieverTherapistName || "S")
                                .split(" ")
                                .map((n: string) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-amber-900">
                              {relieverName}
                            </Text>
                            {sessionDetail?.relieverTherapistSpecialty ? (
                              <Text className="text-xs text-amber-700">
                                {sessionDetail.relieverTherapistSpecialty}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Text className="text-xs text-amber-700 mt-2">
                          Will handle this session on behalf of{" "}
                          {baseData.therapistName || "your therapist"}
                        </Text>
                        {sessionDetail.relieverSubstitutionReason ? (
                          <View className="bg-amber-100 p-2 rounded-md border border-amber-200 mt-2">
                            <Text className="text-xs text-amber-800 italic">
                              Reason: {'"'}
                              {sessionDetail.relieverSubstitutionReason}
                              {'"'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    )}

                    <View className="bg-white rounded-lg p-3 mb-3 border border-blue-100">
                      <Text className="text-xs text-teal-600 font-medium mb-1">
                        Proposed New Schedule
                      </Text>
                      <Text className="text-sm text-gray-900 font-semibold">
                        {new Date(
                          sessionDetail.proposedRescheduleStartAt,
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
                          sessionDetail.proposedRescheduleStartAt,
                        ).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}{" "}
                        -{" "}
                        {new Date(
                          sessionDetail.proposedRescheduleEndAt,
                        ).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => approveRescheduleMutation.mutate()}
                        disabled={
                          declineRescheduleMutation.isPending ||
                          approveRescheduleMutation.isPending
                        }
                        className="flex-1 bg-teal-600 py-2.5 px-4 rounded-lg items-center justify-center"
                      >
                        <Text className="text-white font-semibold text-sm">
                          {approveRescheduleMutation.isPending
                            ? "Acknowledging..."
                            : "Acknowledge"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => declineRescheduleMutation.mutate()}
                        disabled={
                          declineRescheduleMutation.isPending ||
                          approveRescheduleMutation.isPending
                        }
                        className="flex-1 bg-white border border-red-300 py-2.5 px-4 rounded-lg items-center justify-center"
                      >
                        <Text className="text-red-600 font-semibold text-sm">
                          {declineRescheduleMutation.isPending
                            ? "Declining..."
                            : "Decline"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()
            : null}

          {isSessionCancelled && !isContractEnded ? (
            <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <Text className="text-sm font-bold text-red-800 mb-1">
                Session Rescheduled/Cancelled
              </Text>
              <Text className="text-xs text-red-800">
                {sessionDetail?.cancelledBy
                  ? `Cancelled by ${
                      sessionDetail.cancelledBy === "Therapist"
                        ? "Physical Therapist"
                        : "Patient"
                    }`
                  : "This session has been cancelled."}
              </Text>
              {sessionDetail?.cancellationReason ? (
                <Text className="text-xs text-red-700 mt-2 italic">
                  {`“${sessionDetail.cancellationReason}”`}
                </Text>
              ) : null}
              {/* Reschedule button - only for assigned therapist and if not already rescheduled */}
              {isTherapistUser &&
              sessionDetail?.physicalTherapistId === (myTherapist as any)?.id &&
              !sessionDetail?.isRescheduled ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openReschedulePicker}
                  className="bg-teal-600 py-2.5 px-4 rounded-lg mt-3 items-center justify-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Reschedule Session
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Therapist */}
          <View className="flex-row items-center gap-2 mb-2">
            <Text className="text-xs text-gray-500">
              {sessionDetail?.isRelieverProposed
                ? "Current Therapist"
                : "Physical Therapist"}
            </Text>
            {sessionDetail?.isRelieverSession && (
              <View className="bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                <Text className="text-[10px] text-amber-700 font-semibold">
                  Substitute
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={handleTherapistPress}
            className="bg-white border-2 border-teal-600 rounded-xl p-4 flex-row items-center active:bg-teal-50"
            activeOpacity={0.7}
          >
            <View className="flex-1">
              <View className="flex-row justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-xs text-teal-600 font-medium">
                    Name
                  </Text>
                  <Text className="text-sm text-gray-900 font-semibold mt-0.5">
                    {data.therapistName}
                  </Text>
                </View>
                <View className="flex-1 pl-2 items-end">
                  <Text className="text-xs text-teal-600 font-medium">
                    License No.
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-sm text-gray-900 font-semibold mt-0.5">
                      {formatLicense(
                        // Prefer fetched detail first (camel or Pascal), then explicit param, else placeholder
                        therapistDetail?.licenseNumber ||
                          (therapistDetail as any)?.LicenseNumber ||
                          (therapistByUser as any)?.licenseNumber ||
                          (therapistByUser as any)?.LicenseNumber ||
                          (myTherapist as any)?.licenseNumber ||
                          (myTherapist as any)?.LicenseNumber ||
                          data.therapistLicense ||
                          undefined,
                      )}
                    </Text>
                    <IdCard size={18} color="#0D9488" />
                  </View>
                </View>
              </View>
            </View>
            <ChevronRight
              color="#0D9488"
              size={22}
              className="ml-2"
              strokeWidth={2.5}
            />
          </TouchableOpacity>

          {/* Patient */}
          <Text className="text-xs text-gray-500 mb-2 mt-4">Patient</Text>
          <TouchableOpacity
            onPress={handlePatientPress}
            activeOpacity={0.7}
            className="bg-white border-2 border-teal-600 rounded-xl p-4 flex-row items-center active:bg-teal-50"
          >
            <View className="flex-1">
              <View className="flex-row justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-xs text-teal-600 font-medium">
                    Name
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-sm text-gray-900 font-semibold mt-0.5">
                      {data.patientName}
                    </Text>
                    <User size={18} color="#0D9488" />
                  </View>
                </View>
                <View className="flex-1 pl-2 items-end">
                  <Text className="text-xs text-teal-600 font-medium">Age</Text>
                  <Text className="text-sm text-gray-900 font-semibold mt-0.5">
                    {data.patientAge}
                  </Text>
                </View>
              </View>
            </View>
            <ChevronRight
              color="#0D9488"
              size={22}
              className="ml-2"
              strokeWidth={2.5}
            />
          </TouchableOpacity>

          {/* Case */}
          <Text className="text-xs text-gray-500 mb-2 mt-4">Case</Text>
          {canEditSession ? (
            <TextInput
              className="border border-gray-200 rounded-lg px-2.5 py-2 bg-white mx-0.5"
              value={form.caseTitle}
              onChangeText={(v) => setForm((s) => ({ ...s, caseTitle: v }))}
              placeholder="e.g., Muscle Strain"
            />
          ) : (
            <Text className="text-sm text-gray-900">{data.caseTitle}</Text>
          )}

          {/* Location */}
          <Text className="text-xs text-gray-500 mb-2 mt-4">Location</Text>
          <View
            className={`rounded-xl overflow-hidden border border-gray-200 bg-white mb-2 ${
              isDesktop ? "border-l-4 border-l-[#089769]" : ""
            }`}
          >
            <View className="p-4 pb-2">
              <View className="flex-row items-center gap-1.5">
                <MapPin size={18} color="#089769" />
                <Text className="ml-1.5 text-sm text-gray-900 flex-shrink">
                  {data.address}
                </Text>
              </View>
            </View>
            {/* Debug: Log location data being passed to map */}
            {(() => {
              console.log("[SessionDetail] Map data:", {
                isTherapistUser,
                isPatient: !isTherapistUser,
                selectedRole,
                coord: data.coord,
                therapistSavedLocation: data.therapistSavedLocation,
                patientSavedLocation: data.patientSavedLocation,
                address: data.rawAddress,
              });
              return null;
            })()}
            <View style={{ height: 180, width: "100%" }}>
              <EmbeddedLocationMap
                dest={[data.coord.longitude, data.coord.latitude]}
                address={data.rawAddress}
                isPatient={selectedRole === "Patient"}
                therapistSavedLocation={
                  data.therapistSavedLocation
                    ? [
                        data.therapistSavedLocation.longitude,
                        data.therapistSavedLocation.latitude,
                      ]
                    : null
                }
                patientSavedLocation={
                  data.patientSavedLocation
                    ? [
                        data.patientSavedLocation.longitude,
                        data.patientSavedLocation.latitude,
                      ]
                    : [data.coord.longitude, data.coord.latitude]
                }
                onOpenFullMap={() =>
                  router.push({
                    pathname: "/session-map",
                    params: {
                      lat: String(data.coord.latitude),
                      lng: String(data.coord.longitude),
                      address: data.rawAddress,
                      barangay: data.barangay ?? undefined,
                      sessionId: sessionId ? String(sessionId) : undefined,
                      profileId: profileIdParam ?? undefined,
                      // Pass therapist saved location for routing
                      therapistLat:
                        data.therapistSavedLocation?.latitude != null
                          ? String(data.therapistSavedLocation.latitude)
                          : undefined,
                      therapistLng:
                        data.therapistSavedLocation?.longitude != null
                          ? String(data.therapistSavedLocation.longitude)
                          : undefined,
                      // Pass patient saved location
                      patientLat:
                        data.patientSavedLocation?.latitude != null
                          ? String(data.patientSavedLocation.latitude)
                          : String(data.coord.latitude),
                      patientLng:
                        data.patientSavedLocation?.longitude != null
                          ? String(data.patientSavedLocation.longitude)
                          : String(data.coord.longitude),
                    },
                  })
                }
              />
            </View>
          </View>

          {/* Schedule */}
          <View className="mt-3">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs text-gray-500">
                {sessionDetail?.isRescheduled ? "Rescheduled on" : "Schedule"}
              </Text>
              {sessionDetail?.isRescheduled && sessionDetail?.rescheduledAt && (
                <View className="bg-amber-100 px-2 py-0.5 rounded">
                  <Text className="text-[10px] font-semibold text-amber-700">
                    {new Date(sessionDetail.rescheduledAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </Text>
                </View>
              )}
            </View>
            {canEditSession ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openSchedulePicker}
                className="border border-gray-200 rounded-lg px-2.5 py-2 bg-white justify-center mt-0.5"
              >
                <Text
                  className={
                    form.day && form.timeRange
                      ? "text-gray-900"
                      : "text-gray-400"
                  }
                >
                  {form.day && form.timeRange
                    ? `${form.day} (${form.timeRange})`
                    : "Select from therapist availability"}
                </Text>
              </TouchableOpacity>
            ) : sessionDetail?.isRescheduled ? (
              <View className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-0.5">
                <Text className="text-sm text-amber-900 font-semibold">
                  {data.day && data.timeRange
                    ? `${data.day} (${data.timeRange})`
                    : data.day || data.timeRange || "Not set"}
                </Text>
              </View>
            ) : (
              <Text className="text-sm text-gray-900 mt-0.5">
                {data.day && data.timeRange
                  ? `${data.day} (${data.timeRange})`
                  : data.day || data.timeRange || "Not set"}
              </Text>
            )}
          </View>

          {/* Availability picker modal */}
          <Modal
            visible={schedulePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={closeSchedulePicker}
          >
            <View className="flex-1 bg-black/45 items-center justify-center p-5">
              <View className="w-full max-w-lg bg-white rounded-2xl p-5">
                <View className="mb-2.5">
                  <Text className="text-lg font-bold text-gray-900">
                    {schedulePickerDay == null
                      ? "Select Available Day"
                      : `Select a Time (${selectedDayLabel ?? ""})`}
                  </Text>
                </View>
                {isSlotDataLoading ? (
                  <View className="py-12 items-center justify-center">
                    <ActivityIndicator color="#0D9488" />
                    <Text className="text-xs text-gray-500 mt-2">
                      Loading availability...
                    </Text>
                  </View>
                ) : schedulePickerDay == null ? (
                  dayOptions.length === 0 ? (
                    <Text className="text-xs text-gray-500">
                      No availability found for this therapist.
                    </Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 360 }}>
                      {dayOptions.map((day) => {
                        // Calculate slot availability details
                        const now = new Date();
                        const today = now.getDay();

                        let availableCount = 0;
                        let pastCount = 0;
                        let bookedCount = 0;

                        day.slots.forEach((slot) => {
                          const slotKey = `${day.dow}-${slot.start}`;
                          const isBooked = conflictKeySet.has(slotKey);

                          // Check if past (for today)
                          let isPastSlot = false;
                          if (day.dow === today) {
                            const [slotHour, slotMin] = slot.start
                              .split(":")
                              .map(Number);
                            const slotDate = new Date();
                            slotDate.setHours(slotHour, slotMin, 0, 0);
                            isPastSlot = slotDate < now;
                          }

                          if (isBooked) bookedCount++;
                          else if (isPastSlot) pastCount++;
                          else availableCount++;
                        });

                        const hasNoAvailableSlots = availableCount === 0;
                        const isPastDay = day.dow < today;
                        const allSlotsPassed =
                          pastCount > 0 &&
                          bookedCount === 0 &&
                          availableCount === 0;
                        const allSlotsBooked =
                          bookedCount > 0 &&
                          pastCount === 0 &&
                          availableCount === 0;
                        const mixedUnavailable =
                          hasNoAvailableSlots &&
                          pastCount > 0 &&
                          bookedCount > 0;

                        // Determine the status label
                        let statusLabel = "";
                        if (isPastDay) {
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

                        // Only disable for past days or fully booked - keep "all slots passed" clickable
                        const isClickDisabled = isPastDay || allSlotsBooked;
                        const isGreyedOut = isPastDay || allSlotsBooked;

                        return (
                          <TouchableOpacity
                            key={day.dow}
                            className={`flex-row justify-between items-center px-3 py-2 border rounded-lg mb-2 ${
                              isGreyedOut
                                ? "border-gray-100 bg-gray-50"
                                : allSlotsPassed
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-gray-200 bg-white"
                            }`}
                            activeOpacity={isClickDisabled ? 1 : 0.8}
                            disabled={isClickDisabled}
                            onPress={() =>
                              !isClickDisabled && setSchedulePickerDay(day.dow)
                            }
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
                              {day.label}
                            </Text>
                            <View className="flex-row items-center gap-1.5">
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
                                    {availableCount}{" "}
                                    {availableCount === 1 ? "slot" : "slots"}
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
                  )
                ) : currentDaySlots.length === 0 ? (
                  <Text className="text-xs text-gray-500">
                    No 1-hour slots available on {selectedDayLabel}.
                  </Text>
                ) : (
                  (() => {
                    // Check if all slots have passed for the selected day
                    const now = new Date();
                    const today = now.getDay();
                    const allSlotsArePast =
                      schedulePickerDay === today &&
                      currentDaySlots.every((slot) => {
                        const [slotHour, slotMin] = slot.start
                          .split(":")
                          .map(Number);
                        const slotDate = new Date();
                        slotDate.setHours(slotHour, slotMin, 0, 0);
                        return slotDate < now;
                      });

                    return (
                      <>
                        {allSlotsArePast && (
                          <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                            <Text className="text-sm font-semibold text-amber-800 mb-1">
                              ⏰ All time slots for today have passed
                            </Text>
                            <Text className="text-xs text-amber-700">
                              The time slots shown below are no longer available
                              for booking today.
                            </Text>
                          </View>
                        )}
                        <ScrollView
                          style={{ maxHeight: allSlotsArePast ? 200 : 360 }}
                        >
                          <View className="flex-row flex-wrap gap-2">
                            {currentDaySlots.map((slot) => {
                              const slotKey = `${schedulePickerDay}-${slot.start}`;
                              const isTaken = conflictKeySet.has(slotKey);
                              const label = `${hhmmTo12(
                                slot.start,
                              )} - ${hhmmTo12(slot.end)}`;

                              // Check if this slot is in the past
                              let isPast = false;
                              if (schedulePickerDay != null) {
                                const now = new Date();
                                const today = now.getDay();

                                // If slot is for today, check if the time has passed
                                if (schedulePickerDay === today) {
                                  const [slotHour, slotMin] = slot.start
                                    .split(":")
                                    .map(Number);
                                  const slotDate = new Date();
                                  slotDate.setHours(slotHour, slotMin, 0, 0);
                                  isPast = slotDate < now;
                                }
                              }

                              const isUnavailable = isTaken || isPast;
                              const isSelected =
                                !isUnavailable &&
                                pendingSlotSelection?.dayDow ===
                                  schedulePickerDay &&
                                pendingSlotSelection?.start === slot.start &&
                                pendingSlotSelection?.end === slot.end;
                              const chipClasses = isPast
                                ? "bg-gray-100 border-gray-200"
                                : isTaken
                                  ? "bg-red-100 border-red-200"
                                  : isSelected
                                    ? "bg-teal-600 border-teal-600"
                                    : "bg-gray-100 border-transparent";
                              return (
                                <TouchableOpacity
                                  key={slotKey}
                                  disabled={isUnavailable}
                                  activeOpacity={isUnavailable ? 1 : 0.85}
                                  onPress={() => {
                                    if (isUnavailable) return;
                                    if (isSelected) {
                                      setPendingSlotSelection(null);
                                      return;
                                    }
                                    const dayDow = schedulePickerDay!;
                                    setPendingSlotSelection({
                                      dayDow,
                                      start: slot.start,
                                      end: slot.end,
                                      label,
                                    });
                                  }}
                                  className={`py-2 px-3 rounded-full border ${chipClasses}`}
                                  style={
                                    isUnavailable
                                      ? { opacity: 0.6 }
                                      : isSelected
                                        ? {
                                            shadowColor: "#0D9488",
                                            shadowOpacity: 0.35,
                                            shadowRadius: 6,
                                          }
                                        : undefined
                                  }
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      isPast
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
                                  {isPast && isTaken ? (
                                    <View>
                                      <Text className="text-[10px] text-gray-400 text-center">
                                        Past
                                      </Text>
                                      <Text className="text-[10px] text-red-400 text-center">
                                        Booked
                                      </Text>
                                    </View>
                                  ) : isPast ? (
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
                    );
                  })()
                )}
                <View className="h-3" />
                {schedulePickerDay == null ? (
                  <TouchableOpacity
                    onPress={closeSchedulePicker}
                    className="self-end bg-gray-800 px-3.5 py-2.5 rounded-lg"
                  >
                    <Text className="text-white font-semibold">Close</Text>
                  </TouchableOpacity>
                ) : (
                  <View className="flex-row justify-end gap-2">
                    <TouchableOpacity
                      onPress={() => setSchedulePickerDay(null)}
                      className="px-3.5 py-2.5 rounded-lg border border-gray-300"
                    >
                      <Text className="text-gray-700 font-semibold">Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={
                        !pendingSlotSelection ||
                        pendingSlotSelection.dayDow !== schedulePickerDay
                      }
                      onPress={confirmPendingSlot}
                      className={`px-3.5 py-2.5 rounded-lg ${
                        pendingSlotSelection &&
                        pendingSlotSelection.dayDow === schedulePickerDay
                          ? "bg-teal-600"
                          : "bg-blue-200"
                      }`}
                      style={{
                        opacity:
                          !pendingSlotSelection ||
                          pendingSlotSelection.dayDow !== schedulePickerDay
                            ? 0.6
                            : 1,
                      }}
                    >
                      <Text className="text-white font-semibold">Confirm</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </Modal>

          <InAppModal
            visible={confirmSlotModal != null}
            title="Confirm Schedule"
            message={
              confirmSlotModal
                ? `Set session to ${confirmSlotModal.dayLabel} at ${confirmSlotModal.label}?`
                : undefined
            }
            confirmText="Yes, confirm"
            cancelText="Go back"
            showCancel
            onCancel={() => setConfirmSlotModal(null)}
            onConfirm={async () => {
              if (!confirmSlotModal) return;
              const { conflict } = await detectActiveSessionConflict();
              if (conflict) {
                setConfirmSlotModal(null);
                return;
              }
              setForm((s) => ({
                ...s,
                day: confirmSlotModal.dayLabel,
                timeRange: confirmSlotModal.label,
              }));
              setConfirmSlotModal(null);
              closeSchedulePicker();
            }}
          />

          {/* Reschedule Picker Modal - For therapists rescheduling cancelled sessions */}
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

                {/* Note about original time being disabled */}
                {rescheduleMode && originalSessionSlotKey ? (
                  <View className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                    <Text className="text-xs text-amber-700">
                      Note: The original cancelled time slot is disabled. Please
                      select a different time.
                    </Text>
                  </View>
                ) : null}

                {isSlotDataLoading ? (
                  <View className="py-12 items-center justify-center">
                    <ActivityIndicator color="#0D9488" />
                    <Text className="text-xs text-gray-500 mt-2">
                      Loading availability...
                    </Text>
                  </View>
                ) : reschedulePickerDay == null ? (
                  dayOptions.length === 0 ? (
                    <Text className="text-xs text-gray-500">
                      No availability found for this therapist.
                    </Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 360 }}>
                      {dayOptions.map((day) => {
                        const isOriginalDay = Boolean(
                          originalSessionSlotKey &&
                          String(originalSessionSlotKey).startsWith(
                            `${day.dow}-`,
                          ),
                        );
                        return (
                          <TouchableOpacity
                            key={day.dow}
                            className={`flex-row justify-between items-center px-3 py-2 border rounded-lg mb-2 ${
                              isOriginalDay
                                ? "bg-amber-50 border-amber-200"
                                : "bg-white border-gray-200"
                            }`}
                            activeOpacity={0.8}
                            onPress={() => setReschedulePickerDay(day.dow)}
                          >
                            <Text
                              className={`text-sm font-semibold ${
                                isOriginalDay
                                  ? "text-amber-800"
                                  : "text-gray-900"
                              }`}
                            >
                              {dowToDayLabel(day.dow)}
                            </Text>
                            <View className="flex-row items-center gap-3">
                              {day.dateLabel ? (
                                <Text className="text-xs text-gray-500">
                                  {day.dateLabel}
                                </Text>
                              ) : null}
                              <Text className="text-xs text-gray-500">
                                {day.slots.length} slots
                              </Text>
                              {isOriginalDay ? (
                                <View className="bg-amber-100 px-2 py-1 rounded-full border border-amber-200">
                                  <Text className="text-[11px] text-amber-700 font-semibold">
                                    Original
                                  </Text>
                                </View>
                              ) : null}
                              <ChevronRight size={16} color="#4B5563" />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )
                ) : rescheduleCurrentDaySlots.length === 0 ? (
                  <Text className="text-xs text-gray-500">
                    No 1-hour slots available on {rescheduleSelectedDayLabel}.
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 360 }}>
                    <View className="flex-row flex-wrap gap-2">
                      {rescheduleCurrentDaySlots.map((slot) => {
                        const slotKey = `${reschedulePickerDay}-${slot.start}`;
                        const isTaken = conflictKeySet.has(slotKey);
                        // Disable original cancelled session slot
                        const isOriginalSlot =
                          rescheduleMode && slotKey === originalSessionSlotKey;
                        const isDisabled = isTaken || isOriginalSlot;
                        const label = `${hhmmTo12(slot.start)} - ${hhmmTo12(
                          slot.end,
                        )}`;
                        const isSelected =
                          !isDisabled &&
                          pendingRescheduleSlot?.dayDow ===
                            reschedulePickerDay &&
                          pendingRescheduleSlot?.start === slot.start &&
                          pendingRescheduleSlot?.end === slot.end;
                        const chipClasses = isOriginalSlot
                          ? "bg-amber-100 border-amber-300"
                          : isTaken
                            ? "bg-red-100 border-red-200"
                            : isSelected
                              ? "bg-teal-600 border-teal-600"
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
                              setPendingRescheduleSlot({
                                dayDow,
                                start: slot.start,
                                end: slot.end,
                                label,
                              });
                            }}
                            className={`py-2 px-3 rounded-full border ${chipClasses}`}
                            style={
                              isDisabled
                                ? { opacity: 0.7 }
                                : isSelected
                                  ? {
                                      shadowColor: "#0D9488",
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
                        const dayLabel = dowToDayLabel(
                          pendingRescheduleSlot.dayDow,
                        );
                        if (!dayLabel) return;
                        setConfirmRescheduleModal({
                          dayLabel,
                          label: pendingRescheduleSlot.label,
                        });
                      }}
                      className={`px-3.5 py-2.5 rounded-lg ${
                        pendingRescheduleSlot &&
                        pendingRescheduleSlot.dayDow === reschedulePickerDay
                          ? "bg-teal-600"
                          : "bg-blue-200"
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
              rescheduleMutation.isPending
                ? "Rescheduling..."
                : "Yes, reschedule"
            }
            cancelText="Go back"
            showCancel
            isConfirmDisabled={rescheduleMutation.isPending}
            onCancel={() => setConfirmRescheduleModal(null)}
            onConfirm={async () => {
              if (!confirmRescheduleModal || !pendingRescheduleSlot) return;

              // Calculate the next occurrence of the selected day
              const now = new Date();
              const currentDow = now.getDay();
              const targetDow = pendingRescheduleSlot.dayDow;

              // Calculate days until the next occurrence of targetDow
              let daysUntil = targetDow - currentDow;
              if (daysUntil <= 0) {
                // If same day or past, schedule for next week
                daysUntil += 7;
              }

              const targetDate = new Date(now);
              targetDate.setDate(now.getDate() + daysUntil);

              // Parse the start and end times from pendingRescheduleSlot
              const [startHours, startMinutes] = pendingRescheduleSlot.start
                .split(":")
                .map(Number);
              const [endHours, endMinutes] = pendingRescheduleSlot.end
                .split(":")
                .map(Number);

              // Create the new start and end DateTime objects
              const newStartAt = new Date(targetDate);
              newStartAt.setHours(startHours, startMinutes, 0, 0);

              const newEndAt = new Date(targetDate);
              newEndAt.setHours(endHours, endMinutes, 0, 0);

              if (isPickingRescheduleForCancel) {
                setSelectedRescheduleStartAt(newStartAt.toISOString());
                setSelectedRescheduleEndAt(newEndAt.toISOString());
                setIsPickingRescheduleForCancel(false);
                setConfirmRescheduleModal(null);
                closeReschedulePicker();
              } else {
                // Call the reschedule mutation
                rescheduleMutation.mutate({
                  newStartAt: newStartAt.toISOString(),
                  newEndAt: newEndAt.toISOString(),
                });

                setConfirmRescheduleModal(null);
              }
            }}
          />

          {/* Cost Breakdown */}
          <Text className="text-xs text-gray-500 mb-2 mt-4">
            Cost Breakdown
          </Text>
          <View className="bg-white border border-gray-200 rounded-xl p-3">
            <View className="flex-row justify-between py-1.5">
              <Text className="text-sm text-gray-900">Professional Fee</Text>
              {canEditSession ? (
                <Text className="text-sm text-gray-900">
                  {formatMoney(form.professionalFee)}
                </Text>
              ) : (
                <Text className="text-sm text-gray-900">{data.fee}</Text>
              )}
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-sm text-gray-900">Location</Text>
              {canEditSession ? (
                <TextInput
                  className="border border-gray-200 rounded-lg px-2.5 py-2 bg-white min-w-[90px] text-right"
                  value={String(form.locationFee)}
                  onChangeText={(v) =>
                    setForm((s) => ({
                      ...s,
                      locationFee: Number(v.replace(/[^0-9.]/g, "")) || 0,
                    }))
                  }
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                />
              ) : (
                <Text className="text-sm text-gray-900">{data.locFee}</Text>
              )}
            </View>
            <View className="flex-row justify-between py-1.5">
              <Text className="text-sm text-gray-900">Miscellaneous</Text>
              {canEditSession ? (
                <TextInput
                  className="border border-gray-200 rounded-lg px-2.5 py-2 bg-white min-w-[90px] text-right"
                  value={String(form.toolsFee)}
                  onChangeText={(v) =>
                    setForm((s) => ({
                      ...s,
                      toolsFee: Number(v.replace(/[^0-9.]/g, "")) || 0,
                    }))
                  }
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                />
              ) : (
                <Text className="text-sm text-gray-900">{data.toolsFee}</Text>
              )}
            </View>
            <View className="h-px bg-gray-200 my-1.5" />
            <View className="flex-row justify-between py-1.5">
              <Text className="text-sm text-gray-900 font-bold">Total</Text>
              {canEditSession ? (
                <Text className="text-sm text-gray-900 font-bold">
                  {formatMoney(form.total)}
                </Text>
              ) : (
                <Text className="text-sm text-gray-900 font-bold">
                  {data.total}
                </Text>
              )}
            </View>
          </View>

          {/* Confirm button moved to fixed bottom bar to avoid covering content */}

          {/* Doctor's Referral section removed by request */}

          {/* End Contract Button - Only for therapists on active contracts */}
          {/* Also explicitly show for "Done For Today" sessions since therapist may want to end the contract */}
          {shouldShowEndSessionSection ? (
            <View
              className="px-4.5 py-4"
              style={{ marginBottom: showBottomActions ? 80 : 16 }}
            >
              {!showEndContractOptions ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowEndContractOptions(true)}
                  className="bg-amber-500 py-3.5 rounded-lg items-center justify-center"
                >
                  <Text className="text-white font-semibold text-base">
                    End Session
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="w-full">
                  <View className="flex-row w-full mb-2">
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isEndingContract}
                      onPress={() => {
                        setEndSessionType("Completed");
                        setEndSessionConfirmText("");
                        setEndSessionReason("");
                        setEndSessionModalVisible(true);
                      }}
                      className="flex-1 py-3.5 rounded-lg items-center justify-center bg-green-500 mr-2"
                    >
                      {isEndingContract ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-semibold text-base">
                          Completed
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isEndingContract}
                      onPress={() => {
                        setEndSessionType("Terminated");
                        setEndSessionConfirmText("");
                        setEndSessionReason("");
                        setEndSessionModalVisible(true);
                      }}
                      className="flex-1 py-3.5 rounded-lg items-center justify-center bg-red-600 ml-2"
                    >
                      {isEndingContract ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-semibold text-base">
                          Discontinued
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isEndingContract}
                    onPress={() => setShowEndContractOptions(false)}
                    className="w-full py-3.5 rounded-lg items-center justify-center bg-gray-400"
                  >
                    <Text className="text-white font-semibold text-base">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}
          {isTherapistUser &&
          sessionDetail?.contractId &&
          !isSessionCancelled &&
          !isSessionCompleted &&
          !isSessionTerminated &&
          !isContractActive &&
          contractStatus ? (
            <View
              className="px-4.5 py-4"
              style={{ marginBottom: showBottomActions ? 80 : 16 }}
            >
              <Text className="text-xs text-red-700">
                This contract is already{" "}
                {toDisplayStatus(sessionDetail.contractStatus)} and can no
                longer be ended.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {/* Therapist: Mark session completed */}
      {isTherapistUser &&
        !isSessionCancelled &&
        !isSessionCompleted &&
        !isSessionTerminated &&
        !isContractEnded && (
          <View className="px-4.5 py-4">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="bg-green-500 py-3.5 rounded-lg items-center justify-center"
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Mark Session Completed
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      {/* Patient: Rate session (when session or contract is ended) */}
      {!isTherapistUser &&
      (isSessionCompleted || isSessionTerminated || isContractEnded) &&
      !hasRated ? (
        <View className="px-4.5 py-4">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setRatingModalVisible(true)}
            className="bg-teal-600 py-3.5 rounded-lg items-center justify-center"
          >
            <Text className="text-white font-semibold text-base">
              Rate Session
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Therapist: Rate session (when session or contract is ended) */}
      {isTherapistUser &&
      (isSessionCompleted || isSessionTerminated || isContractEnded) &&
      !hasRated ? (
        <View className="px-4.5 py-4">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setRatingModalVisible(true)}
            className="bg-teal-600 py-3.5 rounded-lg items-center justify-center"
          >
            <Text className="text-white font-semibold text-base">
              Rate Session
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Rating modal */}
      <Modal
        visible={ratingModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View className="flex-1 bg-black/45 items-center justify-center p-5">
          <View className="w-full max-w-lg bg-white rounded-2xl p-5">
            <Text className="text-lg font-bold text-gray-900 mb-2">
              Rate Your Session
            </Text>
            <Text className="text-sm text-gray-600 mb-4">
              How was your experience?{" "}
              {ratingScore == null && "(Please select a rating)"}
            </Text>

            <View className="flex-row justify-center mb-4 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRatingScore(n)}
                  activeOpacity={0.7}
                >
                  <Star
                    size={40}
                    color={
                      ratingScore && n <= ratingScore ? "#FCD34D" : "#D1D5DB"
                    }
                    fill={
                      ratingScore && n <= ratingScore
                        ? "#FCD34D"
                        : "transparent"
                    }
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              placeholder="Optional comment"
              placeholderTextColor="#9CA3AF"
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={4}
              className="border border-gray-300 rounded-lg px-3 py-2.5 min-h-[110px] text-sm text-gray-900 mb-5"
            />

            <View className="flex-row justify-end items-center gap-3 mt-1">
              <TouchableOpacity
                onPress={() => setRatingModalVisible(false)}
                className="py-3 px-6 rounded-lg bg-gray-100 flex-shrink-0"
                disabled={ratingMutation.isPending}
              >
                <Text
                  className={`font-semibold text-base ${
                    ratingMutation.isPending ? "text-gray-400" : "text-gray-900"
                  }`}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => ratingMutation.mutate()}
                className={`py-3 px-6 rounded-lg flex-shrink-0 min-w-[120px] items-center ${
                  ratingMutation.isPending ? "bg-teal-400" : "bg-teal-600"
                }`}
                disabled={ratingMutation.isPending || ratingScore == null}
              >
                {ratingMutation.isPending ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#fff" size="small" />
                    <Text className="text-white font-semibold text-base">
                      Submitting...
                    </Text>
                  </View>
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Submit Rating
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Patient: Accept/Decline proposal when pending */}
      {!isTherapistUser && isContractPending ? (
        <View className="px-4.5 py-4 flex-row gap-3">
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isPatientActionProcessing}
            onPress={() => setPendingPatientAction("accept")}
            className="bg-green-500 py-3.5 rounded-lg items-center justify-center flex-1"
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Accept</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isPatientActionProcessing}
            onPress={() => setPendingPatientAction("decline")}
            className="bg-red-600 py-3.5 rounded-lg items-center justify-center flex-1"
          >
            {declineMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Decline
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <InAppModal
        visible={pendingPatientAction !== null}
        title={
          pendingPatientAction === "accept"
            ? "Accept this session proposal?"
            : "Decline this session proposal?"
        }
        message={
          pendingPatientAction === "accept"
            ? "We'll let your therapist know that you're ready to move forward with this session."
            : "We'll let your therapist know that you're declining this session proposal."
        }
        confirmText={
          pendingPatientAction === "accept"
            ? isPatientActionProcessing
              ? "Processing..."
              : "Yes, accept"
            : isPatientActionProcessing
              ? "Processing..."
              : "Yes, decline"
        }
        cancelText="Go back"
        showCancel
        onCancel={() => {
          if (isPatientActionProcessing) return;
          setPendingPatientAction(null);
        }}
        onConfirm={() => {
          if (isPatientActionProcessing || !pendingPatientAction) return;
          if (pendingPatientAction === "accept") {
            acceptMutation.mutate();
          } else {
            declineMutation.mutate();
          }
        }}
      />
      {showBottomActions ? (
        isSessionDetailBusy ? (
          <View
            className="absolute left-0 right-0 bottom-0 py-4 px-4 bg-white border-t border-gray-200 items-center justify-center"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <ActivityIndicator color="#0D9488" />
          </View>
        ) : (
          <View
            className="absolute left-0 right-0 bottom-0 pt-2 bg-white border-t border-gray-200 items-stretch"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <View className="web:px-4 px-4 web:max-w-2xl web:mx-auto web:w-full">
              <View
                className={
                  showCancelButton && showConfirmButton
                    ? "flex-row items-center w-full"
                    : "w-full items-center"
                }
              >
                {showCancelButton ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleOpenCancelModal}
                    disabled={isCanceling}
                    className={`py-3.5 rounded-lg items-center justify-center border-2 border-orange-600 bg-white ${
                      showConfirmButton
                        ? "w-[200px] mr-2"
                        : "w-[240px] self-center"
                    }`}
                  >
                    {isCanceling ? (
                      <ActivityIndicator color="#EA580C" />
                    ) : (
                      <Text className="text-orange-600 font-bold text-base">
                        Reschedule Session
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {showConfirmButton ? (
                  <TouchableOpacity
                    disabled={isConfirming}
                    onPress={async () => {
                      setIsConfirming(true);
                      try {
                        const preparedContractId =
                          await createOrPrepareContract();
                        if (preparedContractId != null) {
                          setHasSentConfirm(true);
                          setConfirmInfoModalVisible(true);
                        }
                      } finally {
                        setIsConfirming(false);
                      }
                    }}
                    className={`py-3.5 rounded-lg items-center justify-center ${
                      showCancelButton
                        ? "flex-1 bg-teal-600 ml-2"
                        : "bg-teal-600"
                    }`}
                  >
                    {isConfirming ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-bold text-base">
                        {hasSentConfirm
                          ? "Resend Proposal"
                          : "Confirm Proposal"}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>

              {showCancelButton ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleOpenCancelSessionModal}
                  disabled={cancelSessionMutation.isPending}
                  className={`mt-2 py-3.5 rounded-lg items-center justify-center border-2 border-red-600 bg-white ${
                    showConfirmButton ? "w-full" : "w-[240px] self-center"
                  }`}
                >
                  {cancelSessionMutation.isPending ? (
                    <ActivityIndicator color="#DC2626" />
                  ) : (
                    <Text className="text-red-600 font-bold text-base">
                      Cancel Session
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )
      ) : null}
      <Modal
        visible={confirmInfoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmInfoModalVisible(false)}
      >
        <View className="flex-1 bg-black/45 items-center justify-center p-5">
          <View className="w-full max-w-lg bg-white rounded-2xl p-5">
            <Text className="text-lg font-bold text-gray-900 mb-2">
              Proposal Sent!
            </Text>
            <Text className="text-sm text-gray-600 mb-4">
              The session proposal has been sent to the patient for review. We
              will let you know when they respond.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setConfirmInfoModalVisible(false);
                redirectToConversation();
              }}
              className="py-3 px-4.5 rounded-lg bg-teal-600 self-end"
            >
              <Text className="text-white font-semibold">Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <InAppModal
        visible={activeSessionWarningVisible}
        title="Cannot Send Proposal"
        message={
          conflictWithOtherTherapist
            ? "This patient already has an active session or pending proposal with another therapist. A patient can only have one therapist at a time. They must complete or end their current therapy before starting with a new therapist."
            : "You already have an active session or pending proposal with this patient. Please wait for the patient to respond to your existing proposal, or complete/close the current session before creating a new one."
        }
        confirmText="Got it"
        cancelText="Keep editing"
        showCancel
        onCancel={() => {
          setActiveSessionWarningVisible(false);
          setConflictWithOtherTherapist(false);
        }}
        onConfirm={() => {
          setActiveSessionWarningVisible(false);
          setConflictWithOtherTherapist(false);
        }}
        variant="error"
        isDestructive
      />
      <InAppModal
        visible={cancelModalVisible}
        large
        title="Reschedule Session"
        message="Select a reason and propose a new date and time for this session. The patient will need to accept your proposal before the session is rescheduled."
        confirmText={isCanceling ? "Sending..." : "Send Proposal"}
        cancelText="Go Back"
        showCancel
        onCancel={handleCloseCancelModal}
        onConfirm={handleConfirmCancel}
        isConfirmDisabled={
          isCanceling ||
          !selectedRescheduleStartAt ||
          !isReasonValid(selectedCancelReasonId, cancelReason)
        }
        isDestructive
      >
        <CancellationReasonSelector
          isTherapist={true}
          selectedReasonId={selectedCancelReasonId}
          onSelectReason={setSelectedCancelReasonId}
          otherText={cancelReason}
          onOtherTextChange={setCancelReason}
        />
        <View className="mb-2">
          <TouchableOpacity
            onPress={() => openReschedulePicker(true)}
            className="px-3 py-2 rounded-lg border border-blue-300 bg-teal-50 items-center"
          >
            <Text className="text-sm text-blue-700 font-medium">
              {selectedRescheduleStartAt
                ? `New Schedule: ${new Date(
                    selectedRescheduleStartAt,
                  ).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Select New Date & Time"}
            </Text>
          </TouchableOpacity>
          {selectedRescheduleStartAt ? (
            <TouchableOpacity
              onPress={() => {
                setSelectedRescheduleStartAt(null);
                setSelectedRescheduleEndAt(null);
              }}
              className="mt-2"
            >
              <Text className="text-xs text-gray-500 underline text-center">
                Change date
              </Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-xs text-red-600 mt-2 text-center">
              Please select a new date and time for the session.
            </Text>
          )}
        </View>
      </InAppModal>

      <InAppModal
        visible={cancelSessionModalVisible}
        large
        title="Cancel Session"
        message="Please select a reason for cancelling this session. This will cancel the session immediately."
        confirmText={
          cancelSessionMutation.isPending ? "Cancelling..." : "Cancel Session"
        }
        cancelText="Go Back"
        showCancel
        onCancel={handleCloseCancelSessionModal}
        onConfirm={handleConfirmCancelSession}
        isConfirmDisabled={
          cancelSessionMutation.isPending ||
          !isReasonValid(selectedCancelSessionReasonId, cancelSessionReason)
        }
        isDestructive
      >
        <CancellationReasonSelector
          isTherapist={isTherapistUser}
          title="Reason for cancellation"
          selectedReasonId={selectedCancelSessionReasonId}
          onSelectReason={setSelectedCancelSessionReasonId}
          otherText={cancelSessionReason}
          onOtherTextChange={setCancelSessionReason}
        />
      </InAppModal>

      {/* End Session Confirmation Modal - Type to Confirm */}
      {isTherapistUser && (
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
                    isEndingContract ||
                    endSessionConfirmText.toUpperCase() !== "CONFIRM" ||
                    (endSessionType === "Terminated" &&
                      !endSessionReason.trim())
                  }
                  onPress={async () => {
                    if (!endSessionType) return;
                    await handleEndContract(
                      endSessionType,
                      endSessionReason.trim() || undefined,
                    );
                    setEndSessionModalVisible(false);
                    setEndSessionType(null);
                    setEndSessionConfirmText("");
                    setEndSessionReason("");
                    setShowEndContractOptions(false);
                  }}
                  className="flex-1 py-3.5 rounded-xl items-center justify-center"
                  style={{
                    backgroundColor:
                      endSessionConfirmText.toUpperCase() === "CONFIRM" &&
                      (endSessionType !== "Terminated" ||
                        endSessionReason.trim())
                        ? endSessionType === "Completed"
                          ? "#089769"
                          : "#DC2626"
                        : "#D1D5DB",
                    opacity:
                      isEndingContract ||
                      endSessionConfirmText.toUpperCase() !== "CONFIRM" ||
                      (endSessionType === "Terminated" &&
                        !endSessionReason.trim())
                        ? 0.6
                        : 1,
                  }}
                >
                  {isEndingContract ? (
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
      )}
    </SafeAreaView>
  );
}
