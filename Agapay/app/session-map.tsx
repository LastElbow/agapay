import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { requestLocationPermissionWithDisclosure } from "@/src/utils/locationPermission";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ArrowLeft, MapPin, Edit2, Check, X } from "lucide-react-native";
import { Alert } from "react-native";
import apiClient from "@/api/client";
import { useRole } from "@/src/providers/RoleProvider";
import { useLocationTracking } from "@/src/hooks/useLocationTracking";
import { TherapistLocationMarker } from "@/src/components/TherapistLocationMarker";
import { AppleMapsLiveLocationMarker } from "@/src/components/AppleMapsLiveLocationMarker";

// Initialize Mapbox access token on native
if (
  Platform.OS !== "web" &&
  Mapbox &&
  typeof (Mapbox as any).setAccessToken === "function"
) {
  Mapbox.setAccessToken(
    (Constants.expoConfig as any)?.extra?.mapboxAccessToken || "",
  );
}

type Params = {
  lat?: string;
  lng?: string;
  address?: string;
  barangay?: string;
  sessionId?: string;
  profileId?: string;
  // Therapist's saved profile location
  therapistLat?: string;
  therapistLng?: string;
  // Patient's saved profile location
  patientLat?: string;
  patientLng?: string;
  // Location sharing status
  isSharing?: string;
};

type GeoLineString = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties?: Record<string, any>;
};

const getMapboxToken = (): string | undefined => {
  const envToken =
    (typeof process !== "undefined" &&
      (process.env as any)?.EXPO_PUBLIC_MAPBOX_TOKEN) ||
    undefined;
  const extraToken = (Constants.expoConfig as any)?.extra?.mapboxAccessToken;
  return envToken || extraToken;
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

function normalizeDestFromParams(p: Params): [number, number] | null {
  let lat = Number(p.lat);
  let lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Correct swapped values if latitude looks invalid and longitude looks like a latitude
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return [lng, lat];
  }
  return null;
}

// Parse therapist's saved location from params
function parseTherapistLocationFromParams(p: Params): [number, number] | null {
  let lat = Number(p.therapistLat);
  let lng = Number(p.therapistLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return [lng, lat];
  }
  return null;
}

// Parse patient's saved location from params
function parsePatientLocationFromParams(p: Params): [number, number] | null {
  let lat = Number(p.patientLat);
  let lng = Number(p.patientLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return [lng, lat];
  }
  return null;
}

