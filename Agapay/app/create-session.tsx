import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import apiClient from "@/api/client";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import { getTokens } from "@/src/auth/session";
import { toDisplayStatus } from "@/src/utils/statusLabels";

import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  IdCard,
  MapPin,
  Star,
  User,
  Calendar,
  Clock,
  FileText,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import WebHeader from "@/src/components/WebHeader";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatHistoryQueryKey } from "@/src/services/chat";
import InAppModal from "@/src/components/InAppModal";
import CancellationReasonSelector, {
  getFinalReasonText,
  isReasonValid,
} from "@/src/components/CancellationReasonSelector";
import { submitRating } from "@/src/services/ratings";
import {
  allSessionsQueryKey,
  cancelSession,
  completeSession,
  fetchSessionDetail,
  sessionDetailQueryKey,
  upcomingSessionsQueryKey,
  fetchSessionLogs,
  sessionLogsQueryKey,
  requestCancellation,
  approveReschedule,
  declineReschedule,
  type SessionLog,
} from "@/src/services/sessions";
import { PATIENT_RESCHEDULE_DECLINE_REASONS } from "@/src/constants/cancellationReasons";
import useSessionRealtime from "@/src/hooks/useSessionRealtime";
import { useLocationTracking } from "@/src/hooks/useLocationTracking";
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
import {
  fetchTherapistAvailability,
  type TherapistAvailability,
  fetchBookedIntervals,
} from "@/src/services/availability";
import {
  buildDayOptionsForWeek,
  discretizeAvailabilityForWeek,
} from "@/src/features/scheduling/core/slotting";
import { buildConflictKeySet } from "@/src/features/scheduling/core/conflicts";
import { getWeekRange } from "@/src/features/scheduling/core/weekRange";
import {
  fetchRecurringCommitments,
  getContractsForPatient,
  type RecurringCommitment,
} from "@/src/services/contracts";
import {
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import { getSyncedNow, syncServerTime } from "@/src/utils/serverTime";

type ContractSummary = {
  id: number;
  physicalTherapistId: number;
  status: string;
};

// Block creating new proposals if there's already an active, pending, or draft contract
const CONTRACT_BLOCKING_STATUSES = new Set<string>([
  "draft",
  "pendingconfirmation",
  "active",
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

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const SLOT_DURATION_MINUTES = 60;

// Mapbox token helper
const getMapboxToken = (): string | undefined => {
  const envToken =
    (typeof process !== "undefined" &&
      (process.env as any)?.EXPO_PUBLIC_MAPBOX_TOKEN) ||
    undefined;
  const extraToken = (Constants.expoConfig as any)?.extra?.mapboxAccessToken;
  return envToken || extraToken;
};

type GeoLineString = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties?: Record<string, any>;
};

async function fetchDirections(
  from: [number, number],
  to: [number, number],
): Promise<GeoLineString | null> {
  const token = getMapboxToken();
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${
      from[0]
    },${from[1]};${to[0]},${
      to[1]
    }?geometries=geojson&overview=full&access_token=${encodeURIComponent(
      token,
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const coords: [number, number][] =
      data?.routes?.[0]?.geometry?.coordinates || [];
    if (coords.length) {
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      };
    }
  } catch (e) {
    console.warn("Failed to fetch directions", e);
  }
  return null;
}

// Embedded location map component for native
function EmbeddedLocationMap({
  dest,
  address,
  onOpenFullMap,
  isPatient = false,
}: {
  dest: [number, number] | null;
  address?: string;
  onOpenFullMap: () => void;
  isPatient?: boolean;
}) {
  const [me, setMe] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<GeoLineString | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);

  // Get current location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const hasServices = await Location.hasServicesEnabledAsync();
        if (hasServices) {
          const { status } = await requestLocationPermissionWithDisclosure();
          if (status === "granted") {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!cancelled) {
              setMe([current.coords.longitude, current.coords.latitude]);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to get location", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch route when showRoute is toggled
  useEffect(() => {
    if (!showRoute || !me || !dest) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsFetchingRoute(true);
      const r = await fetchDirections(me, dest);
      if (!cancelled) {
        setRoute(r);
        setIsFetchingRoute(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showRoute, me?.[0], me?.[1], dest?.[0], dest?.[1]]);

  if (Platform.OS === "web") {
    return (
      <EmbeddedLocationMapWeb
        dest={dest}
        address={address}
        onOpenFullMap={onOpenFullMap}
        isPatient={isPatient}
      />
    );
  }

  if (!dest) {
    return (
      <View style={embeddedMapStyles.container}>
        <View style={embeddedMapStyles.noLocation}>
          <MapPin color="#9CA3AF" size={24} />
          <Text style={embeddedMapStyles.noLocationText}>
            No location available
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={embeddedMapStyles.container}>
      <View style={embeddedMapStyles.mapWrap}>
        <Mapbox.MapView
          style={{ flex: 1 }}
          styleURL={Mapbox.StyleURL.Street}
          scrollEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          zoomEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Mapbox.Camera
            zoomLevel={showRoute && route ? undefined : 14}
            centerCoordinate={showRoute && route ? undefined : dest}
            bounds={
              showRoute && route
                ? {
                    ne: [
                      Math.max(dest[0], me?.[0] ?? dest[0]) + 0.01,
                      Math.max(dest[1], me?.[1] ?? dest[1]) + 0.01,
                    ],
                    sw: [
                      Math.min(dest[0], me?.[0] ?? dest[0]) - 0.01,
                      Math.min(dest[1], me?.[1] ?? dest[1]) - 0.01,
                    ],
                    paddingTop: 40,
                    paddingBottom: 40,
                    paddingLeft: 40,
                    paddingRight: 40,
                  }
                : undefined
            }
            animationMode="flyTo"
            animationDuration={500}
          />

          {/* Destination marker */}
          <Mapbox.PointAnnotation id="dest-marker" coordinate={dest}>
            <View style={embeddedMapStyles.pinWrap}>
              <MapPin color="#DC2626" size={24} fill="#DC2626" />
            </View>
          </Mapbox.PointAnnotation>

          {/* Current location marker */}
          {me ? (
            <Mapbox.PointAnnotation id="me-marker" coordinate={me}>
              <View style={embeddedMapStyles.meDot} />
            </Mapbox.PointAnnotation>
          ) : null}

          {/* Route line */}
          {route ? (
            <Mapbox.ShapeSource id="route" shape={route as any}>
              <Mapbox.LineLayer
                id="route-line"
                style={{
                  lineColor: "#089769",
                  lineWidth: 4,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ) : showRoute && me && dest ? (
            <Mapbox.ShapeSource
              id="straight"
              shape={
                {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: [me, dest] },
                  properties: {},
                } as any
              }
            >
              <Mapbox.LineLayer
                id="straight-line"
                style={{
                  lineColor: "#6B7280",
                  lineWidth: 3,
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}
        </Mapbox.MapView>

        {loading ? (
          <View style={embeddedMapStyles.loadingOverlay}>
            <ActivityIndicator size="small" color="#089769" />
          </View>
        ) : null}
      </View>

      {/* Open full map button */}
      <TouchableOpacity
        style={embeddedMapStyles.openMapBtn}
        onPress={() => onOpenFullMap()}
      >
        <MapPin color="#089769" size={16} />
        <Text style={embeddedMapStyles.openMapBtnText}>Open Full Map</Text>
        <ChevronRight color="#089769" size={16} />
      </TouchableOpacity>
    </View>
  );
}

// Web version of embedded map
function EmbeddedLocationMapWeb({
  dest,
  address,
  onOpenFullMap,
  isPatient = false,
}: {
  dest: [number, number] | null;
  address?: string;
  onOpenFullMap: () => void;
  isPatient?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const routeLayerId = useRef<string>(
    `route-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      const token = getMapboxToken();
      if (!token) console.warn("Mapbox token missing for web map");
      mapboxgl.accessToken = token || "";

      if (!containerRef.current || cancelled) return;
      const center = dest ?? [120.9842, 14.5995];
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom: dest ? 14 : 10,
        interactive: false,
      });

      // Wait for map to load before setting ref
      map.on("load", () => {
        if (!cancelled) {
          mapRef.current = map;
        }
      });

      // Add destination marker
      if (dest) {
        const el = document.createElement("div");
        el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(dest)
          .addTo(map);
        destMarkerRef.current = marker;
      }

      // Get current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || !mapRef.current) return;
            const coords: [number, number] = [
              pos.coords.longitude,
              pos.coords.latitude,
            ];
            setMe(coords);
            const el = document.createElement("div");
            el.style.width = "12px";
            el.style.height = "12px";
            el.style.borderRadius = "50%";
            el.style.backgroundColor = "#089769";
            el.style.border = "2px solid white";
            const marker = new mapboxgl.Marker({ element: el })
              .setLngLat(coords)
              .addTo(mapRef.current);
            meMarkerRef.current = marker;
          },
          () => {},
        );
      }

      cleanup = () => {
        destMarkerRef.current?.remove();
        meMarkerRef.current?.remove();
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [dest?.[0], dest?.[1]]);

  // Handle route display
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded() || !showRoute || !me || !dest) return;

    let cancelled = false;
    (async () => {
      setIsFetchingRoute(true);
      const route = await fetchDirections(me, dest);
      if (cancelled || !map) return;
      setIsFetchingRoute(false);

      if (route) {
        if (map.getSource(routeLayerId.current)) {
          (map.getSource(routeLayerId.current) as any).setData(route);
        } else {
          map.addSource(routeLayerId.current, { type: "geojson", data: route });
          map.addLayer({
            id: routeLayerId.current,
            type: "line",
            source: routeLayerId.current,
            paint: {
              "line-color": "#089769",
              "line-width": 4,
            },
          });
        }

        // Fit bounds
        const coords = route.geometry.coordinates;
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40 },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showRoute, me?.[0], me?.[1], dest?.[0], dest?.[1]]);

  if (!dest) {
    return (
      <View style={embeddedMapStyles.container}>
        <View style={embeddedMapStyles.noLocation}>
          <MapPin color="#9CA3AF" size={24} />
          <Text style={embeddedMapStyles.noLocationText}>
            No location available
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={embeddedMapStyles.container}>
      <View style={embeddedMapStyles.mapWrap}>
        <div
          ref={containerRef as any}
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      {/* Open full map button */}
      <TouchableOpacity
        style={embeddedMapStyles.openMapBtn}
        onPress={() => onOpenFullMap()}
      >
        <MapPin color="#089769" size={16} />
        <Text style={embeddedMapStyles.openMapBtnText}>Open Full Map</Text>
        <ChevronRight color="#089769" size={16} />
      </TouchableOpacity>
    </View>
  );
}

const embeddedMapStyles = StyleSheet.create({
  container: {
    // Used as inner wrapper - no borders as parent has them
  },
  mapWrap: {
    height: 180,
    position: "relative",
  },
  pinWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  meDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#089769",
    borderWidth: 2,
    borderColor: "#fff",
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  noLocation: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  noLocationText: {
    marginTop: 8,
    color: "#6B7280",
    fontSize: 14,
  },
  routeToggleWrap: {
    position: "absolute",
    right: 8,
    top: 8,
    zIndex: 10,
  },
  routeBtn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  routeBtnActive: {
    backgroundColor: "#089769",
    borderColor: "#089769",
  },
  routeBtnText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12,
  },
  routeBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  openMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 6,
  },
  openMapBtnText: {
    color: "#089769",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { selectedRole } = useRole();
  const isCurrentUserPatient = selectedRole === "Patient";
  const isCurrentUserTherapist = selectedRole === "PhysicalTherapist";
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const isEditable = Boolean(params.editable);
  const rawSessionId = params.sessionId ? Number(params.sessionId) : NaN;
  const sessionId = Number.isFinite(rawSessionId) ? rawSessionId : undefined;
  const rawContractId = params.contractId ? Number(params.contractId) : NaN;
  const contractId = Number.isFinite(rawContractId) ? rawContractId : undefined;
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
  } = useQuery({
    queryKey: sessionDetailQueryKey(sessionId ?? 0),
    queryFn: () => fetchSessionDetail(sessionId!),
    enabled: !!sessionId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const {
    data: sessionLogs,
    isLoading: isSessionLogsLoading,
    isFetching: isSessionLogsFetching,
  } = useQuery({
    queryKey: sessionLogsQueryKey(sessionId ?? 0),
    queryFn: () => fetchSessionLogs(sessionId!),
    enabled: !!sessionId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Location tracking - patient receives therapist's live location
  const { therapistLocation, isConnected: isLocationHubConnected } =
    useLocationTracking({
      sessionId: sessionId ?? 0,
      role: isCurrentUserPatient ? "patient" : "therapist",
    });

  // Timer state for patient view
  const [timerStartMs, setTimerStartMs] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Sync server time on mount for accurate timer display
  useEffect(() => {
    syncServerTime().catch(() => {});
  }, []);

  // Rehydrate timer from SecureStore on mount
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await ssGet(`sessionTimer:${sessionId}`);
        if (raw && !cancelled) {
          const obj = JSON.parse(raw);
          if (obj?.startAtMs && Number.isFinite(obj.startAtMs)) {
            setTimerStartMs(obj.startAtMs);
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // NOTE: reschedule events are handled by the shared `useSessionRealtime(sessionId)` hook.

  // Auto-start timer when scheduled time is reached
  useEffect(() => {
    if (timerStartMs) return; // Already running
    if (!sessionDetail?.startAt || !sessionId) return;

    const rawStatus = (sessionDetail.status ?? "")
      .toString()
      .trim()
      .toLowerCase();
    const isDone =
      rawStatus === "donefortoday" || rawStatus === "done for today";
    const isCancelled = rawStatus === "cancelled" || rawStatus === "canceled";
    const isCompleted = rawStatus === "completed";
    const isTerminated = rawStatus === "terminated";
    if (isDone || isCancelled || isCompleted || isTerminated) return;

    const scheduledStartTime = new Date(sessionDetail.startAt).getTime();
    if (!Number.isFinite(scheduledStartTime)) return;

    const now = Date.now();

    if (now >= scheduledStartTime) {
      // Start immediately
      setTimerStartMs(scheduledStartTime);
      (async () => {
        try {
          await ssSet(
            `sessionTimer:${sessionId}`,
            JSON.stringify({ startAtMs: scheduledStartTime }),
          );
        } catch {}
      })();
      return;
    }

    // Set timeout to start when scheduled time arrives
    const delay = scheduledStartTime - now;
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
        })();
      }, delay);
      return () => clearTimeout(timeoutId);
    }
  }, [sessionDetail?.startAt, sessionDetail?.status, sessionId, timerStartMs]);

  // Update elapsed time every second when timer is running
  useEffect(() => {
    if (!timerStartMs) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(
        Math.max(0, Math.floor((getSyncedNow() - timerStartMs) / 1000)),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerStartMs]);

  // Realtime updates for both roles; patient view will auto-refresh too
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
  const [declineRescheduleModalVisible, setDeclineRescheduleModalVisible] =
    useState(false);
  const [declineRescheduleOtherText, setDeclineRescheduleOtherText] =
    useState("");
  const [
    selectedDeclineRescheduleReasonId,
    setSelectedDeclineRescheduleReasonId,
  ] = useState<string | null>(null);
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
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [schedulePickerVisible, setSchedulePickerVisible] = useState(false);
  const [schedulePickerDay, setSchedulePickerDay] = useState<number | null>(
    null,
  );
  const [schedulePickerWeek, setSchedulePickerWeek] = useState<0 | 1>(0); // 0 = this week, 1 = next week
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
  const [pendingPatientAction, setPendingPatientAction] = useState<
    "accept" | "decline" | null
  >(null);
  const [showOngoingRescheduleWarning, setShowOngoingRescheduleWarning] =
    useState(false);

  // Rating state (patient)
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [hasRated, setHasRated] = useState(false);

  // Sync hasRated from backend data when session detail loads
  useEffect(() => {
    if (sessionDetail) {
      // Check role to determine which rating flag to use
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
    mutationFn: async (reason: string) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await cancelSession(sessionId, reason);
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

  // Patient request cancellation mutation
  const requestCancellationMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      await requestCancellation(sessionId, reason);
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
        "Reschedule Requested",
        "Your reschedule request has been sent to your therapist for review.",
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "We couldn't submit the reschedule request. Please try again.";
      Alert.alert("Unable to request reschedule", message);
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
        "Reschedule Acknowledged",
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
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!sessionId) throw new Error("Missing session identifier");
      return declineReschedule(sessionId, reason);
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
      setDeclineRescheduleModalVisible(false);
      setSelectedDeclineRescheduleReasonId(null);
      setDeclineRescheduleOtherText("");
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
      Alert.alert("Reason Required", "Please select a reason for cancelling.");
      return;
    }
    const reason = getFinalReasonText(
      selectedCancelReasonId,
      cancelReason,
      isCurrentUserTherapist,
    );
    if (!reason) {
      Alert.alert(
        "Reason needed",
        "Please share a brief reason for cancelling the session.",
      );
      return;
    }
    cancelMutation.mutate(reason);
  }, [
    cancelMutation,
    cancelReason,
    isCurrentUserTherapist,
    selectedCancelReasonId,
  ]);

  // Formatting helpers for patient session layout
  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d);
  };
  const formatTimeRange = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return "";
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    const f = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${f.format(s)} - ${f.format(e)}`;
  };
  const patientStatusMeta = () => {
    const rawContractStatus = (sessionDetail?.contractStatus || "")
      .toString()
      .trim()
      .toLowerCase();
    const rawSessionStatus = (sessionDetail?.status || "")
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

    if (
      rawSessionStatus === "donefortoday" ||
      rawSessionStatus === "done for today"
    ) {
      return { label: "Done for today", badge: "bg-gray-100 text-gray-800" };
    }

    if (rawSessionStatus === "pendingconfirmation") {
      return {
        label: "Pending Confirmation",
        badge: "bg-amber-100 text-amber-800",
      };
    }

    // Show "Pending Reschedule" when therapist has proposed a new schedule
    if (
      rawSessionStatus === "pendingrescheduleapproval" ||
      rawSessionStatus.replace(/\s+/g, "") === "pendingrescheduleapproval"
    ) {
      return {
        label: "Pending Reschedule",
        badge: "bg-blue-100 text-blue-800",
      };
    }

    // Show "Rescheduled" when the session has been rescheduled (both parties agreed)
    if (
      sessionDetail?.isRescheduled &&
      (rawSessionStatus === "scheduled" || rawSessionStatus === "inprogress")
    ) {
      return { label: "Rescheduled", badge: "bg-amber-100 text-amber-800" };
    }

    // For scheduled or in-progress sessions, show as "Active"
    if (rawSessionStatus === "scheduled" || rawSessionStatus === "inprogress") {
      return { label: "Active", badge: "bg-blue-100 text-blue-800" };
    }

    // Default fallback
    return { label: "Active", badge: "bg-blue-100 text-blue-800" };
  };

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
      therapistName: pTherapistName ?? "Arthur Morgan",
      therapistLicense: pTherapistLicense,
      patientName: pPatientName ?? "John Doe",
      patientAge: pPatientAge ?? "21",
      caseTitle: pCaseTitle ?? "",
      address: addressLine,
      rawAddress: baseAddressRaw,
      barangay: barangayResolved,
      coord: {
        latitude: Number.isFinite(lat) ? lat : 14.5995,
        longitude: Number.isFinite(lng) ? lng : 120.9842,
      },
      day: pDay ?? "",
      timeRange: pTimeRange ?? "",
      duration: pDuration ?? "60 mins",

      fee: pFee ?? "₱ 1000.00",
      locFee: pLocFee ?? "₱ 100.00",
      toolsFee: pToolsFee ?? "₱ 150.00",
      total: pTotal ?? "₱ 1250.00",
      referralName: pReferralName ?? "doctor_referral.jpg",
      referralUri: pReferralUri,
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

    // Session location should always be the patient's address (where therapy takes place)
    const effectiveAddress =
      sessionDetail.patientAddress ??
      sessionDetail.effectiveAddress ??
      baseData.address;
    const rawAddress =
      sessionDetail.patientAddress ??
      sessionDetail.effectiveAddress ??
      baseData.rawAddress;

    // Priority: 1. Patient's profile location (most reliable)
    //           2. Session's effective location (which also falls back to patient)
    //           3. Session's stored location
    //           4. Base data defaults
    const safeLatitude = (() => {
      if (
        typeof sessionDetail.patientLatitude === "number" &&
        Number.isFinite(sessionDetail.patientLatitude)
      ) {
        return sessionDetail.patientLatitude;
      }
      if (
        typeof sessionDetail.effectiveLatitude === "number" &&
        Number.isFinite(sessionDetail.effectiveLatitude)
      ) {
        return sessionDetail.effectiveLatitude;
      }
      if (
        typeof sessionDetail.latitude === "number" &&
        Number.isFinite(sessionDetail.latitude)
      ) {
        return sessionDetail.latitude;
      }
      return baseData.coord.latitude;
    })();

    const safeLongitude = (() => {
      if (
        typeof sessionDetail.patientLongitude === "number" &&
        Number.isFinite(sessionDetail.patientLongitude)
      ) {
        return sessionDetail.patientLongitude;
      }
      if (
        typeof sessionDetail.effectiveLongitude === "number" &&
        Number.isFinite(sessionDetail.effectiveLongitude)
      ) {
        return sessionDetail.effectiveLongitude;
      }
      if (
        typeof sessionDetail.longitude === "number" &&
        Number.isFinite(sessionDetail.longitude)
      ) {
        return sessionDetail.longitude;
      }
      return baseData.coord.longitude;
    })();

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
      fee: formatPeso(professionalFee),
      locFee: formatPeso(locationFee) ?? baseData.locFee,
      toolsFee: formatPeso(miscFee) ?? baseData.toolsFee,
      total: formatPeso(sessionDetail.totalFee) ?? baseData.total,
      referralName,
      referralUri,
      therapistName: sessionDetail.therapistName,
      patientName: sessionDetail.patientName,
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

  // Fresh-start template for therapist proposals to avoid carrying over prior inputs
  const blankTherapistForm = useMemo(
    () => ({
      caseTitle: "",
      day: "",
      timeRange: "",
      professionalFee:
        isTherapistUser && myTherapist?.feePerSession
          ? myTherapist.feePerSession
          : 0,
      locationFee: 0,
      toolsFee: 0,
      total:
        isTherapistUser && myTherapist?.feePerSession
          ? myTherapist.feePerSession
          : 0,
    }),
    [isTherapistUser, myTherapist?.feePerSession],
  );

  const hasHydratedInitialForm = useRef(false);

  // Reset draft (first focus) and refresh caches whenever the therapist opens Create Session
  useFocusEffect(
    useCallback(() => {
      if (isTherapistUser && !sessionId) {
        if (!hasHydratedInitialForm.current) {
          setForm(blankTherapistForm);
          setHasSentConfirm(false);
          hasHydratedInitialForm.current = true;
        }
        try {
          queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey });
          queryClient.invalidateQueries({ queryKey: allSessionsQueryKey });
          if (patientProfileId) {
            queryClient.invalidateQueries({
              queryKey: ["contracts", "patient", patientProfileId],
            });
          }
        } catch (err) {
          console.warn(
            "Failed to invalidate queries on Create Session focus",
            err,
          );
        }
      }
      return undefined;
    }, [
      isTherapistUser,
      sessionId,
      blankTherapistForm,
      patientProfileId,
      queryClient,
    ]),
  );

  useEffect(() => {
    return () => {
      hasHydratedInitialForm.current = false;
    };
  }, []);

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
      const proposedDateStr = params.startAt || sessionDetail?.startAt;
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

      const conversationId = params.conversationId;
      if (conversationId) {
        const proposal = {
          contractId: nextContractId,
          caseTitle: form.caseTitle,
          day: form.day,
          timeRange: form.timeRange,
          total: formatMoney(form.total || 0),
        };
        // Send a chat message directly so patient sees the proposal even if therapist does not open chat immediately.
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
              console.warn("Failed to send proposal chat message via hub", err);
            } finally {
              try {
                await connection.stop();
              } catch {}
            }
          }
        } catch (err) {
          console.warn("Realtime proposal send unavailable", err);
        }

        // Return to the existing conversation screen without creating a duplicate
        // entry in the navigation stack.
        router.back();
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
  const isSessionInProgress = rawSessionStatus === "inprogress";
  const isDoneForToday =
    rawSessionStatus === "done for today" ||
    normalizedSessionStatus === "donefortoday";
  const isPendingCancellation =
    rawSessionStatus === "pendingcancellation" ||
    normalizedSessionStatus === "pendingcancellation" ||
    sessionDetail?.isPendingCancellation === true;
  const isCancellationAcknowledged =
    rawSessionStatus === "cancellationacknowledged" ||
    normalizedSessionStatus === "cancellationacknowledged" ||
    sessionDetail?.isCancellationAcknowledged === true;
  const isPendingRescheduleApproval =
    rawSessionStatus === "pendingrescheduleapproval" ||
    normalizedSessionStatus === "pendingrescheduleapproval";
  // Check if there's an ongoing reschedule that blocks new reschedule actions
  const hasOngoingReschedule =
    isPendingCancellation || isPendingRescheduleApproval;
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
  // Allow therapists to edit when creating a new session even if the `editable` param isn't passed
  const canEditSession =
    !isLockedBySessionStatus && (isEditable || (isTherapistUser && !sessionId));

  // Check if session timer has started (scheduled time has passed)
  const sessionStartTime = sessionDetail?.startAt
    ? new Date(sessionDetail.startAt).getTime()
    : null;
  const hasTimerStarted = sessionStartTime
    ? Date.now() >= sessionStartTime
    : false;

  const canCancelSession = Boolean(
    sessionId &&
    sessionDetail &&
    !isSessionCancelled &&
    !isSessionCompleted &&
    !isSessionTerminated &&
    !isContractEnded &&
    !isDoneForToday &&
    !isSessionInProgress &&
    !hasTimerStarted &&
    // Patients cannot cancel while their cancellation request is pending
    !(isCurrentUserPatient && isPendingCancellation),
  );
  const isCanceling = cancelMutation.isPending;
  // Allow the Confirm button for editable therapist view even when a conversationId
  // param isn't present — we can prepare/send a contract using session or profile data.
  const showConfirmButton = canEditSession;
  const showCancelButton = canCancelSession;
  const showBottomActions = showConfirmButton || showCancelButton;

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
      // We only block creating/sending a proposal when the blocking contract is with ANOTHER therapist.
      // If the blocking contract is with the current therapist, we should allow the therapist to
      // update/resend using the existing contract instead of blocking.
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
      if (!sessionDetail?.physicalTherapistId)
        throw new Error("Missing therapist information");
      if (!sessionId) throw new Error("Missing session identifier");
      if (ratingScore == null)
        throw new Error("Please select a score before submitting.");
      await submitRating({
        TherapistId: sessionDetail.physicalTherapistId,
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: upcomingSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: allSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: sessionDetailQueryKey(sessionId),
            })
          : Promise.resolve(),
      ]);
      // Explicitly refetch to ensure new sessions appear immediately
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
    queryKey: [
      "booked-intervals",
      therapistNumericIdForAvail || "",
      schedulePickerWeek,
    ],
    queryFn: () => {
      const now = new Date();
      const { start, end } = getWeekRange(now, schedulePickerWeek);
      const from = start.toISOString();
      const to = end.toISOString();
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

  // Debug logging
  useEffect(() => {
    console.log("🔍 Availability Debug:", {
      therapistNumericIdForAvail,
      availabilityBlocksCount: availabilityBlocks?.length || 0,
      availabilityBlocks,
      isAvailabilityLoading,
      isFetching: isAvailabilityFetching,
    });
  }, [
    therapistNumericIdForAvail,
    availabilityBlocks,
    isAvailabilityLoading,
    isAvailabilityFetching,
  ]);

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

  const toHHmm = (time: string) => {
    if (!time) return "";
    const parts = time.split(":");
    if (parts.length >= 2)
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    return time;
  };

  const hhmmTo12 = useCallback((hhmm: string) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const mer = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, "0")} ${mer}`;
  }, []);

  const normalizeDayOfWeek = useCallback(
    (value: TherapistAvailability["dayOfWeek"]): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const numeric = Number(trimmed);
        if (!Number.isNaN(numeric)) {
          return numeric;
        }

        const lower = trimmed.toLowerCase();
        const normalized = lower.includes(".")
          ? lower.substring(lower.lastIndexOf(".") + 1)
          : lower;
        return DAY_NAME_TO_INDEX[normalized] ?? null;
      }

      return null;
    },
    [],
  );

  const hhmmToMinutes = (value: string): number | null => {
    if (!value) return null;
    const parts = value.split(":");
    if (parts.length < 2) return null;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const minutesToHHmm = (value: number): string => {
    if (!Number.isFinite(value)) return "";
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}`;
  };

  type DiscretizedSlot = { start: string; end: string };

  const discretizedAvailability = useMemo(() => {
    return discretizeAvailabilityForWeek({
      availabilityBlocks: availabilityBlocks ?? [],
      now: new Date(),
      weekOffset: 0,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
    }) as Record<number, DiscretizedSlot[]>;
  }, [availabilityBlocks, normalizeDayOfWeek]);

  const dayOptions = useMemo(() => {
    return buildDayOptionsForWeek({
      discretizedAvailability: discretizedAvailability as any,
      now: new Date(),
      weekOffset: 0,
      dowToDayLabel,
    });
  }, [discretizedAvailability, dowToDayLabel]);

  const nextWeekDayOptions = useMemo(() => {
    const nextWeekMap = discretizeAvailabilityForWeek({
      availabilityBlocks: availabilityBlocks ?? [],
      now: new Date(),
      weekOffset: 1,
      slotDurationMinutes: SLOT_DURATION_MINUTES,
    }) as Record<number, DiscretizedSlot[]>;

    return buildDayOptionsForWeek({
      discretizedAvailability: nextWeekMap as any,
      now: new Date(),
      weekOffset: 1,
      dowToDayLabel,
    });
  }, [availabilityBlocks, dowToDayLabel, normalizeDayOfWeek]);

  const selectedDayOptions =
    schedulePickerWeek === 0 ? dayOptions : nextWeekDayOptions;

  const conflictKeySet = useMemo(() => {
    return buildConflictKeySet({
      recurringCommitments,
      bookedIntervals,
    });
  }, [recurringCommitments, bookedIntervals]);

  const selectedDayLabel =
    schedulePickerDay != null ? dowToDayLabel(schedulePickerDay) : null;
  const currentDaySlots =
    schedulePickerDay != null
      ? schedulePickerWeek === 0
        ? (discretizedAvailability[schedulePickerDay] ?? [])
        : (nextWeekDayOptions.find((d) => d.dow === schedulePickerDay)?.slots ??
          [])
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

    const slots =
      schedulePickerWeek === 0
        ? (discretizedAvailability[schedulePickerDay] ?? [])
        : (nextWeekDayOptions.find((d) => d.dow === schedulePickerDay)?.slots ??
          []);
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
    // Get the full day label (including date) from selectedDayOptions
    const selectedDay = selectedDayOptions.find(
      (d) => d.dow === pendingSlotSelection.dayDow,
    );
    // Use the label which includes the date (e.g., "Tuesday (Dec 9)")
    const dayLabel =
      selectedDay?.label || dowToDayLabel(pendingSlotSelection.dayDow);
    if (!dayLabel) return;
    setConfirmSlotModal({ dayLabel, label: pendingSlotSelection.label });
  }, [pendingSlotSelection, selectedDayOptions, dowToDayLabel]);

  useEffect(() => {
    // Only therapist side needs to initialize/update form from data
    // Patient side will just display session detail values directly
    if (!isTherapistUser) return;

    // When opening a fresh Create Session (no existing sessionId) without a conversation context,
    // do NOT rehydrate from previous params/data to avoid carrying over old proposal inputs.
    const isFreshCreate = !sessionId && !params.conversationId;
    if (isFreshCreate) return;

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
    sessionId,
    params.conversationId,
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

  // If this is the patient side (not therapist) and the session isn't editable (proposal already sent),
  // render a simplified Session view similar to therapist layout, with Session Logs & Cancel.
  if (!isTherapistUser && !canEditSession) {
    const statusMeta = patientStatusMeta();
    const showCancelButton = canCancelSession;
    const normalizeParam = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] : value;
    const paramStartAt = normalizeParam(params.startAt);
    const paramEndAt = normalizeParam(params.endAt);
    const scheduleStartAt = sessionDetail?.startAt ?? paramStartAt ?? undefined;
    const scheduleEndAt = sessionDetail?.endAt ?? paramEndAt ?? undefined;
    const scheduleDateLabel = scheduleStartAt
      ? formatDate(scheduleStartAt)
      : normalizeParam(params.day) || "";
    const scheduleTimeLabel =
      scheduleStartAt && scheduleEndAt
        ? formatTimeRange(scheduleStartAt, scheduleEndAt)
        : normalizeParam(params.timeRange) || "";
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
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft color="#111" size={24} />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">Session</Text>
            <View className="w-8" />
          </View>
        )}
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
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
                Session with {data.therapistName || "Therapist"}
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
            {sessionId &&
            (isSessionDetailLoading || isSessionDetailFetching) ? (
              <ActivityIndicator color="#089769" className="self-center mb-4" />
            ) : null}

            {/* Reschedule Proposal Banner - For patient when therapist proposes new schedule */}
            {isPendingRescheduleApproval &&
              isCurrentUserPatient &&
              sessionDetail?.proposedRescheduleStartAt &&
              sessionDetail?.proposedRescheduleEndAt && (
                <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <Text className="text-sm font-bold text-blue-800 mb-1">
                    📅 Reschedule Proposal
                  </Text>
                  <Text className="text-xs text-blue-800 mb-2">
                    Your therapist has requested to reschedule this session
                    {sessionDetail?.relieverTherapistName ||
                    sessionDetail?.isRelieverProposed
                      ? ` with substitute therapist ${
                          sessionDetail?.relieverTherapistName ||
                          "a substitute therapist"
                        }`
                      : ""}
                    .
                  </Text>
                  {sessionDetail?.rescheduleProposalReason ? (
                    <Text className="text-xs text-blue-700 mb-3 italic">
                      {`"${sessionDetail.rescheduleProposalReason}"`}
                    </Text>
                  ) : null}
                  {/* Show reliever therapist info if proposed */}
                  {(sessionDetail?.relieverTherapistName ||
                    sessionDetail?.isRelieverProposed) && (
                    <View className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-3">
                      <Text className="text-xs font-semibold text-teal-800 mb-1">
                        👥 Substitute Therapist
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <View className="w-8 h-8 rounded-full bg-teal-100 items-center justify-center mr-2">
                          <Text className="text-teal-700 font-bold text-sm">
                            {(sessionDetail?.relieverTherapistName || "ST")
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-teal-900">
                            {sessionDetail?.relieverTherapistName ||
                              "Substitute Therapist"}
                          </Text>
                          {sessionDetail?.relieverTherapistSpecialty && (
                            <Text className="text-xs text-teal-700">
                              {sessionDetail.relieverTherapistSpecialty}
                            </Text>
                          )}
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
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => approveRescheduleMutation.mutate()}
                    disabled={approveRescheduleMutation.isPending}
                    className="bg-blue-600 py-2.5 px-4 rounded-lg items-center justify-center"
                    style={{
                      opacity: approveRescheduleMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text className="text-white font-semibold text-sm">
                      {approveRescheduleMutation.isPending
                        ? "Acknowledging..."
                        : "Acknowledge"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setDeclineRescheduleModalVisible(true)}
                    disabled={
                      approveRescheduleMutation.isPending ||
                      declineRescheduleMutation.isPending
                    }
                    className="mt-2 bg-white border border-red-300 py-2.5 px-4 rounded-lg items-center justify-center"
                    style={{
                      opacity:
                        approveRescheduleMutation.isPending ||
                        declineRescheduleMutation.isPending
                          ? 0.6
                          : 1,
                    }}
                  >
                    <Text className="text-red-700 font-semibold text-sm">
                      {declineRescheduleMutation.isPending
                        ? "Declining..."
                        : "Decline"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

            {isSessionCancelled && !isContractEnded ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-red-800 mb-1">
                  Session Cancelled
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
                  <Text className="text-xs text-red-700 mt-2 italic">{`“${sessionDetail.cancellationReason}”`}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Pending Reschedule Banner for Patient */}
            {isPendingCancellation && isCurrentUserPatient ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-amber-800 mb-1">
                  🕐 Reschedule Request Pending
                </Text>
                <Text className="text-xs text-amber-700">
                  Your reschedule request is being reviewed by your therapist.
                  They will propose a new schedule soon.
                </Text>
                {sessionDetail?.patientCancellationReason ? (
                  <Text className="text-xs text-amber-600 mt-2 italic">
                    {`Your reason: "${sessionDetail.patientCancellationReason}"`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Awaiting New Schedule Banner for Patient */}
            {isCancellationAcknowledged && isCurrentUserPatient ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-blue-800 mb-1">
                  ✓ Awaiting New Schedule
                </Text>
                <Text className="text-xs text-blue-700">
                  Your therapist is reviewing your request and will propose a
                  new schedule.
                </Text>
                {sessionDetail?.patientCancellationReason ? (
                  <Text className="text-xs text-blue-600 mt-2 italic">
                    {`Your reason: "${sessionDetail.patientCancellationReason}"`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Participants */}
            <View
              className={`border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4 ${
                isDesktop ? "border-l-4 border-l-[#089769]" : ""
              }`}
            >
              <Text className="text-xs text-gray-500 mb-2">Participants</Text>
              <View className="flex-col web:flex-row web:items-start web:justify-between gap-3 web:gap-0">
                <View className="flex-1 pr-2">
                  <Text className="text-[11px] text-gray-500">Therapist</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User size={16} color="#089769" />
                    <Text className="text-sm text-gray-900 font-semibold">
                      {data.therapistName || "Therapist"}
                    </Text>
                  </View>
                </View>
                <View className="flex-1 pl-2 web:items-end">
                  <Text className="text-[11px] text-gray-500">Patient</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User size={16} color="#6B7280" />
                    <Text className="text-sm text-gray-900 font-semibold">
                      {data.patientName || "You"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Case */}
            {sessionDetail?.conditionCase || params.caseTitle ? (
              <View
                className={`mb-3 border border-gray-200 rounded-xl p-4 bg-white ${
                  isDesktop ? "border-l-4 border-l-[#089769]" : ""
                }`}
              >
                <Text className="text-xs text-gray-500 mb-1">Case</Text>
                <View className="flex-row items-center">
                  <FileText size={16} color="#089769" />
                  <Text className="text-gray-700 ml-2 flex-1">
                    {sessionDetail?.conditionCase || params.caseTitle}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Schedule */}
            <View
              className={`mb-3 border rounded-xl p-4 ${
                sessionDetail?.isRescheduled
                  ? "bg-blue-50 border-blue-200"
                  : "bg-white border-gray-200"
              } ${isDesktop ? "border-l-4 border-l-[#089769]" : ""}`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Text
                    className={`text-xs ${
                      sessionDetail?.isRescheduled
                        ? "text-blue-700 font-semibold"
                        : "text-gray-500"
                    }`}
                  >
                    {sessionDetail?.isRescheduled
                      ? "📅 Rescheduled"
                      : "Schedule"}
                  </Text>
                  {sessionDetail?.isRescheduled && (
                    <View className="bg-blue-100 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] text-blue-700 font-medium">
                        New Date
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
                  color={sessionDetail?.isRescheduled ? "#1D4ED8" : "#089769"}
                />
                <Text
                  className={`ml-2 ${
                    sessionDetail?.isRescheduled
                      ? "text-blue-800 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  {scheduleDateLabel || "Not set"}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock
                  size={16}
                  color={sessionDetail?.isRescheduled ? "#1D4ED8" : "#089769"}
                />
                <Text
                  className={`ml-2 ${
                    sessionDetail?.isRescheduled
                      ? "text-blue-800 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  {scheduleTimeLabel || "Not set"}
                </Text>
              </View>
            </View>

            {/* Location with embedded map - Hidden when contract is pending confirmation (patient hasn't accepted yet) */}
            {!isContractPending &&
            (sessionDetail?.effectiveAddress || params.address)
              ? (() => {
                  // Session location should always be the patient's address (where therapy takes place)
                  // Priority: 1. Patient's profile location (most reliable)
                  //           2. Session's effective location (which also falls back to patient)
                  //           3. Session's stored location
                  const lat =
                    sessionDetail?.patientLatitude ??
                    sessionDetail?.effectiveLatitude ??
                    sessionDetail?.latitude;
                  const lng =
                    sessionDetail?.patientLongitude ??
                    sessionDetail?.effectiveLongitude ??
                    sessionDetail?.longitude;
                  const address =
                    sessionDetail?.patientAddress ??
                    sessionDetail?.effectiveAddress ??
                    sessionDetail?.locationAddress ??
                    params.address;
                  const barangay = sessionDetail?.patientBarangay;

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

                  // Check if therapist is sharing their location
                  const isTherapistSharing = therapistLocation != null;

                  return (
                    <View className="mb-3">
                      {/* Therapist On The Way Banner */}
                      {isCurrentUserPatient && isTherapistSharing && (
                        <View className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                          <View className="flex-row items-center gap-2">
                            <View className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                            <Text className="text-sm font-semibold text-green-800">
                              🚗 Therapist is on the way!
                            </Text>
                          </View>
                          <Text className="text-xs text-green-700 mt-1 ml-5">
                            Live tracking is active
                          </Text>
                        </View>
                      )}

                      <View
                        className={`border border-gray-200 rounded-xl bg-white overflow-hidden ${
                          isDesktop ? "border-l-4 border-l-[#089769]" : ""
                        }`}
                      >
                        <View className="p-4 pb-2">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-xs text-gray-500 mb-1">
                              Location
                            </Text>
                            {isTherapistSharing && (
                              <View className="flex-row items-center gap-1">
                                <View className="w-2 h-2 rounded-full bg-green-500" />
                                <Text className="text-[10px] text-green-600 font-medium">
                                  LIVE
                                </Text>
                              </View>
                            )}
                          </View>
                          <View className="flex-row items-center">
                            <MapPin size={16} color="#089769" />
                            <Text className="text-gray-700 ml-2 flex-1">
                              {address}
                            </Text>
                          </View>
                        </View>
                        {destCoord || address ? (
                          <EmbeddedLocationMap
                            dest={destCoord}
                            address={address ?? undefined}
                            isPatient={isCurrentUserPatient}
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
                                  profileId: sessionDetail?.patientId
                                    ? String(sessionDetail.patientId)
                                    : undefined,
                                  // Pass therapist location for live tracking
                                  therapistLat: therapistLocation?.latitude
                                    ? String(therapistLocation.latitude)
                                    : undefined,
                                  therapistLng: therapistLocation?.longitude
                                    ? String(therapistLocation.longitude)
                                    : undefined,
                                },
                              });
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })()
              : null}

            {/* Cost breakdown */}
            <View
              className={`mb-3 border border-gray-200 rounded-xl p-4 bg-white ${
                isDesktop ? "border-l-4 border-l-[#089769]" : ""
              }`}
            >
              <Text className="text-xs text-gray-500 mb-2">Cost breakdown</Text>
              <View className="flex-row justify-between py-1.5">
                <Text className="text-sm text-gray-900">Professional fee</Text>
                <Text className="text-sm text-gray-900">
                  {formatPeso(
                    sessionDetail?.professionalFee ||
                      parseMoneyString(params.fee || "0"),
                  )}
                </Text>
              </View>
              <View className="flex-row justify-between py-1.5">
                <Text className="text-sm text-gray-900">Location fee</Text>
                <Text className="text-sm text-gray-900">
                  {formatPeso(
                    sessionDetail?.locationFee ||
                      parseMoneyString(params.locFee || "0"),
                  )}
                </Text>
              </View>
              <View className="flex-row justify-between py-1.5">
                <Text className="text-sm text-gray-900">Tools/Misc</Text>
                <Text className="text-sm text-gray-900">
                  {formatPeso(
                    sessionDetail?.miscellaneousFee ||
                      parseMoneyString(params.toolsFee || "0"),
                  )}
                </Text>
              </View>
              <View className="h-px bg-gray-200 my-1.5" />
              <View className="flex-row justify-between py-1.5">
                <Text className="text-sm text-gray-900 font-bold">Total</Text>
                <Text className="text-sm text-gray-900 font-bold">
                  {formatPeso(
                    sessionDetail?.totalFee ||
                      parseMoneyString(params.total || "0"),
                  )}
                </Text>
              </View>
            </View>

            {/* Session Logs removed per request */}
          </View>
        </ScrollView>
        {/* Bottom actions (patient). Show Accept / Decline when a proposal (pending confirmation) exists. */}
        {showCancelButton || (isContractPending && !patientResponded) ? (
          <View
            className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-100"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <View
              className={`pt-2 px-4 ${
                isDesktop
                  ? "max-w-4xl mx-auto w-full"
                  : "web:max-w-2xl web:mx-auto web:w-full"
              }`}
            >
              <View
                className={
                  showCancelButton && isContractPending && !patientResponded
                    ? "flex-row items-center w-full"
                    : "w-full"
                }
              >
                {isContractPending && !patientResponded ? (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isPatientActionProcessing}
                      onPress={() => setPendingPatientAction("accept")}
                      className={
                        showCancelButton
                          ? "py-3.5 rounded-lg items-center justify-center flex-1 bg-[#089769] mr-2"
                          : "py-3.5 rounded-lg items-center justify-center bg-[#089769]"
                      }
                    >
                      {acceptMutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-semibold text-base">
                          Accept
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isPatientActionProcessing}
                      onPress={() => setPendingPatientAction("decline")}
                      className={
                        showCancelButton
                          ? "py-3.5 rounded-lg items-center justify-center flex-1 bg-red-600 mr-2"
                          : "py-3.5 rounded-lg items-center justify-center bg-red-600"
                      }
                    >
                      {declineMutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white font-semibold text-base">
                          Decline
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : null}
                {showCancelButton ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isCanceling}
                    onPress={() => {
                      if (hasOngoingReschedule) {
                        setShowOngoingRescheduleWarning(true);
                      } else {
                        handleOpenCancelModal();
                      }
                    }}
                    className={
                      isContractPending && !patientResponded
                        ? "py-3.5 rounded-lg items-center justify-center flex-1 border-2 border-orange-600 bg-white"
                        : "py-3.5 rounded-lg items-center justify-center border-2 border-orange-600 bg-white"
                    }
                  >
                    {isCanceling ? (
                      <ActivityIndicator color="#EA580C" />
                    ) : (
                      <Text className="text-orange-600 font-bold text-base">
                        {isCurrentUserPatient
                          ? "Reschedule Session"
                          : "Cancel Session"}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
        {/* Accept / Decline confirmation modal for patient proposal flow (duplicated for simplified view) */}
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
        {/* Patient Cancel Modal - Request cancellation for therapist review */}
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
            onCancel={handleCloseCancelModal}
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
              Note: Your therapist will review this request and propose a
              reschedule date before the cancellation is finalized.
            </Text>
          </InAppModal>
        )}

        {/* Patient Decline Reschedule Modal - require a reason */}
        {isCurrentUserPatient && (
          <InAppModal
            visible={declineRescheduleModalVisible}
            large
            title="Decline reschedule proposal"
            message="Please select a reason so your therapist understands why you can't accept the new schedule."
            confirmText={
              declineRescheduleMutation.isPending
                ? "Submitting..."
                : "Submit Decline"
            }
            cancelText="Go Back"
            showCancel
            onCancel={() => {
              if (declineRescheduleMutation.isPending) return;
              setDeclineRescheduleModalVisible(false);
              setSelectedDeclineRescheduleReasonId(null);
              setDeclineRescheduleOtherText("");
            }}
            onConfirm={() => {
              if (declineRescheduleMutation.isPending) return;
              if (
                !isReasonValid(
                  selectedDeclineRescheduleReasonId,
                  declineRescheduleOtherText,
                )
              ) {
                Alert.alert(
                  "Reason Required",
                  "Please select a reason for declining the reschedule.",
                );
                return;
              }
              const r = getFinalReasonText(
                selectedDeclineRescheduleReasonId,
                declineRescheduleOtherText,
                false,
                PATIENT_RESCHEDULE_DECLINE_REASONS,
              );
              if (!r) {
                Alert.alert(
                  "Reason Required",
                  "Please provide a reason for declining the reschedule.",
                );
                return;
              }
              declineRescheduleMutation.mutate({ reason: r });
            }}
            isConfirmDisabled={
              declineRescheduleMutation.isPending ||
              !isReasonValid(
                selectedDeclineRescheduleReasonId,
                declineRescheduleOtherText,
              )
            }
            isDestructive
          >
            <CancellationReasonSelector
              isTherapist={false}
              reasonsOverride={PATIENT_RESCHEDULE_DECLINE_REASONS}
              title="Reason for declining"
              otherPlaceholder="Please specify why you can't accept the proposed schedule..."
              selectedReasonId={selectedDeclineRescheduleReasonId}
              onSelectReason={setSelectedDeclineRescheduleReasonId}
              otherText={declineRescheduleOtherText}
              onOtherTextChange={setDeclineRescheduleOtherText}
            />
          </InAppModal>
        )}

        {/* Therapist Cancel Modal - Direct cancel */}
        {isCurrentUserTherapist && (
          <InAppModal
            visible={cancelModalVisible}
            large
            title="Cancel Session"
            message="Select a reason for cancelling this session. This will cancel the session immediately."
            confirmText={isCanceling ? "Cancelling..." : "Cancel Session"}
            cancelText="Go Back"
            showCancel
            onCancel={handleCloseCancelModal}
            onConfirm={handleConfirmCancel}
            isConfirmDisabled={
              isCanceling ||
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
      </SafeAreaView>
    );
  }

  return (
    <View
      style={{ backgroundColor: isDesktop ? "#e6f5f0" : "#FFFFFF" }}
      className="flex-1"
    >
      {/* WebHeader for desktop */}
      {isDesktop && <WebHeader />}

      <SafeAreaView
        style={{ backgroundColor: isDesktop ? "#e6f5f0" : "#FFFFFF" }}
        className="flex-1"
      >
        {/* Desktop Header */}
        {isDesktop ? (
          <View className="w-full max-w-screen-xl mx-auto px-6 pt-8 pb-6">
            <View className="flex-row items-center">
              <TouchableOpacity
                className="flex-row items-center px-4 py-2 rounded-xl bg-white border border-emerald-100 mr-4"
                onPress={() => router.back()}
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
                  {sessionId ? "Session Details" : "New Session"}
                </Text>
                <Text className="text-3xl font-bold text-gray-900">
                  {sessionId ? "Session Details" : "Create Session"}
                </Text>
                <Text className="text-gray-500 mt-1">
                  {sessionId
                    ? "View and manage session information"
                    : "Set up a new therapy session with your patient"}
                </Text>
              </View>
              {/* Status Badge */}
              {sessionId && sessionDetail?.status ? (
                <View
                  style={{
                    backgroundColor:
                      sessionDetail.status === "Completed"
                        ? "#089769"
                        : sessionDetail.status === "Cancelled"
                          ? "#EF4444"
                          : sessionDetail.status === "Ongoing"
                            ? "#3B82F6"
                            : "#089769",
                  }}
                  className="px-4 py-2 rounded-xl"
                >
                  <Text className="text-white font-bold text-lg">
                    {sessionDetail.status}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.8)" }}
                    className="text-xs"
                  >
                    Session Status
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          /* Mobile Header */
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-8 h-8 items-center justify-center"
            >
              <ArrowLeft color="#111" size={24} />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">
              Create Session
            </Text>
            <View className="w-8" />
          </View>
        )}

        <ScrollView
          contentContainerStyle={{
            paddingBottom: 140,
            paddingHorizontal: isDesktop ? 24 : 16,
            paddingTop: 16,
          }}
        >
          <View className={isDesktop ? "max-w-4xl mx-auto w-full" : ""}>
            {sessionId &&
            (isSessionDetailLoading || isSessionDetailFetching) ? (
              <ActivityIndicator color="#089769" className="self-center mb-4" />
            ) : null}

            {isSessionCancelled && !isContractEnded ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-red-800 mb-1">
                  Session Cancelled
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
              </View>
            ) : null}

            {/* Pending Reschedule Banner for Patient */}
            {isPendingCancellation && isCurrentUserPatient ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-amber-800 mb-1">
                  🕐 Reschedule Request Pending
                </Text>
                <Text className="text-xs text-amber-700">
                  Your reschedule request is being reviewed by your therapist.
                  They will propose a new schedule soon.
                </Text>
                {sessionDetail?.patientCancellationReason ? (
                  <Text className="text-xs text-amber-600 mt-2 italic">
                    {`Your reason: "${sessionDetail.patientCancellationReason}"`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Awaiting New Schedule Banner for Patient */}
            {isCancellationAcknowledged && isCurrentUserPatient ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <Text className="text-sm font-bold text-blue-800 mb-1">
                  ✓ Awaiting New Schedule
                </Text>
                <Text className="text-xs text-blue-700">
                  Your therapist is reviewing your request and will propose a
                  new schedule.
                </Text>
                {sessionDetail?.patientCancellationReason ? (
                  <Text className="text-xs text-blue-600 mt-2 italic">
                    {`Your reason: "${sessionDetail.patientCancellationReason}"`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Participants Card - Combined Therapist & Patient */}
            <View className="border border-gray-200 rounded-xl p-4 bg-gray-50 mb-4">
              <Text className="text-xs text-gray-500 mb-3">Participants</Text>

              {/* Therapist Row */}
              <TouchableOpacity
                onPress={handleTherapistPress}
                activeOpacity={0.7}
                className="flex-row items-center justify-between mb-3"
              >
                <View className="flex-1">
                  <Text className="text-[11px] text-gray-500">Therapist</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User size={16} color="#089769" />
                    <Text className="text-sm font-semibold text-gray-900">
                      {data.therapistName}
                    </Text>
                  </View>
                </View>
                <ChevronRight color="#9CA3AF" size={18} />
              </TouchableOpacity>

              {/* Patient Row */}
              <TouchableOpacity
                onPress={handlePatientPress}
                activeOpacity={0.7}
                className="flex-row items-center justify-between"
              >
                <View className="flex-1">
                  <Text className="text-[11px] text-gray-500">Patient</Text>
                  <View className="flex-row items-center gap-1.5 mt-0.5">
                    <User size={16} color="#6B7280" />
                    <Text className="text-sm font-semibold text-gray-900">
                      {data.patientName}
                    </Text>
                  </View>
                </View>
                <ChevronRight color="#9CA3AF" size={18} />
              </TouchableOpacity>
            </View>

            {/* Case Card */}
            <View className="border border-gray-200 rounded-xl p-4 bg-white mb-4">
              <Text className="text-xs text-gray-500 mb-1">Case</Text>
              {canEditSession ? (
                <TextInput
                  className="border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 text-base mt-1"
                  value={form.caseTitle}
                  onChangeText={(v) => setForm((s) => ({ ...s, caseTitle: v }))}
                  placeholder="e.g., Muscle Strain"
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <View className="flex-row items-center">
                  <FileText size={16} color="#089769" />
                  <Text className="text-gray-700 ml-2 flex-1">
                    {data.caseTitle || "Not specified"}
                  </Text>
                </View>
              )}
            </View>

            {/* Location Card - Hidden when contract is pending confirmation (patient hasn't accepted yet) */}
            {!isContractPending && !canEditSession ? (
              <View className="border border-gray-200 rounded-xl bg-white overflow-hidden mb-4">
                <View className="p-4 pb-2">
                  <Text className="text-xs text-gray-500 mb-1">
                    {"Patient's Location"}
                  </Text>
                  <View className="flex-row items-center">
                    <MapPin size={16} color="#089769" />
                    <Text className="text-gray-700 ml-2 flex-1">
                      {data.address}
                    </Text>
                  </View>
                </View>
                <EmbeddedLocationMap
                  dest={
                    data.coord.latitude && data.coord.longitude
                      ? [data.coord.longitude, data.coord.latitude]
                      : null
                  }
                  address={data.rawAddress}
                  isPatient={isCurrentUserPatient}
                  onOpenFullMap={() =>
                    router.push({
                      pathname: "/session-map",
                      params: {
                        lat: String(data.coord.latitude),
                        lng: String(data.coord.longitude),
                        address: data.rawAddress,
                        barangay: data.barangay ?? undefined,
                        sessionId: sessionId ? String(sessionId) : undefined,
                        profileId: rawProfileId ?? undefined,
                      },
                    })
                  }
                />
              </View>
            ) : null}

            {/* Schedule Card */}
            <View
              className={`border ${
                sessionDetail?.isRescheduled
                  ? "border-amber-300"
                  : "border-gray-200"
              } rounded-xl p-4 ${
                sessionDetail?.isRescheduled ? "bg-amber-50" : "bg-white"
              } mb-4`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs text-gray-500">
                  {sessionDetail?.isRescheduled ? "Rescheduled" : "Schedule"}
                </Text>
                {!canEditSession && (
                  <Text className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                    Active
                  </Text>
                )}
              </View>
              {canEditSession ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openSchedulePicker}
                  className="flex-row items-center"
                >
                  <Calendar size={16} color="#089769" />
                  <Text
                    className={
                      form.day && form.timeRange
                        ? "text-gray-700 ml-2 flex-1"
                        : "text-gray-400 ml-2 flex-1"
                    }
                  >
                    {form.day && form.timeRange
                      ? `${form.day} (${form.timeRange})`
                      : "Select a schedule"}
                  </Text>
                  <ChevronRight size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ) : (
                <>
                  <View className="flex-row items-center mb-1">
                    <Calendar
                      size={16}
                      color={
                        sessionDetail?.isRescheduled ? "#D97706" : "#089769"
                      }
                    />
                    <Text
                      className={
                        sessionDetail?.isRescheduled
                          ? "text-amber-900 ml-2 font-medium"
                          : "text-gray-700 ml-2"
                      }
                    >
                      {data.day || "No date set"}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Clock
                      size={16}
                      color={
                        sessionDetail?.isRescheduled ? "#D97706" : "#089769"
                      }
                    />
                    <Text
                      className={
                        sessionDetail?.isRescheduled
                          ? "text-amber-900 ml-2 font-medium"
                          : "text-gray-700 ml-2"
                      }
                    >
                      {data.timeRange || "No time set"}
                    </Text>
                  </View>
                </>
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
                  {/* Week toggle */}
                  {schedulePickerDay == null ? (
                    <View className="flex-row gap-2 mb-3">
                      <TouchableOpacity
                        onPress={() => setSchedulePickerWeek(0)}
                        className="px-4 py-2.5 rounded-xl"
                        style={{
                          backgroundColor:
                            schedulePickerWeek === 0 ? "#089769" : "#F3F4F6",
                        }}
                      >
                        <Text
                          className="font-semibold text-sm"
                          style={{
                            color:
                              schedulePickerWeek === 0 ? "#FFFFFF" : "#374151",
                          }}
                        >
                          This Week
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSchedulePickerWeek(1)}
                        className="px-4 py-2.5 rounded-xl"
                        style={{
                          backgroundColor:
                            schedulePickerWeek === 1 ? "#089769" : "#F3F4F6",
                        }}
                      >
                        <Text
                          className="font-semibold text-sm"
                          style={{
                            color:
                              schedulePickerWeek === 1 ? "#FFFFFF" : "#374151",
                          }}
                        >
                          Next Week
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {isSlotDataLoading ? (
                    <View className="py-12 items-center justify-center">
                      <ActivityIndicator color="#089769" />
                      <Text className="text-xs text-gray-500 mt-2">
                        Loading availability...
                      </Text>
                    </View>
                  ) : schedulePickerDay == null ? (
                    selectedDayOptions.length === 0 ? (
                      <Text className="text-xs text-gray-500">
                        No availability found for this therapist.
                      </Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 360 }}>
                        {selectedDayOptions.map((day) => {
                          // Calculate slot availability details
                          const now = new Date();
                          const today = now.getDay();

                          let availableCount = 0;
                          let pastCount = 0;
                          let bookedCount = 0;

                          day.slots.forEach((slot) => {
                            const slotKey = `${day.dow}-${slot.start}`;
                            const isBooked = conflictKeySet.has(slotKey);

                            // Check if past (only for "This Week" and today)
                            let isPastSlot = false;
                            if (schedulePickerWeek === 0 && day.dow === today) {
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
                          if (day.isPast) {
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
                          const isClickDisabled = day.isPast || allSlotsBooked;
                          const isGreyedOut = day.isPast || allSlotsBooked;

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
                                !isClickDisabled &&
                                setSchedulePickerDay(day.dow)
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
                        schedulePickerWeek === 0 &&
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
                              <Text className="text-xs text-amber-700 mb-3">
                                {`To book this time slot, please select "Next Week" to schedule for the upcoming week.`}
                              </Text>
                              <TouchableOpacity
                                onPress={() => {
                                  setSchedulePickerDay(null);
                                  setSchedulePickerWeek(1);
                                }}
                                className="bg-amber-500 py-2 px-4 rounded-lg self-start"
                              >
                                <Text className="text-white font-semibold text-sm">
                                  View Next Week →
                                </Text>
                              </TouchableOpacity>
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

                                // Check if this slot is in the past (only for "This Week")
                                let isPast = false;
                                if (
                                  schedulePickerWeek === 0 &&
                                  schedulePickerDay != null
                                ) {
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
                                  // Days before today in the current week are also past
                                  // Note: day picker already handles this case with day.isPast
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
                                      ? "border-transparent"
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
                                    style={[
                                      isUnavailable
                                        ? { opacity: 0.6 }
                                        : isSelected
                                          ? {
                                              backgroundColor: "#089769",
                                              shadowColor: "#089769",
                                              shadowOpacity: 0.35,
                                              shadowRadius: 6,
                                            }
                                          : undefined,
                                    ]}
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
                    <View className="flex-row items-center justify-between">
                      {/* Link to schedule page */}
                      <TouchableOpacity
                        onPress={() => {
                          closeSchedulePicker();
                          router.push("/(therapist)/schedule" as any);
                        }}
                        className="flex-row items-center"
                        activeOpacity={0.7}
                      >
                        <Text className="text-sm text-gray-500">
                          Need Slots?{" "}
                        </Text>
                        <Text
                          className="text-sm font-semibold"
                          style={{ color: "#089769" }}
                        >
                          Go to Schedule →
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={closeSchedulePicker}
                        className="px-4 py-2.5 rounded-xl"
                        style={{ backgroundColor: "#089769" }}
                      >
                        <Text className="text-white font-semibold">Close</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="flex-row justify-end gap-2">
                      <TouchableOpacity
                        onPress={() => setSchedulePickerDay(null)}
                        className="px-4 py-2.5 rounded-xl border border-gray-300"
                      >
                        <Text className="text-gray-700 font-semibold">
                          Back
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={
                          !pendingSlotSelection ||
                          pendingSlotSelection.dayDow !== schedulePickerDay
                        }
                        onPress={confirmPendingSlot}
                        className="px-4 py-2.5 rounded-xl"
                        style={{
                          backgroundColor:
                            pendingSlotSelection &&
                            pendingSlotSelection.dayDow === schedulePickerDay
                              ? "#089769"
                              : "#A7F3D0",
                          opacity:
                            !pendingSlotSelection ||
                            pendingSlotSelection.dayDow !== schedulePickerDay
                              ? 0.6
                              : 1,
                        }}
                      >
                        <Text className="text-white font-semibold">
                          Confirm
                        </Text>
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

            {/* Cost Breakdown */}
            <Text
              style={{ color: "#089769" }}
              className="text-xs font-semibold uppercase tracking-wide mb-2 mt-5"
            >
              Cost Breakdown
            </Text>
            <View className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-base text-gray-700">
                  Professional Fee
                </Text>
                {canEditSession ? (
                  <Text className="text-base text-gray-900 font-semibold">
                    {formatMoney(form.professionalFee)}
                  </Text>
                ) : (
                  <Text className="text-base text-gray-900 font-semibold">
                    {data.fee}
                  </Text>
                )}
              </View>
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-base text-gray-700">Location</Text>
                {canEditSession ? (
                  <TextInput
                    className="border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 min-w-[100px] text-right text-base"
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
                  <Text className="text-base text-gray-900 font-semibold">
                    {data.locFee}
                  </Text>
                )}
              </View>
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-base text-gray-700">Miscellaneous</Text>
                {canEditSession ? (
                  <TextInput
                    className="border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 min-w-[100px] text-right text-base"
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
                  <Text className="text-base text-gray-900 font-semibold">
                    {data.toolsFee}
                  </Text>
                )}
              </View>
              <View className="border-t border-dashed border-gray-300 my-3" />
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-lg text-gray-900 font-bold">Total</Text>
                {canEditSession ? (
                  <Text
                    style={{ color: "#089769" }}
                    className="text-xl font-bold"
                  >
                    {formatMoney(form.total)}
                  </Text>
                ) : (
                  <Text
                    style={{ color: "#089769" }}
                    className="text-xl font-bold"
                  >
                    {data.total}
                  </Text>
                )}
              </View>
            </View>

            {/* Confirm button moved to fixed bottom bar to avoid covering content */}

            {/* Doctor's Referral section removed by request */}

            {/* End Contract Button - Only for therapists */}
            {isTherapistUser &&
            sessionDetail?.contractId &&
            !isSessionCancelled &&
            !isSessionCompleted &&
            !isSessionTerminated &&
            isContractActive ? (
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
                  <View className="flex-row w-full">
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
        {/* Patient: Rate session once the therapist ends it or contract concludes */}
        {!isTherapistUser &&
        (isSessionCompleted || isSessionTerminated || isContractEnded) &&
        !hasRated ? (
          <View className="px-4.5 py-4">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setRatingModalVisible(true)}
              className="bg-blue-600 py-3.5 rounded-lg items-center justify-center"
            >
              <Text className="text-white font-semibold text-base">
                Rate Session
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

                {/* Therapist Info Card */}
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
                        {(
                          data.therapistName ||
                          sessionDetail?.therapistName ||
                          "T"
                        )
                          .split(" ")
                          .map((n: string) => n[0]?.toUpperCase() || "")
                          .join("")
                          .slice(0, 2)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-gray-900">
                        {data.therapistName ||
                          sessionDetail?.therapistName ||
                          "Therapist"}
                      </Text>
                      <Text className="text-sm text-gray-500">
                        {data.caseTitle ||
                          sessionDetail?.conditionCase ||
                          "Session"}
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
                            hitSlop={{
                              top: 10,
                              bottom: 10,
                              left: 10,
                              right: 10,
                            }}
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
                      placeholder="Share your experience with this therapist..."
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
                <Text className="text-white font-semibold text-base">
                  Accept
                </Text>
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
              className="absolute left-0 right-0 bottom-0 py-4 bg-white border-t border-gray-100 items-center justify-center"
              style={{
                paddingBottom: Math.max(insets.bottom, 12),
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6", // gray-100 to match Session View
              }}
            >
              <View className="px-4 web:max-w-4xl web:mx-auto web:w-full items-center justify-center">
                <ActivityIndicator color="#089769" />
              </View>
            </View>
          ) : (
            <View
              className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-100"
              style={{
                paddingBottom: Math.max(insets.bottom, 12),
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6", // gray-100 to match Session View
              }}
            >
              <View className="pt-2 px-4 web:max-w-4xl web:mx-auto web:w-full">
                <View
                  className={
                    showCancelButton && showConfirmButton
                      ? "flex-row items-center w-full"
                      : "w-full"
                  }
                >
                  {showCancelButton ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isCanceling}
                      onPress={handleOpenCancelModal}
                      className={`py-3.5 rounded-lg items-center justify-center border-2 border-orange-600 bg-white ${
                        showConfirmButton ? "flex-1 mr-2" : ""
                      }`}
                    >
                      {isCanceling ? (
                        <ActivityIndicator color="#EA580C" />
                      ) : (
                        <Text className="text-orange-600 font-bold text-base">
                          {isCurrentUserPatient
                            ? "Reschedule Session"
                            : "Cancel Session"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  {showConfirmButton ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isConfirming}
                      onPress={async () => {
                        // Validation: Check if case title and schedule are filled (therapist only)
                        if (isTherapistUser) {
                          const hasCase =
                            form.caseTitle && form.caseTitle.trim().length > 0;
                          const hasSchedule = form.day && form.timeRange;

                          if (!hasCase) {
                            setValidationMessage(
                              "Please enter the case/condition to treat before confirming the proposal.",
                            );
                            setValidationModalVisible(true);
                            return;
                          }

                          if (!hasSchedule) {
                            setValidationMessage(
                              "Please select both day and time for the session before confirming the proposal.",
                            );
                            setValidationModalVisible(true);
                            return;
                          }
                        }

                        setIsConfirming(true);
                        try {
                          const preparedContractId =
                            await createOrPrepareContract();
                          if (preparedContractId != null) {
                            if (params.conversationId) {
                              await queryClient.invalidateQueries({
                                queryKey: chatHistoryQueryKey(
                                  params.conversationId,
                                ),
                              });
                            }
                            setHasSentConfirm(true);
                            setConfirmInfoModalVisible(true);
                          }
                        } finally {
                          setIsConfirming(false);
                        }
                      }}
                      className={`py-4 rounded-2xl items-center justify-center ${
                        showCancelButton ? "flex-1 ml-3" : ""
                      }`}
                      style={{ backgroundColor: "#089769" }}
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
                className="py-3 px-4.5 rounded-lg bg-blue-600 self-end"
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
          onConfirm={() => {
            setActiveSessionWarningVisible(false);
            setConflictWithOtherTherapist(false);
          }}
          variant="warning"
        />
        <InAppModal
          visible={validationModalVisible}
          title="Validation Required"
          message={validationMessage}
          confirmText="OK"
          onConfirm={() => setValidationModalVisible(false)}
          variant="warning"
        />
        {/* Patient Cancel Modal - Request cancellation for therapist review */}
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
            onCancel={handleCloseCancelModal}
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
              Note: Your therapist will review this request and propose a
              reschedule date before the cancellation is finalized.
            </Text>
          </InAppModal>
        )}

        {/* Therapist Cancel Modal - Direct cancel */}
        {isCurrentUserTherapist && (
          <InAppModal
            visible={cancelModalVisible}
            large
            title="Cancel Session"
            message="Select a reason for cancelling this session. This will cancel the session immediately."
            confirmText={isCanceling ? "Cancelling..." : "Cancel Session"}
            cancelText="Go Back"
            showCancel
            onCancel={handleCloseCancelModal}
            onConfirm={handleConfirmCancel}
            isConfirmDisabled={
              isCanceling ||
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
          </InAppModal>
        )}

        {/* End Session Confirmation Modal - Type to Confirm */}
        {isCurrentUserTherapist && (
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
                  {endSessionType === "Terminated"
                    ? "(required)"
                    : "(optional)"}
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
                  Type <Text className="font-bold text-red-600">CONFIRM</Text>{" "}
                  to proceed
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
    </View>
  );
}