export default function SessionMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const { selectedRole } = useRole();
  const isPatient = selectedRole === "Patient";

  const [dest, setDest] = useState<[number, number] | null>(() =>
    normalizeDestFromParams(params),
  );

  // Separate locations for clarity:
  // - patientSavedLocation: The patient's saved address from their profile
  // - therapistSavedLocation: The therapist's saved address from their profile
  // - useCurrentLocation: Optional GPS tracking (disabled by default)
  const [patientSavedLocation, setPatientSavedLocation] = useState<
    [number, number] | null
  >(
    () =>
      parsePatientLocationFromParams(params) ?? normalizeDestFromParams(params),
  );
  const [therapistSavedLocation, setTherapistSavedLocation] = useState<
    [number, number] | null
  >(() => parseTherapistLocationFromParams(params));
  const [currentGpsLocation, setCurrentGpsLocation] = useState<
    [number, number] | null
  >(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState<boolean>(false);
  const [route, setRoute] = useState<GeoLineString | null>(null);
  const [showRoute, setShowRoute] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time therapist location tracking
  const [realtimeTherapistLocation, setRealtimeTherapistLocation] = useState<
    [number, number] | null
  >(null);
  // Therapist's current GPS location when sharing
  const [therapistCurrentLocation, setTherapistCurrentLocation] = useState<
    [number, number] | null
  >(null);
  const sessionId = params.sessionId ? parseInt(params.sessionId) : undefined;

  // Track if sharing is active (from params or hook)
  const [isSharingActive, setIsSharingActive] = useState(
    params.isSharing === "true",
  );

  // Location tracking hook for real-time updates
  const {
    isSharing: isTherapistSharing,
    isConnected,
    therapistLocation,
    toggleSharing: toggleLocationSharing,
  } = useLocationTracking({
    sessionId: sessionId ?? 0,
    role: isPatient ? "patient" : "therapist",
    onTherapistLocationUpdate: (coords) => {
      console.log(
        "📍📍📍 [SessionMap] Therapist location update received (patient view):",
        coords,
      );
      console.log(
        "  - Current realtimeTherapistLocation state:",
        realtimeTherapistLocation,
      );
      console.log("  - Setting realtimeTherapistLocation to:", [
        coords.longitude,
        coords.latitude,
      ]);
      setRealtimeTherapistLocation([coords.longitude, coords.latitude]);
      console.log("  - State setter called");
      // Patient receiving therapist location means sharing is active
      if (isPatient) {
        console.log("  - Setting isSharingActive to true");
        setIsSharingActive(true);
      }
      // For therapists viewing their own location via broadcast
      if (!isPatient) {
        console.log(
          "🔵 [SessionMap] Therapist receiving own broadcast:",
          coords,
        );
        setTherapistCurrentLocation([coords.longitude, coords.latitude]);
        // Don't set isSharingActive here - use isTherapistSharing from hook
      }
    },
    onOwnLocationUpdate: (coords) => {
      // For therapists: update their own location marker
      console.log(
        "🎯🎯🎯 [SessionMap] onOwnLocationUpdate called with:",
        coords,
      );
      console.log("  - isPatient:", isPatient);
      if (!isPatient) {
        console.log("  - Setting therapistCurrentLocation to:", [
          coords.longitude,
          coords.latitude,
        ]);
        setTherapistCurrentLocation([coords.longitude, coords.latitude]);
        // Don't set isSharingActive here - use isTherapistSharing from hook
      } else {
        console.log("  - Skipping because isPatient is true");
      }
    },
    onTrackingStarted: () => {
      // Location sharing started via hook
      console.log("✅ [SessionMap] Location sharing started");
      // For therapists, isTherapistSharing is already true from hook
      // For patients receiving this event, set local state (though patients don't receive this)
    },
    onTrackingStopped: () => {
      // Location sharing stopped via hook
      console.log("❌ [SessionMap] Location sharing stopped");
      setTherapistCurrentLocation(null);
      setIsSharingActive(false);
    },
  });

  // For therapists: use isTherapistSharing from hook as single source of truth
  // For patients: use isSharingActive which tracks if they're receiving location updates
  const effectiveIsSharing = isPatient ? isSharingActive : isTherapistSharing;

  // Edit location mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLocation, setEditLocation] = useState<[number, number] | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch patient's saved location from profile if not provided in params
        if (!patientSavedLocation && params.profileId) {
          try {
            const res = await apiClient.get(
              `/api/patient/profiles/${params.profileId}`,
            );
            const lat = Number((res.data as any)?.latitude);
            const lng = Number((res.data as any)?.longitude);
            if (!cancelled && Number.isFinite(lat) && Number.isFinite(lng)) {
              let finalLat = lat;
              let finalLng = lng;
              if (Math.abs(finalLat) > 90 && Math.abs(finalLng) <= 90) {
                const tmp = finalLat;
                finalLat = finalLng;
                finalLng = tmp;
              }
              if (Math.abs(finalLat) <= 90 && Math.abs(finalLng) <= 180) {
                const coords: [number, number] = [finalLng, finalLat];
                setPatientSavedLocation(coords);
                setDest(coords);
              }
            }
          } catch (e) {
            console.warn("Failed to load patient location from profile", e);
          }
        }

        // Only get current GPS location if user opts in (useCurrentLocation)
        // This is optional and not the default behavior anymore
        setLoading(false);
      } catch (e) {
        console.warn("Session map init failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    params.profileId,
    patientSavedLocation?.[0],
    patientSavedLocation?.[1],
    isPatient,
  ]);

  // Fetch GPS location for therapists on mount and when showRoute/useCurrentLocation changes
  useEffect(() => {
    if (isPatient) return;
    let cancelled = false;
    (async () => {
      try {
        const hasServices = await Location.hasServicesEnabledAsync();
        if (!hasServices) {
          setError("Location services are disabled.");
          return;
        }
        const { status } = await requestLocationPermissionWithDisclosure();
        if (status === "granted") {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            const gpsCoords: [number, number] = [
              current.coords.longitude,
              current.coords.latitude,
            ];
            setCurrentGpsLocation(gpsCoords);
          }
        } else {
          setError("Location permission denied.");
        }
      } catch (e) {
        console.warn("Failed to get GPS location", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showRoute, useCurrentLocation, isPatient]);

  // Clear route only when showRoute is turned OFF
  useEffect(() => {
    if (!showRoute) {
      setRoute(null);
    }
  }, [showRoute]);

  const quantize = (value: number, decimals = 4) =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;

  // For routing: prioritize real-time location > GPS > saved location as fallback
  const routeFromLocation =
    realtimeTherapistLocation ?? currentGpsLocation ?? therapistSavedLocation;

  // Use real-time location for therapist marker if available
  // Priority: therapist's current GPS (when sharing) > real-time updates > GPS toggle > saved location
  const displayTherapistLocation =
    !isPatient && effectiveIsSharing && therapistCurrentLocation
      ? therapistCurrentLocation
      : (realtimeTherapistLocation ??
        (useCurrentLocation ? currentGpsLocation : therapistSavedLocation));
  const qRouteFrom = routeFromLocation
    ? [quantize(routeFromLocation[0]), quantize(routeFromLocation[1])]
    : null;
  const qDest = dest ? [quantize(dest[0]), quantize(dest[1])] : null;

  const { data: cachedRoute, isFetching: isFetchingRoute } = useQuery({
    queryKey: [
      "directions",
      qRouteFrom ? `${qRouteFrom[0]},${qRouteFrom[1]}` : "-",
      qDest ? `${qDest[0]},${qDest[1]}` : "-",
    ],
    queryFn: async () => {
      if (!qRouteFrom || !qDest) return null;
      return fetchDirections(
        qRouteFrom as [number, number],
        qDest as [number, number],
      );
    },
    enabled: showRoute && Boolean(qRouteFrom && qDest),
    staleTime: 24 * 60 * 60 * 1000, // 24h
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (cachedRoute) setRoute(cachedRoute);
  }, [cachedRoute]);

  const title = useMemo(() => {
    const parts = [params.address, params.barangay].filter(Boolean);
    return parts.join(", ");
  }, [params.address, params.barangay]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#111" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title || "Session Location"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Edit Location Controls - Only show for patients */}
      {Platform.OS !== "web" && isPatient && (
        <View style={styles.editControlsContainer}>
          {!isEditMode ? (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                setIsEditMode(true);
                setEditLocation(dest);
              }}
            >
              <Edit2 size={16} color="#fff" />
              <Text style={styles.editBtnText}>Edit Location</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActionRow}>
              <TouchableOpacity
                style={styles.cancelEditBtn}
                onPress={() => {
                  setIsEditMode(false);
                  setEditLocation(null);
                }}
              >
                <X size={16} color="#6B7280" />
                <Text style={styles.cancelEditBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveLocationBtn, isSaving && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!editLocation || isSaving) return;
                  setIsSaving(true);
                  try {
                    // Save the new location to the patient profile
                    if (params.profileId) {
                      await apiClient.put(
                        `/api/patient/profiles/${params.profileId}/location`,
                        {
                          latitude: editLocation[1],
                          longitude: editLocation[0],
                        },
                      );
                    }
                    setDest(editLocation);
                    setIsEditMode(false);
                    setEditLocation(null);
                    Alert.alert("Success", "Location updated successfully!");
                  } catch (err) {
                    console.error("Failed to save location", err);
                    Alert.alert(
                      "Error",
                      "Failed to save location. Please try again.",
                    );
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={16} color="#fff" />
                    <Text style={styles.saveLocationBtnText}>
                      Save Location
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
          {isEditMode && (
            <Text style={styles.editHint}>
              Tap on the map to select a new location
            </Text>
          )}
        </View>
      )}

      {Platform.OS !== "web" ? (
        <View style={styles.mapContainer}>
          <Mapbox.MapView
            style={StyleSheet.absoluteFill}
            logoEnabled={false}
            onPress={(feature: any) => {
              if (isEditMode && feature?.geometry?.coordinates) {
                const coords = feature.geometry.coordinates as [number, number];
                setEditLocation(coords);
              }
            }}
          >
            {dest ? (
              <Mapbox.Camera
                {...(() => {
                  // For patients:
                  // - If therapist is sharing, center on therapist
                  // - Otherwise, center on their own saved location/dest
                  if (isPatient) {
                    if (effectiveIsSharing && realtimeTherapistLocation) {
                      return {
                        centerCoordinate: realtimeTherapistLocation as [
                          number,
                          number,
                        ],
                        zoomLevel: 16, // Zoom in closer on therapist
                        animationMode: "flyTo" as const,
                        animationDuration: 1000,
                      };
                    }
                    return {
                      centerCoordinate: (patientSavedLocation ?? dest) as [
                        number,
                        number,
                      ],
                      zoomLevel: 15,
                      animationMode: "flyTo" as const,
                      animationDuration: 600,
                    };
                  }

                  // For therapists:
                  // - If showing route, fit bounds to include both locations
                  // - Otherwise, center on therapist's location (real-time, GPS, or saved)
                  if (showRoute && routeFromLocation && dest) {
                    const minLng = Math.min(routeFromLocation[0], dest[0]);
                    const minLat = Math.min(routeFromLocation[1], dest[1]);
                    const maxLng = Math.max(routeFromLocation[0], dest[0]);
                    const maxLat = Math.max(routeFromLocation[1], dest[1]);
                    return {
                      bounds: {
                        ne: [maxLng, maxLat] as [number, number],
                        sw: [minLng, minLat] as [number, number],
                        paddingLeft: 40,
                        paddingRight: 40,
                        paddingTop: 40,
                        paddingBottom: 40,
                      },
                      animationMode: "flyTo" as const,
                      animationDuration: 600,
                    };
                  }
                  // For therapists (no route): follow real-time location if available, otherwise use saved location
                  // When therapist is sharing location, prioritize their current GPS position
                  const centerLocation =
                    effectiveIsSharing && therapistCurrentLocation
                      ? therapistCurrentLocation
                      : (displayTherapistLocation ?? dest);
                  return {
                    centerCoordinate: centerLocation as [number, number],
                    zoomLevel:
                      effectiveIsSharing && therapistCurrentLocation ? 16 : 14, // Higher zoom when sharing own location
                    animationMode:
                      effectiveIsSharing && therapistCurrentLocation
                        ? ("flyTo" as const)
                        : ("moveTo" as const),
                    animationDuration:
                      effectiveIsSharing && therapistCurrentLocation ? 1000 : 0,
                  };
                })()}
              />
            ) : null}

            {/* Patient location marker - always visible */}
            {(isEditMode ? editLocation : dest) ? (
              <Mapbox.PointAnnotation
                id="patient-location"
                coordinate={(isEditMode ? editLocation : dest)!}
                draggable={isEditMode}
                onDragEnd={(e: any) => {
                  if (isEditMode && e?.geometry?.coordinates) {
                    setEditLocation(e.geometry.coordinates as [number, number]);
                  }
                }}
              >
                <View
                  style={[styles.pinWrap, isEditMode && styles.pinEditMode]}
                >
                  <MapPin
                    color={isEditMode ? "#059669" : "#089769"}
                    size={36}
                    fill={isEditMode ? "#059669" : "#10B981"}
                    strokeWidth={3}
                  />
                </View>
              </Mapbox.PointAnnotation>
            ) : null}

            {/* Live therapist location marker - visible to patients when therapist is sharing */}
            {isPatient && effectiveIsSharing && realtimeTherapistLocation ? (
              <Mapbox.PointAnnotation
                id="therapist-live"
                coordinate={realtimeTherapistLocation}
              >
                <AppleMapsLiveLocationMarker isOwnLocation={false} size={16} />
              </Mapbox.PointAnnotation>
            ) : null}

            {/* Therapist's own location marker - shows when therapist is sharing (Apple Maps style) */}
            {!isPatient && effectiveIsSharing && therapistCurrentLocation ? (
              <Mapbox.PointAnnotation
                id="therapist-self"
                coordinate={therapistCurrentLocation}
              >
                <AppleMapsLiveLocationMarker isOwnLocation={true} size={20} />
              </Mapbox.PointAnnotation>
            ) : null}

            {/* Debug: Log marker rendering */}
            {(() => {
              console.log("🗺️🗺️🗺️ [SessionMap] MARKER RENDER CHECK 🗺️🗺️🗺️");
              console.log("  - isPatient:", isPatient);
              console.log("  - effectiveIsSharing:", effectiveIsSharing);
              console.log(
                "  - therapistCurrentLocation:",
                therapistCurrentLocation,
              );
              console.log(
                "  - Should show marker:",
                !isPatient && effectiveIsSharing && therapistCurrentLocation,
              );
              console.log("🗺️🗺️🗺️ END MARKER RENDER CHECK 🗺️🗺️🗺️");
              return null;
            })()}

            {/* Route line (only when showRoute and therapist has a from location) */}
            {showRoute && route ? (
              <Mapbox.ShapeSource id="route" shape={route as any}>
                <Mapbox.LineLayer
                  id="route-line"
                  style={{
                    lineColor: "#2563EB",
                    lineWidth: 4,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              </Mapbox.ShapeSource>
            ) : showRoute && routeFromLocation && dest ? (
              // Fallback straight line if directions unavailable
              <Mapbox.ShapeSource
                id="straight"
                shape={
                  {
                    type: "Feature",
                    geometry: {
                      type: "LineString",
                      coordinates: [routeFromLocation, dest],
                    },
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

          {/* Show Route button - Therapist only (always show, GPS will be fetched when clicked) */}
          {!isPatient && (
            <View style={styles.routeToggleWrap}>
              <TouchableOpacity
                style={[styles.routeBtn, showRoute && styles.routeBtnActive]}
                onPress={() => setShowRoute((s) => !s)}
              >
                <Text
                  style={[
                    styles.routeBtnText,
                    showRoute && styles.routeBtnTextActive,
                  ]}
                >
                  {isFetchingRoute
                    ? "Loading..."
                    : showRoute
                      ? "Hide Route"
                      : "Show Route"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Therapist location sharing banner - Patient only */}
          {isPatient && effectiveIsSharing && (
            <View
              style={[
                styles.therapistSharingBanner,
                !isConnected && styles.bannerOffline,
              ]}
            >
              <View style={styles.bannerContent}>
                <View
                  style={[
                    styles.liveIndicator,
                    !isConnected && styles.offlineIndicator,
                  ]}
                />
                <View style={styles.bannerTextContainer}>
                  <Text style={styles.bannerText}>
                    {isConnected
                      ? "🚗 Live Tracking Active"
                      : "📡 Connection Lost"}
                  </Text>
                  <Text style={styles.bannerSubtext}>
                    {isConnected
                      ? "Real-time location updates"
                      : "Reconnecting..."}
                  </Text>
                </View>
                <View
                  style={[
                    styles.liveBadge,
                    !isConnected && styles.offlineBadge,
                  ]}
                >
                  <Text style={styles.liveBadgeText}>
                    {isConnected ? "LIVE" : "OFFLINE"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <WebSessionMapWeb
          dest={dest}
          title={title}
          isPatient={isPatient}
          therapistSavedLocation={therapistSavedLocation}
          patientSavedLocation={patientSavedLocation}
          realtimeTherapistLocation={realtimeTherapistLocation}
          therapistCurrentLocation={therapistCurrentLocation}
          isTherapistSharing={effectiveIsSharing}
          sessionId={sessionId}
          toggleLocationSharing={toggleLocationSharing}
          initialShowRoute={showRoute}
          isConnected={isConnected}
        />
      )}
    </SafeAreaView>
  );
}

// Web-only lightweight map implementation using mapbox-gl
function WebSessionMapWeb({
  dest,
  title,
  isPatient = false,
  therapistSavedLocation,
  patientSavedLocation,
  realtimeTherapistLocation,
  therapistCurrentLocation,
  isTherapistSharing,
  sessionId,
  toggleLocationSharing,
  initialShowRoute = false,
  isConnected = true,
}: {
  dest: [number, number] | null;
  title: string;
  isPatient?: boolean;
  therapistSavedLocation?: [number, number] | null;
  patientSavedLocation?: [number, number] | null;
  realtimeTherapistLocation?: [number, number] | null;
  therapistCurrentLocation?: [number, number] | null;
  isTherapistSharing?: boolean;
  sessionId?: number;
  toggleLocationSharing?: () => void;
  initialShowRoute?: boolean;
  isConnected?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeLayerId = useRef<string>(
    `route-${Math.random().toString(36).slice(2)}`,
  );
  const destMarkerRef = useRef<any>(null);
  const therapistRealtimeMarkerRef = useRef<any>(null);
  const [showRoute, setShowRoute] = React.useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = React.useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = React.useState(false);
  const [currentGpsLocation, setCurrentGpsLocation] = React.useState<
    [number, number] | null
  >(null);
  const [therapistLiveLocation, setTherapistLiveLocation] = React.useState<
    [number, number] | null
  >(therapistCurrentLocation ?? null);
  const [patientViewTherapistLocation, setPatientViewTherapistLocation] =
    React.useState<[number, number] | null>(realtimeTherapistLocation ?? null);

  // For patients: watch for therapist location updates from props
  useEffect(() => {
    if (!isPatient || !realtimeTherapistLocation) {
      return;
    }

    console.log(
      "👁️ [WebMap] Patient detected therapist location update:",
      realtimeTherapistLocation,
    );
    setPatientViewTherapistLocation(realtimeTherapistLocation);
  }, [
    isPatient,
    realtimeTherapistLocation?.[0],
    realtimeTherapistLocation?.[1],
  ]);

  // For therapists: update live location when therapistCurrentLocation prop changes (from SignalR broadcast)
  useEffect(() => {
    if (isPatient || !isTherapistSharing || !therapistCurrentLocation) {
      return;
    }

    console.log(
      "🔵 [WebMap] Therapist location updated from prop (SignalR):",
      therapistCurrentLocation,
    );
    setTherapistLiveLocation(therapistCurrentLocation);
  }, [
    isPatient,
    isTherapistSharing,
    therapistCurrentLocation?.[0],
    therapistCurrentLocation?.[1],
  ]);

  // For therapists: also watch their GPS location directly as backup
  useEffect(() => {
    if (isPatient || !isTherapistSharing) {
      setTherapistLiveLocation(null);
      return;
    }

    console.log("📍 [WebMap] Starting GPS watch for therapist (backup)");

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn("📍 [WebMap] Geolocation not available");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        console.log("🔵 [WebMap] Therapist GPS update (backup):", coords);
        // Only update if we don't have a SignalR location
        setTherapistLiveLocation((prev) => prev || coords);
      },
      (error) => {
        console.error("📍 [WebMap] Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );

    return () => {
      console.log("📍 [WebMap] Stopping GPS watch");
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isPatient, isTherapistSharing]);

  // Use saved location for routing, or GPS if user opted in, or realtime location if available
  // For therapists: prioritize live GPS > realtime updates > current GPS > saved location
  const routeFromLocation =
    therapistLiveLocation ??
    realtimeTherapistLocation ??
    currentGpsLocation ??
    therapistSavedLocation;

  // Use real-time location for therapist marker if available
  const displayTherapistLocation =
    realtimeTherapistLocation ??
    (useCurrentLocation ? currentGpsLocation : therapistSavedLocation);

  // Fetch GPS location for therapists on mount and when showRoute/useCurrentLocation changes
  useEffect(() => {
    if (isPatient) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    console.log("📍 [WebMap] Fetching GPS for routing...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        console.log("📍 [WebMap] Got GPS for routing:", coords);
        setCurrentGpsLocation(coords);
      },
      (err) => {
        console.warn("📍 [WebMap] Failed to get GPS for routing:", err);
      },
    );
  }, [showRoute, useCurrentLocation, isPatient]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      const token = getMapboxToken();
      if (!token) console.warn("Mapbox token missing for web map");
      mapboxgl.accessToken = token || "";
      try {
        // @ts-ignore
        if (!mapboxgl.workerUrl) {
          // @ts-ignore
          mapboxgl.workerUrl =
            "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl-csp-worker.js";
        }
      } catch {}

      if (!containerRef.current || cancelled) return;

      // For patients: center on their saved location
      // For therapists: center on therapist's saved location if available, else patient location
      const initialCenter = isPatient
        ? (patientSavedLocation ?? dest ?? [120.9842, 14.5995])
        : (therapistSavedLocation ?? dest ?? [120.9842, 14.5995]);

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initialCenter,
        zoom: dest ? 14 : 10,
      });
      mapRef.current = map;

      // Add patient location marker - green pin (larger and more visible)
      if (dest) {
        const el = document.createElement("div");
        el.style.width = "48px";
        el.style.height = "48px";
        el.style.background = "transparent";
        el.style.display = "flex";
        el.style.alignItems = "flex-start";
        el.style.justifyContent = "center";
        el.innerHTML =
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-6-5.686-6-10a6 6 0 1112 0c0 4.314-6 10-6 10z" stroke="#089769" stroke-width="2.5" fill="#10B981" fill-opacity="0.3"/><circle cx="12" cy="11" r="3" fill="#089769"/></svg>';
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(dest)
          .addTo(map);
        destMarkerRef.current = marker;
      }

      cleanup = () => {
        try {
          destMarkerRef.current?.remove?.();
        } catch {}
        try {
          therapistRealtimeMarkerRef.current?.remove?.();
        } catch {}
        try {
          map.remove();
        } catch {}
      };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [
    dest?.[0],
    dest?.[1],
    isPatient,
    patientSavedLocation,
    therapistSavedLocation,
  ]);

  // Dedicated cleanup effect: Remove therapist marker immediately when sharing stops
  useEffect(() => {
    // Only run for therapist view
    if (isPatient) return;

    // If sharing just stopped, remove the marker immediately
    if (!isTherapistSharing && therapistRealtimeMarkerRef.current) {
      console.log(
        "🔴🔴🔴 [SessionMap WEB] CLEANUP: Removing therapist marker (sharing stopped)",
      );
      therapistRealtimeMarkerRef.current.remove();
      therapistRealtimeMarkerRef.current = null;
    }
  }, [isTherapistSharing, isPatient]);

  // Separate effect for managing real-time therapist marker (web)
  useEffect(() => {
    console.log("🌐🌐🌐 [SessionMap WEB] MARKER EFFECT TRIGGERED 🌐🌐🌐");
    console.log("  - isPatient:", isPatient);
    console.log("  - isTherapistSharing (effective):", isTherapistSharing);
    console.log("  - therapistCurrentLocation:", therapistCurrentLocation);
    console.log("  - therapistLiveLocation:", therapistLiveLocation);
    console.log("  - realtimeTherapistLocation:", realtimeTherapistLocation);
    console.log(
      "  - patientViewTherapistLocation:",
      patientViewTherapistLocation,
    );

    const map = mapRef.current;
    console.log("  - map exists:", !!map);

    if (!map) return;

    let cancelled = false;

    // Add or update live therapist marker for patients - use local state that watches props
    const patientTherapistLocation =
      patientViewTherapistLocation || realtimeTherapistLocation;
    if (isPatient && patientTherapistLocation && !cancelled) {
      console.log(
        "🔵 [SessionMap WEB] Patient view therapist marker - updating position",
      );
      console.log("  - patientTherapistLocation:", patientTherapistLocation);

      // Update existing marker position if it exists
      if (therapistRealtimeMarkerRef.current) {
        therapistRealtimeMarkerRef.current.setLngLat(patientTherapistLocation);
        console.log("  - Updated existing marker position");

        // Follow the therapist
        map.flyTo({
          center: patientTherapistLocation,
          zoom: 16,
          speed: 1.5,
        });
      } else {
        // Create new marker if it doesn't exist
        console.log(
          "🔵🔵🔵 [SessionMap WEB] CREATING PATIENT VIEW THERAPIST MARKER 🔵🔵🔵",
        );

        try {
          // Apple Maps-style live marker
          const container = document.createElement("div");
          if (!container) {
            console.error("Failed to create container element");
            return;
          }
          container.style.position = "relative";
          container.style.width = "40px";
          container.style.height = "40px";
          container.style.display = "flex";
          container.style.alignItems = "center";
          container.style.justifyContent = "center";

          // Main marker
          const mainMarker = document.createElement("div");
          mainMarker.style.width = "16px";
          mainMarker.style.height = "16px";
          mainMarker.style.borderRadius = "50%";
          mainMarker.style.background = "#007AFF";
          mainMarker.style.border = "3px solid #FFFFFF";
          mainMarker.style.boxShadow = "0 2px 8px rgba(0, 122, 255, 0.4)";
          mainMarker.style.position = "relative";
          mainMarker.style.zIndex = "1003";

          // Pulsating rings
          const pulse1 = document.createElement("div");
          pulse1.style.width = "30px";
          pulse1.style.height = "30px";
          pulse1.style.borderRadius = "50%";
          pulse1.style.background = "rgba(0, 122, 255, 0.3)";
          pulse1.style.position = "absolute";
          pulse1.style.top = "5px";
          pulse1.style.left = "5px";
          pulse1.style.animation = "appleMapsLivePulse 2s infinite";
          pulse1.style.zIndex = "1001";

          const pulse2 = document.createElement("div");
          pulse2.style.width = "40px";
          pulse2.style.height = "40px";
          pulse2.style.borderRadius = "50%";
          pulse2.style.background = "rgba(0, 122, 255, 0.2)";
          pulse2.style.position = "absolute";
          pulse2.style.top = "0px";
          pulse2.style.left = "0px";
          pulse2.style.animation = "appleMapsLivePulse 2s infinite 0.5s";
          pulse2.style.zIndex = "1000";

          // Add CSS animations if not already present
          if (!document.querySelector("#apple-maps-animations")) {
            const style = document.createElement("style");
            style.id = "apple-maps-animations";
            style.textContent = `
              @keyframes appleMapsLivePulse {
                0% {
                  transform: scale(0.8);
                  opacity: 0.8;
                }
                50% {
                  transform: scale(1.0);
                  opacity: 0.4;
                }
                100% {
                  transform: scale(1.2);
                  opacity: 0;
                }
              }
            `;
            if (document.head) {
              document.head.appendChild(style);
            }
          }

          container.appendChild(pulse2);
          container.appendChild(pulse1);
          container.appendChild(mainMarker);

          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mapboxgl = require("mapbox-gl");
          const marker = new mapboxgl.Marker({ element: container })
            .setLngLat(patientTherapistLocation)
            .addTo(map);

          // Fly to location on creation
          map.flyTo({
            center: patientTherapistLocation,
            zoom: 16,
            speed: 1.5,
          });

          therapistRealtimeMarkerRef.current = marker;
          console.log("  - Created new marker");
        } catch (err) {
          console.error("Error creating patient view therapist marker:", err);
        }
      }
    } else if (
      isPatient &&
      !patientTherapistLocation &&
      therapistRealtimeMarkerRef.current
    ) {
      // Remove marker if therapist stopped sharing
      therapistRealtimeMarkerRef.current.remove();
      therapistRealtimeMarkerRef.current = null;
      console.log("  - Removed marker (therapist stopped sharing)");
    }

    // Add or update therapist's own location marker (Apple Maps style with direction arrow)
    const therapistOwnLocation =
      therapistLiveLocation || therapistCurrentLocation;
    if (
      !isPatient &&
      isTherapistSharing &&
      therapistOwnLocation &&
      !cancelled
    ) {
      console.log(
        "🔵 [SessionMap WEB] Therapist own marker - updating position",
      );
      console.log("  - therapistOwnLocation:", therapistOwnLocation);

      // Update existing marker position if it exists
      if (therapistRealtimeMarkerRef.current) {
        therapistRealtimeMarkerRef.current.setLngLat(therapistOwnLocation);
        console.log("  - Updated existing therapist marker position");
      } else {
        // Create new marker if it doesn't exist
        console.log("🔵🔵🔵 [SessionMap WEB] CREATING THERAPIST MARKER 🔵🔵🔵");

        try {
          const container = document.createElement("div");
          if (!container) {
            console.error("Failed to create container element");
            return;
          }
          container.style.position = "relative";
          container.style.width = "44px";
          container.style.height = "44px";
          container.style.display = "flex";
          container.style.alignItems = "center";
          container.style.justifyContent = "center";

          // Direction arrow (pointing north)
          const arrow = document.createElement("div");
          arrow.style.position = "absolute";
          arrow.style.top = "-2px";
          arrow.style.left = "50%";
          arrow.style.transform = "translateX(-50%)";
          arrow.style.width = "0";
          arrow.style.height = "0";
          arrow.style.borderLeft = "6px solid transparent";
          arrow.style.borderRight = "6px solid transparent";
          arrow.style.borderBottom = "12px solid #FFFFFF";
          arrow.style.zIndex = "1002";

          // Main location dot
          const mainMarker = document.createElement("div");
          mainMarker.style.width = "20px";
          mainMarker.style.height = "20px";
          mainMarker.style.borderRadius = "50%";
          mainMarker.style.background = "#007AFF";
          mainMarker.style.border = "4px solid #FFFFFF";
          mainMarker.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.25)";
          mainMarker.style.position = "relative";
          mainMarker.style.zIndex = "1003";

          // Pulsating rings
          const pulse1 = document.createElement("div");
          pulse1.style.width = "34px";
          pulse1.style.height = "34px";
          pulse1.style.borderRadius = "50%";
          pulse1.style.background = "rgba(0, 122, 255, 0.2)";
          pulse1.style.position = "absolute";
          pulse1.style.top = "5px";
          pulse1.style.left = "5px";
          pulse1.style.animation = "appleMapsMyLocationPulse 2s infinite";
          pulse1.style.zIndex = "1001";

          const pulse2 = document.createElement("div");
          pulse2.style.width = "44px";
          pulse2.style.height = "44px";
          pulse2.style.borderRadius = "50%";
          pulse2.style.background = "rgba(0, 122, 255, 0.15)";
          pulse2.style.position = "absolute";
          pulse2.style.top = "0px";
          pulse2.style.left = "0px";
          pulse2.style.animation = "appleMapsMyLocationPulse 2s infinite 0.5s";
          pulse2.style.zIndex = "1000";

          // Add CSS animations if not already present
          if (!document.querySelector("#apple-maps-animations")) {
            const style = document.createElement("style");
            style.id = "apple-maps-animations";
            style.textContent = `
          @keyframes appleMapsLivePulse {
            0% {
              transform: scale(0.8);
              opacity: 0.8;
            }
            50% {
              transform: scale(1.0);
              opacity: 0.4;
            }
            100% {
              transform: scale(1.2);
              opacity: 0;
            }
          }
          @keyframes appleMapsMyLocationPulse {
            0% {
              transform: scale(0.9);
              opacity: 0.7;
            }
            50% {
              transform: scale(1.1);
              opacity: 0.3;
            }
            100% {
              transform: scale(1.3);
              opacity: 0;
            }
          }
        `;
            if (document.head) {
              document.head.appendChild(style);
            }
          }

          container.appendChild(pulse2);
          container.appendChild(pulse1);
          container.appendChild(arrow);
          container.appendChild(mainMarker);

          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mapboxgl = require("mapbox-gl");
          const marker = new mapboxgl.Marker({ element: container })
            .setLngLat(therapistOwnLocation)
            .addTo(map);

          therapistRealtimeMarkerRef.current = marker;
          console.log("  - Created new therapist marker");
        } catch (err) {
          console.error("Error creating therapist own location marker:", err);
        }
      }
    } else if (
      !isPatient &&
      (!isTherapistSharing || !therapistOwnLocation) &&
      therapistRealtimeMarkerRef.current
    ) {
      // Remove marker if therapist stopped sharing
      therapistRealtimeMarkerRef.current.remove();
      therapistRealtimeMarkerRef.current = null;
      console.log("  - Removed therapist marker (stopped sharing)");
    }

    return () => {
      cancelled = true;
    };
  }, [
    isTherapistSharing,
    realtimeTherapistLocation?.[0],
    realtimeTherapistLocation?.[1],
    therapistCurrentLocation?.[0],
    therapistCurrentLocation?.[1],
    therapistLiveLocation?.[0],
    therapistLiveLocation?.[1],
    patientViewTherapistLocation?.[0],
    patientViewTherapistLocation?.[1],
    isPatient,
  ]);

  // Load/hide route layer when toggled - use saved location for routing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    console.log("🛣️ [WebMap] Route effect triggered");
    console.log("  - showRoute:", showRoute);
    console.log("  - dest:", dest);
    console.log("  - therapistLiveLocation:", therapistLiveLocation);
    console.log("  - isPatient:", isPatient);

    // For patients, don't show route
    if (isPatient) {
      console.log("  - Patient view, skipping route");
      return;
    }

    if (!showRoute) {
      // Remove existing route layer/source
      if (map.getLayer(routeLayerId.current))
        map.removeLayer(routeLayerId.current);
      if (map.getSource(routeLayerId.current))
        map.removeSource(routeLayerId.current);
      console.log("  - Route hidden/removed");
      return;
    }

    // Wait for therapist location to be available (live or saved)
    if (!routeFromLocation || !dest) {
      console.log("  - Missing routeFromLocation or dest, waiting...");
      console.log("    routeFromLocation:", routeFromLocation);
      console.log("    dest:", dest);
      return;
    }

    let cancelled = false;
    const draw = async () => {
      try {
        console.log(
          "🛣️ [WebMap] Fetching route from",
          routeFromLocation,
          "to",
          dest,
        );
        setIsLoadingRoute(true);
        const quant = (v: number) => Math.round(v * 1e4) / 1e4;
        const line = await fetchDirections(
          [quant(routeFromLocation[0]), quant(routeFromLocation[1])],
          [quant(dest[0]), quant(dest[1])],
        );

        if (cancelled || !line) {
          console.log("  - Route fetch cancelled or failed");
          return;
        }

        console.log("✅ [WebMap] Route fetched successfully");

        if (map.getSource(routeLayerId.current)) {
          (map.getSource(routeLayerId.current) as any).setData(line);
        } else {
          map.addSource(routeLayerId.current, {
            type: "geojson",
            data: line as any,
          });
          map.addLayer({
            id: routeLayerId.current,
            type: "line",
            source: routeLayerId.current,
            paint: { "line-color": "#2563EB", "line-width": 4 },
          });
        }

        // Fit bounds to show both locations
        const coords = line.geometry.coordinates;
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40 },
        );
      } catch (e) {
        console.error("❌ [WebMap] Failed to toggle route:", e);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    draw();

    return () => {
      cancelled = true;
    };
  }, [
    showRoute,
    dest?.[0],
    dest?.[1],
    routeFromLocation?.[0],
    routeFromLocation?.[1],
    isPatient,
  ]);

  return (
    <View style={styles.webMapWrap}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {title ? <div style={styles.webTitle as any}>{title}</div> : null}

      {/* Therapist location sharing notification - Patient only */}
      {isPatient && isTherapistSharing && (
        <View
          style={[
            styles.webTherapistSharingBanner,
            !isConnected && styles.bannerOffline,
          ]}
        >
          <View style={styles.bannerContent}>
            <View
              style={[
                styles.liveIndicator,
                !isConnected && styles.offlineIndicator,
              ]}
            />
            <View style={styles.bannerTextContainer}>
              <Text style={styles.bannerText}>
                {isConnected ? "🚗 Live Tracking Active" : "📡 Connection Lost"}
              </Text>
              <Text style={styles.bannerSubtext}>
                {isConnected ? "Real-time location updates" : "Reconnecting..."}
              </Text>
            </View>
            <View
              style={[styles.liveBadge, !isConnected && styles.offlineBadge]}
            >
              <Text style={styles.liveBadgeText}>
                {isConnected ? "LIVE" : "OFFLINE"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Show Route button - Therapist only */}
      {!isPatient && (
        <View style={styles.routeButtonContainer}>
          <TouchableOpacity
            style={[styles.routeButton, showRoute && styles.routeButtonActive]}
            onPress={() => setShowRoute((s) => !s)}
          >
            <Text
              style={[
                styles.routeButtonText,
                showRoute && styles.routeButtonTextActive,
              ]}
            >
              {isLoadingRoute
                ? "Loading..."
                : showRoute
                  ? "Hide Route"
                  : "Show Route"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  mapContainer: { flex: 1 },
  pinWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  meDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2563EB",
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
  },
  errorBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    opacity: 0.9,
  },
  errorText: { color: "#fff", fontSize: 12 },
  webMapWrap: { flex: 1 },
  webTitle: {
    position: "absolute",
    left: 12,
    top: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    // border is only supported on web; on native, borderWidth/borderColor should be used
    borderWidth: Platform.OS === "web" ? undefined : 1,
    borderColor: Platform.OS === "web" ? undefined : "#E5E7EB",
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    color: "#111",
  },
  webRouteToggle: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  controlsContainer: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 10,
    gap: 8,
  },
  webControlsContainer: {
    position: "absolute",
    right: 12,
    top: 12,
    gap: 8,
    flexDirection: "column",
  },
  locationShareToggleContainer: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minWidth: 200,
  },
  locationShareToggleButton: {
    // No additional styles needed - container handles background
  },
  locationShareToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  locationShareToggleTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  locationShareToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  locationShareToggleSubtext: {
    fontSize: 12,
    color: "#6B7280",
    marginLeft: 18,
  },
  locationShareToggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    paddingHorizontal: 2,
    alignItems: "flex-start",
  },
  locationShareToggleSwitchActive: {
    backgroundColor: "#089769",
    alignItems: "flex-end",
  },
  locationShareToggleSwitchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  locationShareIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  locationShareIndicatorActive: {
    backgroundColor: "#FFFFFF",
  },
  locationShareText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12,
  },
  locationShareTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  realtimeMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#10B981",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  realtimeMarkerPulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    backgroundColor: "transparent",
    top: -7,
    left: -7,
    opacity: 0.6,
  },
  // GPS toggle styles
  gpsToggleWrap: {
    position: "absolute",
    right: 12,
    top: 56,
    zIndex: 10,
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  gpsBtnActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  gpsBtnText: { color: "#111827", fontWeight: "600", fontSize: 12 },
  gpsBtnTextActive: { color: "#FFFFFF", fontWeight: "600", fontSize: 12 },
  webGpsToggle: {
    position: "absolute",
    right: 12,
    top: 52,
  },
  // Edit location styles
  editControlsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#089769",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  editBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  editActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cancelEditBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  cancelEditBtnText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  saveLocationBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#089769",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  saveLocationBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  editHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  pinEditMode: {
    // Visual indicator when in edit mode - slightly larger/different animation
  },
  // Route toggle button styles (native)
  routeToggleWrap: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
  },
  routeBtn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  routeBtnActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  routeBtnText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  routeBtnTextActive: {
    color: "#FFFFFF",
  },
  // Therapist sharing notification styles
  therapistSharingBanner: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    zIndex: 10,
  },
  webTherapistSharingBanner: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    zIndex: 10,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerTextContainer: {
    flex: 1,
  },
  liveIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  bannerText: {
    color: "#065F46",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  bannerSubtext: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "500",
  },
  liveBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#059669",
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  therapistSelfMarker: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  therapistSelfMarkerText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  // Apple Maps-style live location markers
  therapistLiveMarker: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  therapistLiveMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 3,
  },
  therapistLivePulse: {
    position: "absolute",
    borderRadius: 25,
    backgroundColor: "rgba(0, 122, 255, 0.3)",
  },
  therapistLivePulse1: {
    width: 30,
    height: 30,
    top: 5,
    left: 5,
  },
  therapistLivePulse2: {
    width: 40,
    height: 40,
    top: 0,
    left: 0,
  },
  therapistSelfLocationMarker: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  therapistSelfLocationInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 3,
  },
  therapistSelfLocationArrow: {
    position: "absolute",
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
    zIndex: 2,
  },
  therapistSelfPulse: {
    position: "absolute",
    borderRadius: 25,
    backgroundColor: "rgba(0, 122, 255, 0.2)",
  },
  therapistSelfPulse1: {
    width: 34,
    height: 34,
    top: 5,
    left: 5,
  },
  therapistSelfPulse2: {
    width: 44,
    height: 44,
    top: 0,
    left: 0,
  },

  // Route button styles
  routeButtonContainer: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
  },
  routeButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  routeButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  routeButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 14,
  },
  routeButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  // Offline/Reconnecting Styles
  bannerOffline: {
    backgroundColor: "#FFF7ED",
    borderColor: "#F97316",
  },
  offlineIndicator: {
    backgroundColor: "#F97316",
  },
  offlineBadge: {
    backgroundColor: "#F97316",
    borderColor: "#EA580C",
  },
});
